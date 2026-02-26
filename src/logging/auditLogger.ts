import * as fs from "fs";
import * as path from "path";

export type AuditLog = {
  executionId: string;
  agentId: string;
  timestamp: string; // ISO
  triggerType: "manual" | "scheduled" | "event";
  permissions: string[];
  status: "success" | "failure";
  output?: string;
  toolCalls?: unknown;
};

export function writeAuditLog(entry: AuditLog): string {
  const logsDir = path.resolve("logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  const filePath = path.join(logsDir, `${entry.executionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
  return filePath;
}