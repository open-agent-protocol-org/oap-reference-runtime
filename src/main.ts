import { loadAgent } from "./agent/loadAgent";
import { validateManifest } from "./manifest/validateManifest";
import { permissionsPrompt } from "./permissions/permissionsPrompt";
import { runAgent } from "./engine/runAgent";
import { writeAuditLog } from "./logging/auditLogger";

import { registerTool, invokeTool, listTools } from "./tools/toolRegistry";
import { mockEcho, mockEchoDescriptor } from "./tools/mockEcho";

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  return value ?? null;
}

export async function main() {
  console.log("OAP Reference Runtime v0.1 starting...");

  const installedId = getArg("--installed");
const installedVer = getArg("--version");
const storeDir = getArg("--store") ?? "./agents";

let agentPath =
  getArg("--agent") ?? "./examples/daily-planner-agent";

if (installedId) {
  if (!installedVer) {
    console.error("Missing --version <version> when using --installed");
    process.exit(1);
  }
  agentPath = `${storeDir}/${installedId}/${installedVer}`;
}
  console.log(`Loading agent from: ${agentPath}`);

  const loaded = loadAgent(agentPath);

  const validation = validateManifest(loaded.manifestRaw);
  if (validation.ok === false) {
    console.error("Manifest validation failed:");
    for (const err of validation.errors ?? []) console.error(`- ${err}`);
    process.exit(1);
  }
  console.log("Manifest validation: OK ✅");

  const permissions = (loaded.manifestRaw as any).permissions as string[] | undefined;
  const allowedTools = ((loaded.manifestRaw as any).tools as string[] | undefined) ?? [];

  const approved = await permissionsPrompt(permissions ?? []);
  if (!approved) {
    console.error("Permission denied. Exiting.");
    process.exit(1);
  }
  console.log("Permissions approved ✅");

  // Register runtime tools + descriptors
  registerTool(mockEchoDescriptor, mockEcho);

  console.log("\nAvailable tools:");
  console.log(JSON.stringify(listTools(), null, 2));

  const agentId = (loaded.manifestRaw as any).agent_id as string;

  const execution = await runAgent(agentId, {
    triggerType: "manual",
    approvedPermissions: permissions ?? [],
    allowedTools,
    invokeTool,
  });

  const logPath = writeAuditLog({
    executionId: execution.executionId,
    agentId,
    timestamp: new Date().toISOString(),
    triggerType: "manual",
    permissions: permissions ?? [],
    status: execution.status,
    output: execution.output,
    toolCalls: execution.toolCalls,
  });

  console.log(`Audit log written: ${logPath}`);

  console.log("Execution Result:");
  console.log(JSON.stringify(execution, null, 2));
}