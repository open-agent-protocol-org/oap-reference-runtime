// registry/server.js
// OAP Registry HTTP Server (index + trust + publisher profiles + packages + reputation + federation v0.1)

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

// Registry directory (where index.json, trust.json, federation.json, packages/ live)
const REGISTRY_DIR = process.env.REGISTRY_DIR
  ? path.resolve(String(process.env.REGISTRY_DIR).trim())
  : path.resolve(process.cwd(), "registry");

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(obj, null, 2));
}

function sendFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found", path: filePath });
    return;
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    sendJson(res, 404, { error: "Not a file", path: filePath });
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
  });

  fs.createReadStream(filePath).pipe(res);
}

function safeJoin(baseDir, requestPath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, "." + requestPath);
  if (!target.startsWith(base)) return null;
  return target;
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function joinUrl(base, rel) {
  const b = String(base || "").replace(/\/+$/, "");
  const r = String(rel || "").replace(/^\/+/, "");
  return `${b}/${r}`;
}

function httpGetJson(targetUrl, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const lib = u.protocol === "https:" ? require("https") : require("http");

    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + (u.search || ""),
        method: "GET",
        headers: { Accept: "application/json" },
        timeout: timeoutMs,
      },
      (resp) => {
        let data = "";
        resp.on("data", (c) => (data += c));
        resp.on("end", () => {
          if (resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Invalid JSON from ${targetUrl}`));
            }
          } else {
            reject(new Error(`HTTP ${resp.statusCode} from ${targetUrl}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`Timeout fetching ${targetUrl}`));
    });
    req.end();
  });
}

function loadFederation() {
  const p = path.join(REGISTRY_DIR, "federation.json");
  const fed = readJsonIfExists(p);
  if (!fed) {
    return {
      federation_version: "0.1",
      follow: [],
    };
  }
  if (!Array.isArray(fed.follow)) fed.follow = [];
  if (!fed.federation_version) fed.federation_version = "0.1";
  return fed;
}

