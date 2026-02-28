import fs from "fs";
import path from "path";

import { isHttpUrl, httpGetJson, joinUrl } from "./http";
import { loadTrust, isPublisherTrusted } from "./trustUtils";

function loadIndexFromFs(registryPath: string): any {
  const indexPath = path.join(registryPath, "index.json");
  if (!fs.existsSync(indexPath)) throw new Error(`Registry index not found: ${indexPath}`);
  return JSON.parse(fs.readFileSync(indexPath, "utf-8"));
}

async function loadIndex(registry: string): Promise<any> {
  if (isHttpUrl(registry)) return httpGetJson<any>(joinUrl(registry, "index.json"));
  return loadIndexFromFs(registry);
}

function parseRegistryAndQuery(args: string[]): { registry: string; query: string } {
  let registry = "./registry";

  const r = args.indexOf("--registry");
  if (r !== -1 && args[r + 1]) registry = args[r + 1];

  const registryValue = r !== -1 ? args[r + 1] : null;

  const candidates = args.filter((t) => {
    if (!t) return false;
    if (t === "search") return false;
    if (t === "--registry") return false;
    if (t.startsWith("--")) return false;
    if (registryValue && t === registryValue) return false;
    return true;
  });

  const query = candidates.length ? candidates[candidates.length - 1] : "";
  return { registry, query };
}

type PublisherProfile = {
  publisher_id: string;
  display_name: string;
  public_key_ed25519?: string | null;
  trusted?: boolean;
  denylisted?: boolean;
  reputation?: {
    score: number;
    level: string;
  };
};

type SourceInfo =
  | { type: "local" }
  | { type: "federated"; name: string; url: string; trust_level: string };

type UnifiedRow = { agent: any; source: SourceInfo };

async function fetchPublisherProfile(registryUrl: string, publisherId: string): Promise<PublisherProfile | null> {
  if (!isHttpUrl(registryUrl)) return null;
  try {
    const url = joinUrl(registryUrl, `publisher/${encodeURIComponent(publisherId)}.json`);
    return await httpGetJson<PublisherProfile>(url);
  } catch {
    return null;
  }
}

function matchesQuery(a: any, q: string) {
  if (!q) return true;
  const agentId = String(a?.agent_id ?? "").toLowerCase();
  const name = String(a?.name ?? "").toLowerCase();
  const desc = String(a?.description ?? "").toLowerCase();
  return agentId.includes(q) || name.includes(q) || desc.includes(q);
}

function computeReputationFallback(agentEntries: any[], trusted: boolean, denylisted: boolean) {
  const agentsCount = agentEntries.length;
  const versionsCount = agentEntries.reduce((sum, a) => {
    const vs = a?.versions ? Object.keys(a.versions).length : 0;
    return sum + vs;
  }, 0);

  let score = 0;
  if (denylisted) score -= 100;
  if (trusted) score += 5;
  score += agentsCount * 2;
  score += versionsCount * 1;

  let level = "new";
  if (denylisted) level = "denylisted";
  else if (trusted && score >= 10) level = "trusted";
  else if (score >= 5) level = "known";

  return { score, level };
}

function normalizeTrustLevel(t: string): "trusted" | "neutral" | "restricted" | "blocked" {
  const v = String(t || "neutral").toLowerCase();
  if (v === "trusted") return "trusted";
  if (v === "restricted") return "restricted";
  if (v === "blocked") return "blocked";
  return "neutral";
}

function sourcePriority(s: SourceInfo): number {
  // Higher = better for dedupe selection
  if (s.type === "local") return 100;

  const tl = normalizeTrustLevel(s.trust_level);

  // IMPORTANT (v0.3):
  // restricted/blocked should never win over neutral/trusted/local
  if (tl === "blocked") return -1000;
  if (tl === "restricted") return -500;

  if (tl === "trusted") return 50;
  return 20; // neutral
}

function formatSourceTag(s: SourceInfo) {
  if (s.type === "local") return "[LOCAL]";

  const tl = normalizeTrustLevel(s.trust_level);
  const tlTag =
    tl === "trusted"
      ? "SOURCE: TRUSTED"
      : tl === "restricted"
      ? "SOURCE: RESTRICTED"
      : tl === "blocked"
      ? "SOURCE: BLOCKED"
      : "SOURCE: NEUTRAL";

  return `[FEDERATED: ${s.name}]  [${tlTag}]`;
}

