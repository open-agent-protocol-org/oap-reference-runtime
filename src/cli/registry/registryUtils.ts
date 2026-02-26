import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { RegistryIndexV01 } from "./registryTypes";

export function ensureRegistryDirs(registryDir: string) {
  const abs = path.resolve(registryDir);
  const packagesDir = path.join(abs, "packages");
  if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
  if (!fs.existsSync(packagesDir)) fs.mkdirSync(packagesDir, { recursive: true });
  return { abs, packagesDir, indexPath: path.join(abs, "index.json") };
}

export function readRegistryIndex(indexPath: string): RegistryIndexV01 {
  if (!fs.existsSync(indexPath)) {
    return { registry_version: "0.1", generated_at: "", agents: [] };
  }
  const raw = fs.readFileSync(indexPath, "utf-8");
  const parsed = JSON.parse(raw);
  // minimal safety
  if (!parsed.registry_version) parsed.registry_version = "0.1";
  if (!parsed.agents) parsed.agents = [];
  if (!parsed.generated_at) parsed.generated_at = "";
  return parsed as RegistryIndexV01;
}

export function writeRegistryIndex(indexPath: string, idx: RegistryIndexV01) {
  idx.generated_at = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(idx, null, 2), "utf-8");
}

export function sha256FileHex(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  const hash = createHash("sha256").update(buf).digest("hex");
  return hash;
}

export function fileSizeBytes(filePath: string): number {
  return fs.statSync(filePath).size;
}

export function safeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}