async function buildFederatedIndex() {
  const indexPath = path.join(REGISTRY_DIR, "index.json");
  const local = readJsonIfExists(indexPath) || { agents: [] };

  const federation = loadFederation();

  const external = [];
  for (const f of federation.follow) {
    const name = f?.name || "Unknown";
    const baseUrl = f?.url;
    if (!baseUrl) continue;

    try {
      const idx = await httpGetJson(joinUrl(baseUrl, "index.json"));
      const agents = Array.isArray(idx?.agents) ? idx.agents : [];
      external.push({
        source: name,
        url: baseUrl,
        trust_level: f?.trust_level || "neutral",
        agents,
        meta: {
          registry_version: idx?.registry_version ?? "unknown",
          generated_at: idx?.generated_at ?? null,
        },
      });
    } catch (err) {
      external.push({
        source: name,
        url: baseUrl,
        trust_level: f?.trust_level || "neutral",
        agents: [],
        error: String(err?.message || err),
      });
    }
  }

  return {
    federation_version: "0.1",
    generated_at: new Date().toISOString(),
    local,
    external,
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url || "/", true);
    const pathname = parsed.pathname || "/";

    // ======================
    // HEALTH
    // ======================
    if (pathname === "/" || pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        name: "OAP Registry Server",
        registry_dir: REGISTRY_DIR,
        port: PORT,
        endpoints: [
          "/index.json",
          "/trust.json",
          "/federation.json",
          "/federated-index.json",
          "/publisher/<publisher_id>.json",
          "/packages/<file>.oap",
        ],
      });
      return;
    }

    // ======================
    // INDEX
    // ======================
    if (pathname === "/index.json") {
      const indexPath = path.join(REGISTRY_DIR, "index.json");
      sendFile(res, indexPath, "application/json; charset=utf-8");
      return;
    }

    // ======================
    // TRUST
    // ======================
    if (pathname === "/trust.json") {
      const trustPath = path.join(REGISTRY_DIR, "trust.json");
      sendFile(res, trustPath, "application/json; charset=utf-8");
      return;
    }

    // ======================
    // FEDERATION CONFIG
    // ======================
    if (pathname === "/federation.json") {
      const federationPath = path.join(REGISTRY_DIR, "federation.json");
      // If missing, return default rather than 404
      const fed = readJsonIfExists(federationPath) || {
        federation_version: "0.1",
        follow: [],
      };
      sendJson(res, 200, fed);
      return;
    }

    // ======================
    // FEDERATED INDEX
    // ======================
    if (pathname === "/federated-index.json") {
      const fedIndex = await buildFederatedIndex();
      sendJson(res, 200, fedIndex);
      return;
    }

    // ======================
    // PUBLISHER PROFILE + REPUTATION
    // ======================
    if (pathname.startsWith("/publisher/") && pathname.endsWith(".json")) {
      const publisherId = decodeURIComponent(
        pathname.slice("/publisher/".length, -".json".length)
      ).trim();

      if (!publisherId) {
        sendJson(res, 400, { error: "Missing publisher_id" });
        return;
      }

      const indexPath = path.join(REGISTRY_DIR, "index.json");
      const trustPath = path.join(REGISTRY_DIR, "trust.json");

      const index = readJsonIfExists(indexPath);
      if (!index) {
        sendJson(res, 404, { error: "index.json not found", path: indexPath });
        return;
      }

      const trust = readJsonIfExists(trustPath) || {};

      const agents = Array.isArray(index?.agents) ? index.agents : [];
      const owned = agents.filter((a) => a?.publisher?.publisher_id === publisherId);

      if (owned.length === 0) {
        sendJson(res, 404, {
          error: "Publisher not found",
          publisher_id: publisherId,
        });
        return;
      }

      const publisher = owned[0]?.publisher || {};

      const deny = Array.isArray(trust?.denylist_publishers) ? trust.denylist_publishers : [];
      const allow = Array.isArray(trust?.allowlist_publishers) ? trust.allowlist_publishers : [];

      const isDenylisted = deny.includes(publisherId);
      const isTrusted = !isDenylisted && allow.includes(publisherId);

      const agentsCount = owned.length;
      const versionsCount = owned.reduce((sum, a) => {
        const vs = a?.versions ? Object.keys(a.versions).length : 0;
        return sum + vs;
      }, 0);

      // Reputation v0.1
      let score = 0;
      if (isDenylisted) score -= 100;
      if (isTrusted) score += 5;
      score += agentsCount * 2;
      score += versionsCount * 1;

      let level = "new";
      if (isDenylisted) level = "denylisted";
      else if (isTrusted && score >= 10) level = "trusted";
      else if (score >= 5) level = "known";

      const profile = {
        publisher_id: publisher.publisher_id || publisherId,
        display_name: publisher.display_name || "Unknown",
        public_key_ed25519: publisher.public_key_ed25519 || null,

        trusted: isTrusted,
        denylisted: isDenylisted,

        reputation: {
          score,
          level,
          signals: {
            trusted: isTrusted,
            denylisted: isDenylisted,
            agents: agentsCount,
            versions: versionsCount,
          },
          formula: {
            trusted_bonus: 5,
            per_agent: 2,
            per_version: 1,
            denylist_penalty: -100,
          },
        },

        stats: {
          agents_count: agentsCount,
          versions_count: versionsCount,
          agents: owned.map((a) => ({
            agent_id: a.agent_id,
            name: a.name,
            latest_version: a.latest_version,
          })),
        },

        registry: {
          registry_version: index?.registry_version ?? "unknown",
          generated_at: index?.generated_at ?? null,
        },
      };

      sendJson(res, 200, profile);
      return;
    }

    // ======================
    // PACKAGES
    // ======================
    if (pathname.startsWith("/packages/")) {
      const rel = pathname;
      const filePath = safeJoin(REGISTRY_DIR, rel);
      if (!filePath) {
        sendJson(res, 400, { error: "Invalid path" });
        return;
      }
      sendFile(res, filePath, "application/octet-stream");
      return;
    }

    // ======================
    // FALLBACK
    // ======================
    sendJson(res, 404, { error: "Unknown endpoint", path: pathname });
  } catch (err) {
    sendJson(res, 500, {
      error: "Server error",
      message: String(err?.message || err),
    });
  }
});

server.listen(PORT, "::", () => {
  console.log("✅ OAP Registry Server running");
  console.log(`- Registry dir: ${REGISTRY_DIR}`);
  console.log(`- Base URL:     http://localhost:${PORT}`);
  console.log(`- Index:        http://localhost:${PORT}/index.json`);
  console.log(`- Trust:        http://localhost:${PORT}/trust.json`);
  console.log(`- Federation:   http://localhost:${PORT}/federation.json`);
  console.log(`- Fed Index:    http://localhost:${PORT}/federated-index.json`);
  console.log(`- Publisher:    http://localhost:${PORT}/publisher/<publisher_id>.json`);
  console.log(`- Packages:     http://localhost:${PORT}/packages/<file>.oap`);
});