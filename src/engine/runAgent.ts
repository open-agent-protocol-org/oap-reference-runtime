import { randomUUID } from "crypto";
import { isToolAllowed } from "../tools/toolPolicy";

export type ExecutionResult = {
  executionId: string;
  status: "success" | "failure";
  output?: string;
  toolCalls?: Array<{
    call: { name: string; input: unknown };
    result: unknown;
  }>;
};

export type RunContext = {
  triggerType: "manual" | "scheduled" | "event";
  approvedPermissions: string[];
  allowedTools: string[];
  invokeTool: (
    call: { name: string; input: unknown },
    approvedPermissions: string[]
  ) => Promise<unknown>;
};

export async function runAgent(agentId: string, ctx: RunContext): Promise<ExecutionResult> {
  const executionId = randomUUID();

  console.log("\n--- Execution Started ---");
  console.log(`Execution ID: ${executionId}`);
  console.log(`Agent ID: ${agentId}`);
  console.log(`Trigger: ${ctx.triggerType}`);

  const toolCalls: ExecutionResult["toolCalls"] = [];

  const toolCall = { name: "tools.mock_echo", input: { hello: "world" } };

  if (!isToolAllowed(toolCall.name, ctx.allowedTools)) {
    console.log("--- Execution Failed ---\n");
    return {
      executionId,
      status: "failure",
      output: `Tool not allowed by manifest: ${toolCall.name}`,
    };
  }

  const toolResult = await ctx.invokeTool(toolCall, ctx.approvedPermissions);
  toolCalls.push({ call: toolCall, result: toolResult });

  await new Promise((r) => setTimeout(r, 600));
  console.log("Simulating agent work...");
  await new Promise((r) => setTimeout(r, 600));

  console.log("--- Execution Completed ---\n");

  // If tool result is the shape from toolRegistry, it will include ok:true/false
  const status =
    (toolResult as any)?.ok === false ? "failure" : "success";

  return {
    executionId,
    status,
    output: status === "success"
      ? "Agent executed successfully (simulation)."
      : `Tool call failed: ${(toolResult as any)?.error ?? "unknown error"}`,
    toolCalls,
  };
}