import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";

import { loadOrCreatePublisher, signPayloadEd25519 } from "../../crypto/signing";
import { loadAgent } from "../../agent/loadAgent";
import { validateManifest } from "../../manifest/validateManifest";

import {
  ensureRegistryDirs,
  readRegistryIndex,
  writeRegistryIndex,
  sha256FileHex,
  fileSizeBytes,
  safeFileName,
} from "./registryUtils";

function getArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const value = argv[idx + 1];
  return value ?? null;
}

async function packToFile(agentDir: string, outFile: string) {
  const absAgentDir = path.resolve(agentDir);

  const output = fs.createWriteStream(outFile);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("warning", (err) => console.warn("archiver warning:", err));
    archive.on("error", reject);
  });

  archive.pipe(output);

  archive.glob("**/*", {
    cwd: absAgentDir,
    dot: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.DS_Store"],
  });

  await archive.finalize();
  await done;
}

export async function publishCommand(argv: string[]) {
  const agentPath = getArg(argv, "--agent");
  const registryDir = getArg(argv, "--registry") ?? "./registry";

  if (!agentPath) {
    console.error("Missing --agent <path>");
    process.exit(1);
  }

  // Load + validate manifest
  const loaded = loadAgent(agentPath);
  const validation = validateManifest(loaded.manifestRaw);
  if (validation.ok === false) {
    console.error("Manifest validation failed:");
    for (const err of validation.errors ?? []) console.error(`- ${err}`);
    process.exit(1);
  }

  const agentId = (loaded.manifestRaw as any).agent_id as string | undefined;
  const version = (loaded.manifestRaw as any).version as string | undefined;
  const name = (loaded.manifestRaw as any).name as string | undefined;
  const description = (loaded.manifestRaw as any).description as string | undefined;
  const oapVersion = (loaded.manifestRaw as any).oap_version as string | undefined;
  const permissions = (loaded.manifestRaw as any).permissions as string[] | undefined;
  const tools = (loaded.manifestRaw as any).tools as string[] | undefined;

  if (!agentId || !version || !name || !description) {
    console.error("manifest.json must include agent_id, version, name, description");
    process.exit(1);
  }

  // Ensure registry folders exist
  const { packagesDir, indexPath, abs } = ensureRegistryDirs(registryDir);

  // Pack agent into .oap
  const filename = `${safeFileName(agentId)}-${safeFileName(version)}.oap`;
  const outFile = path.join(packagesDir, filename);

  await packToFile(agentPath, outFile);

  // Compute package integrity
  const sha256 = sha256FileHex(outFile);
  const size = fileSizeBytes(outFile);

  // Read registry index
  const idx = readRegistryIndex(indexPath);

  // Load (or create) publisher identity (stored locally in ~/.oap/publisher.json)
  const publisher = loadOrCreatePublisher();

  // Upsert agent entry
  let agentEntry = idx.agents.find((a) => a.agent_id === agentId);
  if (!agentEntry) {
    agentEntry = {
      agent_id: agentId,
      name,
      description,
      publisher: {
        display_name: publisher.display_name,
        publisher_id: publisher.publisher_id,
        public_key_ed25519: publisher.public_key_ed25519,
      },
      latest_version: version,
      versions: {},
    };
    idx.agents.push(agentEntry);
  } else {
    // Keep name/description updated
    agentEntry.name = name;
    agentEntry.description = description;

    // Ensure publisher exists + has public key
    agentEntry.publisher = {
      display_name: publisher.display_name,
      publisher_id: publisher.publisher_id,
      public_key_ed25519: publisher.public_key_ed25519,
    };
  }

  // Manifest snapshot stored in index
  const manifestSnapshot = {
    oap_version: oapVersion,
    agent_id: agentId,
    version,
    permissions,
    tools,
  };

  // Sign payload (OAP Registry v0.1, Trust v0.2 draft)
  const signedAt = new Date().toISOString();
  const signingPayload = {
    agent_id: agentId,
    version,
    package_sha256: sha256,
    manifest: manifestSnapshot,
    signed_at: signedAt,
  };

  const { signatureBase64, payloadSha256 } = signPayloadEd25519(
    signingPayload,
    publisher.private_key_ed25519
  );

  // Write version entry
  agentEntry.versions[version] = {
    package: {
      filename,
      sha256,
      size_bytes: size,
      download_url: `packages/${filename}`, // local-mode relative
    },
    manifest: manifestSnapshot,
    signature: {
      alg: "ed25519",
      signed_at: signedAt,
      payload_sha256: payloadSha256,
      signature: signatureBase64,
    },
  };

  // Update latest_version (simple lex compare; later: semver)
  agentEntry.latest_version = Object.keys(agentEntry.versions).sort().slice(-1)[0];

  // Update registry metadata
  idx.generated_at = new Date().toISOString();

  // Persist
  writeRegistryIndex(indexPath, idx);

  console.log("✅ Published to registry:");
  console.log(`- Registry: ${abs}`);
  console.log(`- Package:  ${outFile}`);
  console.log(`- SHA256:   ${sha256}`);
  console.log(`- Signed:   ed25519 (${publisher.publisher_id})`);
}