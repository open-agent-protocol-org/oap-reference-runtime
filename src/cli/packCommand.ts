import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";

import { loadAgent } from "../agent/loadAgent";
import { validateManifest } from "../manifest/validateManifest";

function getArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const value = argv[idx + 1];
  return value ?? null;
}

function safeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function packCommand(argv: string[]) {
  const agentPath = getArg(argv, "--agent");
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

  if (!agentId || !version) {
    console.error("manifest.json must include agent_id and version");
    process.exit(1);
  }

  const outDir = path.resolve("packages");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const fileBase = `${safeFileName(agentId)}-${safeFileName(version)}`;
  const outFile = path.join(outDir, `${fileBase}.oap`); // .oap (zip container)

  const absAgentDir = path.resolve(agentPath);
  if (!fs.existsSync(absAgentDir)) {
    console.error(`Agent directory not found: ${absAgentDir}`);
    process.exit(1);
  }

  // Create zip
  const output = fs.createWriteStream(outFile);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("warning", (err) => {
      console.warn("archiver warning:", err);
    });
    archive.on("error", reject);
  });

  archive.pipe(output);

  // Include entire agent folder, ignore common junk
  archive.glob("**/*", {
    cwd: absAgentDir,
    dot: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.DS_Store"]
  });

  await archive.finalize();
  await done;

  console.log("✅ Packed agent:");
  console.log(`- ${outFile}`);
}