export function isToolAllowed(toolName: string, allowedTools: string[]): boolean {
  return allowedTools.includes(toolName);
}