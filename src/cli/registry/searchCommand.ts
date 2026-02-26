import { ensureRegistryDirs, readRegistryIndex } from "./registryUtils";

function getArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const value = argv[idx + 1];
  return value ?? null;
}

function extractQueryTokens(argv: string[]): string[] {
  // argv: [node, cli, "search", ...]
  const tokens: string[] = [];
  for (let i = 3; i < argv.length; i++) {
    const t = argv[i];

    // Skip flags + their values
    if (t === "--registry" || t === "--store" || t === "--id" || t === "--version") {
      i++; // skip value
      continue;
    }

    // Skip any other --flag (and try to skip its value if it exists and isn't another flag)
    if (t.startsWith("--")) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) i++;
      continue;
    }

    tokens.push(t);
  }
  return tokens;
}

export async function searchCommand(argv: string[]) {
  const registryDir = getArg(argv, "--registry") ?? "./registry";

  const q = extractQueryTokens(argv).join(" ").trim().toLowerCase();
  if (!q) {
    console.error("Usage: oap search --registry <dir> <query>");
    process.exit(1);
  }

  const { indexPath, abs } = ensureRegistryDirs(registryDir);
  const idx = readRegistryIndex(indexPath);

  const matches = idx.agents.filter((a) => {
    return (
      a.agent_id.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q)
    );
  });

  if (matches.length === 0) {
    console.log(`No matches in registry: ${abs}`);
    return;
  }

  console.log(`Matches in registry: ${abs}\n`);
  for (const a of matches) {
    console.log(`- ${a.agent_id} (${a.latest_version}) — ${a.name}`);
    console.log(`  ${a.description}`);
    console.log(`  Versions: ${Object.keys(a.versions).sort().join(", ")}\n`);
  }
}