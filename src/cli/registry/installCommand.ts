import fs from "fs";
import path from "path";
import http from "http";
import https from "https";

import { isHttpUrl, httpGetJson, joinUrl } from "./http";

function getArg(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  return value ? String(value) : undefined;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeTrustLevel(t: string): "trusted" | "neutral" | "restricted" | "blocked" {
  const v = String(t || "neutral").toLowerCase();
  if (v === "trusted") return "trusted";
  if (v === "restricted") return "restricted";
  if (v === "blocked") return "blocked";
  return "neutral";
}

function ensureAgentsStore(storeDir?: string) {
  const dir = storeDir ? path.resolve(storeDir) : path.resolve(process.cwd(), "agents");
  ensureDir(dir);
  return dir;
}

function findInIndex(index: any, agentId: string, version: string) {
  const agents = Array.isArray(index?.agents) ? index.agents : [];
  const a = agents.find((x: any) => x?.agent_id === agentId);
  if (!a) return null;
  const v = a?.versions?.[version];
  if (!v) return null;
  return { agent: a, versionEntry: v };
}

async function downloadToFile(fileUrl: string, outPath: string): Promise<void> {
  ensureDir(path.dirname(outPath));

  await new Promise<void>((resolve, reject) => {
    const u = new URL(fileUrl);
    const lib = u.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + (u.search || ""),
        method: "GET",
        headers: { Accept: "*/*" },
      },
      (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} when downloading ${fileUrl}`));
          res.resume();
          return;
        }

        const file = fs.createWriteStream(outPath);
        res.pipe(file);

        file.on("finish", () => file.close(() => resolve()));
        file.on("error", (err) => reject(err));
      }
    );

    req.on("error", reject);
    req.end();
  });
}

type SourcePick =
  | { kind: "local"; baseRegistryUrl: string }
  | { kind: "external"; name: string; url: string; trust_level: "trusted" | "neutral" | "restricted" | "blocked" };

async function pickSourceForAgent(baseRegistryUrl: string, agentId: string): Promise<SourcePick> {
  // 1) If present in local part of federated-index => treat as local
  const fed = await httpGetJson<any>(joinUrl(baseRegistryUrl, "federated-index.json"));
  const localAgents = Array.isArray(fed?.local?.agents) ? fed.local.agents : [];
  if (localAgents.some((a: any) => a?.agent_id === agentId)) {
    return { kind: "local", baseRegistryUrl };
  }

  // 2) Otherwise search in external sources
  const external = Array.isArray(fed?.external) ? fed.external : [];
  for (const ext of external) {
    const extAgents = Array.isArray(ext?.agents) ? ext.agents : [];
    if (extAgents.some((a: any) => a?.agent_id === agentId)) {
      return {
        kind: "external",
        name: String(ext?.source ?? "Unknown"),
        url: String(ext?.url ?? ""),
        trust_level: normalizeTrustLevel(ext?.trust_level ?? "neutral"),
      };
    }
  }

  // Fallback: nothing found
  throw new Error(`Agent not found in federated index: ${agentId}`);
}

export async function installCommand(argv: string[]) {
  const registry = getArg(argv, "--registry") ?? "./registry";
  const agentId = getArg(argv, "--id");
  const version = getArg(argv, "--version");
  const storeDir = getArg(argv, "--store");

  if (!agentId || !version) {
    console.error("Missing required args: --id <agent_id> --version <v>");
    console.error("Usage: oap install --registry <path|url> --id <agent_id> --version <v> [--store <dir>]");
    process.exit(1);
  }

  const store = ensureAgentsStore(storeDir);

  // ------------------------
  // HTTP registry
  // ------------------------
  if (isHttpUrl(registry)) {
    const baseIndex = await httpGetJson<any>(joinUrl(registry, "index.json"));
    let found = findInIndex(baseIndex, agentId, version);

    // If not found in base index, try federated source
    let source: SourcePick = { kind: "local", baseRegistryUrl: registry };

    if (!found) {
      try {
        source = await pickSourceForAgent(registry, agentId);

        if (source.kind === "external") {
          // v0.3 enforcement
          if (source.trust_level === "restricted" || source.trust_level === "blocked") {
            console.error(`❌ Install blocked by federation policy.`);
            console.error(`- Agent: ${agentId}@${version}`);
            console.error(`- Source: FEDERATED: ${source.name}`);
            console.error(`- trust_level: ${source.trust_level}`);
            process.exit(1);
          }

          // fetch index.json from the source registry and find the package there
          const srcIndex = await httpGetJson<any>(joinUrl(source.url, "index.json"));
          found = findInIndex(srcIndex, agentId, version);

          if (!found) {
            console.error(`Agent not found in source registry index: ${source.url}`);
            console.error(`- id: ${agentId}`);
            console.error(`- version: ${version}`);
            process.exit(1);
          }
        } else {
          // source.kind === local but base index didn't have it (weird), treat as not found
          console.error(`Agent not found in registry index: ${registry}`);
          console.error(`- id: ${agentId}`);
          console.error(`- version: ${version}`);
          process.exit(1);
        }
      } catch {
        console.error(`Agent not found in registry index: ${registry}`);
        console.error(`- id: ${agentId}`);
        console.error(`- version: ${version}`);
        process.exit(1);
      }
    }

    // Determine where to download from:
    const downloadBaseUrl = source.kind === "external" ? source.url : registry;

    const pkg = found!.versionEntry?.package;
    const downloadRel = pkg?.download_url as string | undefined;
    const filename = pkg?.filename as string | undefined;

    if (!downloadRel || !filename) {
      console.error("Registry entry missing package.download_url / package.filename");
      process.exit(1);
    }

    const downloadUrl = joinUrl(downloadBaseUrl, downloadRel);

    const tmpDir = path.join(store, ".tmp");
    ensureDir(tmpDir);

    const tmpFile = path.join(tmpDir, filename);
    await downloadToFile(downloadUrl, tmpFile);

    const unpackMod = await import("../unpackCommand");
    await unpackMod.unpackCommand(["unpack", "--file", tmpFile, "--store", store]);

    console.log(`✅ Installed ${agentId}@${version}`);
    return;
  }

  // ------------------------
  // Local registry (filesystem)
  // ------------------------
  const absRegistry = path.resolve(registry);
  const indexPath = path.join(absRegistry, "index.json");

  if (!fs.existsSync(indexPath)) {
    console.error(`Registry index not found: ${indexPath}`);
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  const found = findInIndex(index, agentId, version);

  if (!found) {
    console.error(`Agent not found in registry: ${registry}`);
    console.error(`- id: ${agentId}`);
    console.error(`- version: ${version}`);
    process.exit(1);
  }

  const pkg = found.versionEntry?.package;
  const downloadRel = pkg?.download_url as string | undefined;

  if (!downloadRel) {
    console.error("Registry entry missing package.download_url");
    process.exit(1);
  }

  const pkgPath = path.join(absRegistry, downloadRel);
  if (!fs.existsSync(pkgPath)) {
    console.error(`Package file not found: ${pkgPath}`);
    process.exit(1);
  }

  const unpackMod = await import("../unpackCommand");
  await unpackMod.unpackCommand(["unpack", "--file", pkgPath, "--store", store]);

  console.log(`✅ Installed ${agentId}@${version}`);
}