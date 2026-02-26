import { ToolDescriptor, ToolResult } from "./toolRegistry";

export const mockEchoDescriptor: ToolDescriptor = {
  name: "tools.mock_echo",
  title: "Mock Echo",
  description: "Returns the provided input as output. Used for testing tool routing.",
  version: "0.1.0",
  permissionsRequired: ["notifications.send"],
  inputSchema: {
    type: "object",
    additionalProperties: true,
    description: "Any JSON object will be echoed back."
  },
  outputSchema: {
    type: "object",
    required: ["echoed", "message"],
    properties: {
      echoed: { description: "The original input." },
      message: { type: "string" }
    }
  }
};

export async function mockEcho(input: unknown): Promise<ToolResult> {
  return {
    ok: true,
    output: {
      echoed: input,
      message: "This is a mock tool response."
    }
  };
}