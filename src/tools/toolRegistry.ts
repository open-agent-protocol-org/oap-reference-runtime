export type JsonSchema = Record<string, unknown>;

export type ToolCall = {
  name: string;
  input: unknown;
};

export type ToolResult =
  | { ok: true; output: unknown }
  | { ok: false; error: string };

export type ToolHandler = (input: unknown) => Promise<ToolResult>;

export type ToolDescriptor = {
  name: string;
  title: string;
  description: string;
  version: string;
  permissionsRequired: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
};

type ToolDefinition = {
  descriptor: ToolDescriptor;
  handler: ToolHandler;
};

const registry: Record<string, ToolDefinition> = {};

export function registerTool(descriptor: ToolDescriptor, handler: ToolHandler) {
  registry[descriptor.name] = { descriptor, handler };
}

export function getToolDescriptor(name: string): ToolDescriptor | null {
  return registry[name]?.descriptor ?? null;
}

export function listTools(): ToolDescriptor[] {
  return Object.values(registry).map((d) => d.descriptor);
}

export async function invokeTool(
  call: ToolCall,
  approvedPermissions: string[]
): Promise<ToolResult> {
  const def = registry[call.name];
  if (!def) return { ok: false, error: `Unknown tool: ${call.name}` };

  const missing = def.descriptor.permissionsRequired.filter(
    (p) => !approvedPermissions.includes(p)
  );

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Permission denied for tool ${call.name}. Missing: ${missing.join(", ")}`
    };
  }

  return def.handler(call.input);
}