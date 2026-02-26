import * as fs from "fs";
import * as path from "path";

export type LoadedAgent = {
  agentDir: string;
  manifestPath: string;
  manifestRaw: unknown;
};

export function loadAgent(agentDir: string): LoadedAgent {
  const resolvedDir = path.resolve(agentDir);
  const manifestPath = path.join(resolvedDir, "manifest.json");

  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Agent directory not found: ${resolvedDir}`);
  }

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in: ${resolvedDir}`);
  }

  const raw = fs.readFileSync(manifestPath, "utf-8");
  const manifestRaw = JSON.parse(raw) as unknown;

  return { agentDir: resolvedDir, manifestPath, manifestRaw };
}