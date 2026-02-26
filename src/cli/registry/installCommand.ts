import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";

import { ensureRegistryDirs, readRegistryIndex } from "./registryUtils";

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

export async function installCommand(argv: string[]) {
  const registryDir = getArg(argv, "--registry") ?? "./registry";
  const id = getArg(argv, "--id");
  const version = getArg(argv, "--version");
  const storeDir = getArg(argv, "--store") ?? "./agents";

  if (!id || !version) {
    console.error("Usage: oap install --registry <dir> --id <agent_id> --version <v> [--store <dir>]");
    process.exit(1);
  }

  const { indexPath, packagesDir, abs } = ensureRegistryDirs(registryDir);
  const idx = readRegistryIndex(indexPath);

  const agent = idx.agents.find((a) => a.agent_id === id);
  if (!agent) {
    console.error(`Agent not found in registry: ${id}`);
    process.exit(1);
  }

  const ver = agent.versions[version];
  if (!ver) {
    console.error(`Version not found: ${id}@${version}`);
    process.exit(1);
  }

  const pkgPath = path.join(packagesDir, ver.package.filename);
  if (!fs.existsSync(pkgPath)) {
    console.error(`Package file missing: ${pkgPath}`);
    process.exit(1);
  }

  // Extract
  const zip = new AdmZip(pkgPath);
  const manifest = readManifestFromZip(zip);

  if (!manifest?.agent_id || !manifest?.version) {
    console.error("Invalid package: manifest.json missing agent_id/version");
    process.exit(1);
  }

  // Hard safety checks
  if (manifest.agent_id !== id || manifest.version !== version) {
    console.error("Package manifest mismatch (agent_id/version). Refusing install.");
    process.exit(1);
  }

  const out = path.resolve(storeDir, id, version);
  fs.mkdirSync(out, { recursive: true });

  zip.extractAllTo(out, true);

  console.log("✅ Installed agent from registry:");
  console.log(`- Registry: ${abs}`);
  console.log(`- Installed to: ${out}`);
}