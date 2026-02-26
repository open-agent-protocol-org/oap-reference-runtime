import * as fs from "fs";
import * as path from "path";

function getArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const value = argv[idx + 1];
  return value ?? null;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readJsonIfExists(p: string): any | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export async function agentsCommand(argv: string[]) {
  const sub = argv[3] ?? "list";
  const storeDir = getArg(argv, "--store") ?? "./agents";
  const absStore = path.resolve(storeDir);

  if (sub !== "list") {
    console.error(`Unknown subcommand: agents ${sub}`);
    console.log("Usage: oap agents list [--store <dir>]");
    process.exit(1);
  }

  if (!fs.existsSync(absStore) || !isDir(absStore)) {
    console.log(`No agents store found at: ${absStore}`);
    return;
  }

  const agentIds = fs
    .readdirSync(absStore)
    .map((n) => path.join(absStore, n))
    .filter(isDir);

  const rows: Array<{
    agent_id: string;
    version: string;
    name?: string;
    description?: string;
    path: string;
  }> = [];

  for (const agentDir of agentIds) {
    const agentId = path.basename(agentDir);

    const versions = fs
      .readdirSync(agentDir)
      .map((n) => path.join(agentDir, n))
      .filter(isDir);

    for (const verDir of versions) {
      const version = path.basename(verDir);
      const manifestPath = path.join(verDir, "manifest.json");
      const manifest = readJsonIfExists(manifestPath);

      rows.push({
        agent_id: manifest?.agent_id ?? agentId,
        version: manifest?.version ?? version,
        name: manifest?.name,
        description: manifest?.description,
        path: verDir
      });
    }
  }

  // Sort: agent_id then version
  rows.sort((a, b) => {
    const ai = a.agent_id.localeCompare(b.agent_id);
    if (ai !== 0) return ai;
    return a.version.localeCompare(b.version);
  });

  if (rows.length === 0) {
    console.log(`No installed agents found in: ${absStore}`);
    return;
  }

  // Pretty output
  console.log(`Installed agents (store: ${absStore}):\n`);
  for (const r of rows) {
    const title = r.name ? ` — ${r.name}` : "";
    console.log(`- ${r.agent_id}@${r.version}${title}`);
    if (r.description) console.log(`  ${r.description}`);
    console.log(`  Path: ${r.path}\n`);
  }
}