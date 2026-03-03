// registry/scripts/smokeTransparency.js
// Smoke test for OAP transparency log HTTP endpoints.
//
// HOW TO RUN
// ----------
// 1. Start the registry server (strict mode, requires log keys):
//      OAP_LOG_PUBLIC_KEY_B64=<pub> OAP_LOG_SECRET_KEY_B64=<sec> node registry/server.js
//
// 2. Start the registry server (dev mode, no keys required):
//      OAP_DEV_MODE=1 node registry/server.js
//
// 3. Run this script (in a separate terminal):
//      node registry/scripts/smokeTransparency.js
//
// 4. Custom port:
//      PORT=9000 node registry/scripts/smokeTransparency.js
//
// Example (dev mode, single terminal using & on Unix):
//      OAP_DEV_MODE=1 node registry/server.js &
//      sleep 1 && node registry/scripts/smokeTransparency.js
//
// On Windows PowerShell:
//      $env:OAP_DEV_MODE="1"; Start-Process node -ArgumentList "registry/server.js"
//      node registry/scripts/smokeTransparency.js

const http = require("http");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const BASE = `http://localhost:${PORT}`;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(BASE + urlPath, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`Timeout fetching ${urlPath}`)));
  });
}

function label(status) {
  if (status >= 200 && status < 300) return "OK  ";
  if (status === 503) return "503 ";
  if (status === 404) return "404 ";
  return String(status);
}

async function check(urlPath) {
  console.log(`GET ${urlPath}`);
  try {
    const { status, body } = await get(urlPath);
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      console.log(`  [${label(status)}] (non-JSON response)`);
      return;
    }

    console.log(`  [${label(status)}]`);

    if (parsed.dev_mode !== undefined) {
      console.log(`  dev_mode: ${parsed.dev_mode}, checkpoint: ${JSON.stringify(parsed.checkpoint)}`);
    } else if (parsed.error) {
      console.log(`  error: ${parsed.error}`);
      if (parsed.hint) console.log(`  hint:  ${parsed.hint}`);
    } else if (parsed.root !== undefined) {
      // checkpoint
      console.log(`  log_id:    ${parsed.log_id}`);
      console.log(`  size:      ${parsed.size}`);
      console.log(`  root:      ${String(parsed.root).slice(0, 16)}...`);
      console.log(`  issued_at: ${parsed.issued_at}`);
    } else if (Array.isArray(parsed.entries)) {
      // entries list
      console.log(`  from:    ${parsed.from}`);
      console.log(`  limit:   ${parsed.limit}`);
      console.log(`  entries: ${parsed.entries.length}`);
      if (parsed.entries.length > 0) {
        const e = parsed.entries[0];
        console.log(`  first:   seq=${e.seq} type=${e.event?.type} agent=${e.event?.agent_id}`);
      }
    } else if (parsed.public_key_b64) {
      console.log(`  public_key_b64: ${String(parsed.public_key_b64).slice(0, 20)}...`);
    } else {
      console.log(`  ${JSON.stringify(parsed).slice(0, 120)}`);
    }
  } catch (err) {
    console.log(`  [ERR] ${err.message}`);
    if (err.code === "ECONNREFUSED") {
      console.log(`  Is the server running on ${BASE}?`);
    }
  }
  console.log();
}

async function main() {
  console.log(`OAP Transparency Smoke Test`);
  console.log(`Target: ${BASE}`);
  console.log(`─────────────────────────────────────────`);
  console.log();

  await check("/transparency/head");
  await check("/transparency/entries?from=0&limit=5");
  await check("/transparency/public-key");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