export async function searchCommand(args: string[]) {
  const { registry, query } = parseRegistryAndQuery(args);
  const q = (query || "").trim().toLowerCase();

  const trust = await loadTrust(registry);

  // ------------------------
  // HTTP registry: use federated-index.json if available
  // ------------------------
  if (isHttpUrl(registry)) {
    let fed: any | null = null;

    try {
      fed = await httpGetJson<any>(joinUrl(registry, "federated-index.json"));
    } catch {
      fed = null;
    }

    const localIndex = await loadIndex(registry);
    const localAgents = Array.isArray(localIndex?.agents) ? localIndex.agents : [];

    const unified: UnifiedRow[] = [];
    for (const a of localAgents) unified.push({ agent: a, source: { type: "local" } });

    if (fed && Array.isArray(fed?.external)) {
      for (const ext of fed.external) {
        const name = String(ext?.source ?? "Unknown");
        const url = String(ext?.url ?? "");
        const trust_level = String(ext?.trust_level ?? "neutral");
        const extAgents = Array.isArray(ext?.agents) ? ext.agents : [];
        for (const a of extAgents) {
          unified.push({ agent: a, source: { type: "federated", name, url, trust_level } });
        }
      }
    }

    const matches = unified.filter(({ agent }) => matchesQuery(agent, q));
    if (matches.length === 0) {
      console.log(`No matches in registry: ${registry}`);
      return;
    }

    // ------------------------
    // DEDUPE: keep best entry per agent_id
    // (restricted/blocked can appear, but will never "win")
    // ------------------------
    const bestByAgentId = new Map<string, UnifiedRow>();

    for (const row of matches) {
      const agentId = String(row.agent?.agent_id ?? "");
      if (!agentId) continue;

      const prev = bestByAgentId.get(agentId);
      if (!prev) {
        bestByAgentId.set(agentId, row);
        continue;
      }

      const prevP = sourcePriority(prev.source);
      const currP = sourcePriority(row.source);

      if (currP > prevP) bestByAgentId.set(agentId, row);
      // tie => keep first
    }

    const finalRows = Array.from(bestByAgentId.values());

    console.log(`Matches in registry: ${registry}\n`);

    // Cache profiles per (registryUrl, publisherId)
    const profileCache = new Map<string, PublisherProfile | null>();
    const cacheKey = (regUrl: string, pubId: string) => `${regUrl}::${pubId}`;

    for (const { agent: a, source } of finalRows) {
      const publisherId = a?.publisher?.publisher_id as string | undefined;
      const publisherName = a?.publisher?.display_name as string | undefined;

      const trusted = isPublisherTrusted(trust, publisherId);
      const badge = trusted ? "✅ TRUSTED" : "⚠ UNVERIFIED";

      console.log(`- ${a.agent_id}@${a.latest_version} — ${a.name}  [${badge}]  ${formatSourceTag(source)}`);
      if (a.description) console.log(`  ${a.description}`);

      if (publisherId) {
        console.log(`  Publisher: ${publisherName ?? "Unknown"} (${publisherId})`);

        // Source-aware profile fetch:
        const profileRegistryUrl = source.type === "local" ? registry : source.url;

        const key = cacheKey(profileRegistryUrl, publisherId);
        if (!profileCache.has(key)) {
          profileCache.set(key, await fetchPublisherProfile(profileRegistryUrl, publisherId));
        }

        const profile = profileCache.get(key);

        if (profile?.reputation?.score !== undefined && profile?.reputation?.level) {
          console.log(`  Reputation: ${profile.reputation.score} (${profile.reputation.level})`);
        } else {
          // fallback: compute from scoped agents
          const scopedAgents =
            source.type === "local"
              ? localAgents
              : unified
                  .filter((r) => r.source.type !== "local" && (r.source as any).url === source.url)
                  .map((r) => r.agent);

          const owned = scopedAgents.filter((x: any) => x?.publisher?.publisher_id === publisherId);
          const rep = computeReputationFallback(owned, trusted, false);
          console.log(`  Reputation: ${rep.score} (${rep.level})`);
        }
      }
    }

    return;
  }

  // ------------------------
  // Local registry path: no federation in v0.3
  // ------------------------
  const index = await loadIndex(registry);
  const agents = Array.isArray(index?.agents) ? index.agents : [];

  if (agents.length === 0) {
    console.log(`No agents found in registry: ${registry}`);
    return;
  }

  const matches = agents.filter((a: any) => matchesQuery(a, q));
  if (matches.length === 0) {
    console.log(`No matches in registry: ${registry}`);
    return;
  }

  console.log(`Matches in registry: ${registry}\n`);

  for (const a of matches) {
    const publisherId = a?.publisher?.publisher_id as string | undefined;
    const publisherName = a?.publisher?.display_name as string | undefined;

    const trusted = isPublisherTrusted(trust, publisherId);
    const badge = trusted ? "✅ TRUSTED" : "⚠ UNVERIFIED";

    console.log(`- ${a.agent_id}@${a.latest_version} — ${a.name}  [${badge}]  [LOCAL]`);
    if (a.description) console.log(`  ${a.description}`);

    if (publisherId) {
      console.log(`  Publisher: ${publisherName ?? "Unknown"} (${publisherId})`);
      const owned = agents.filter((x: any) => x?.publisher?.publisher_id === publisherId);
      const rep = computeReputationFallback(owned, trusted, false);
      console.log(`  Reputation: ${rep.score} (${rep.level})`);
    }
  }
}