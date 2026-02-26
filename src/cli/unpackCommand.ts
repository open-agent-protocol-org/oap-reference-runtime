import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";

function getArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const value = argv[idx + 1];
  return value ?? null;
}

function readManifestFromZip(zip: AdmZip): any {
  const entry = zip.getEntry("manifest.json");
  if (!entry) return null;
  const raw = entry.getData().toString("utf-8");
  return JSON.parse(raw);
}

export async function unpackCommand(argv: string[]) {
  const filePath = getArg(argv, "--file");
  const toDir = getArg(argv, "--to") ?? "agents";

  if (!filePath) {
    console.error("Missing --file <path-to-.oap>");
    process.exit(1);
  }

  const absFile = path.resolve(filePath);
  if (!fs.existsSync(absFile)) {
    console.error(`File not found: ${absFile}`);
    process.exit(1);
  }

  const zip = new AdmZip(absFile);
  const manifest = readManifestFromZip(zip);

  if (!manifest?.agent_id || !manifest?.version) {
    console.error("Invalid package: manifest.json missing agent_id/version");
    process.exit(1);
  }

  const out = path.resolve(toDir, manifest.agent_id, manifest.version);
  fs.mkdirSync(out, { recursive: true });

  zip.extractAllTo(out, true);

  console.log("✅ Unpacked agent:");
  console.log(`- ${out}`);
}