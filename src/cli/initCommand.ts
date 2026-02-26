import * as fs from "fs";
import * as path from "path";

function getArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const value = argv[idx + 1];
  return value ?? null;
}

export async function initCommand(argv: string[]) {
  const dir = getArg(argv, "--dir") ?? "my-agent";
  const agentId = getArg(argv, "--id") ?? "com.example.myagent";
  const name = getArg(argv, "--name") ?? "My Agent";
  const description =
    getArg(argv, "--desc") ?? "Describe what this agent does.";
  const version = getArg(argv, "--version") ?? "0.1.0";

  const outDir = path.resolve(dir);

  if (fs.existsSync(outDir)) {
    const files = fs.readdirSync(outDir);
    if (files.length > 0) {
      console.error(`Directory not empty: ${outDir}`);
      process.exit(1);
    }
  } else {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const manifest = {
    oap_version: "0.2",
    agent_id: agentId,
    name,
    description,
    author: { name: "Anonymous", contact: "n/a" },
    runtime_compatibility: { models_supported: ["openai:gpt-5"] },
    permissions: ["notifications.send"],
    tools: ["tools.mock_echo"],
    memory: { enabled: true, scope: "per_user" },
    triggers: { manual: true, scheduled: [], events: [] },
    version
  };

  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  const readmePath = path.join(outDir, "README.md");
  const readme = `# ${name}

**Agent ID:** \`${agentId}\`  
**Version:** \`${version}\`

## Description
${description}

## Permissions
${manifest.permissions.map((p) => `- ${p}`).join("\n")}

## Tools
${manifest.tools.map((t) => `- ${t}`).join("\n")}

## Run (Reference Runtime)
\`\`\`bash
oap run --agent ${dir}
\`\`\`
`;
  fs.writeFileSync(readmePath, readme, "utf-8");

  console.log("✅ Agent scaffold created:");
  console.log(`- ${manifestPath}`);
  console.log(`- ${readmePath}`);
}