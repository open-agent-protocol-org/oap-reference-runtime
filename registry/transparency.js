const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nacl = require("tweetnacl");

const DATA_DIR = path.join(__dirname, "data", "transparency");
const LOG_PATH = path.join(DATA_DIR, "log.ndjson");
const CHECKPOINT_PATH = path.join(DATA_DIR, "checkpoint.json");

function ensureFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "", "utf8");
  if (!fs.existsSync(CHECKPOINT_PATH)) fs.writeFileSync(CHECKPOINT_PATH, "{}", "utf8");
}

// --- canonical json (sort keys recursively) ---
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}
function canonicalBytes(obj) {
  const sorted = sortKeysDeep(obj);
  return Buffer.from(JSON.stringify(sorted), "utf8");
}

function sha256Hex(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function b64ToU8(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
function u8ToB64(u8) {
  return Buffer.from(u8).toString("base64");
}

function getLogKeys() {
  const pub = process.env.OAP_LOG_PUBLIC_KEY_B64;
  const sec = process.env.OAP_LOG_SECRET_KEY_B64;
  if (!pub || !sec) {
    throw new Error("Missing OAP_LOG_PUBLIC_KEY_B64 / OAP_LOG_SECRET_KEY_B64 in env");
  }
  return { pub, sec };
}

function signEd25519(messageBytes, secretKeyB64, publicKeyB64) {
  const secretKey = b64ToU8(secretKeyB64);
  const sig = nacl.sign.detached(new Uint8Array(messageBytes), secretKey);
  return {
    alg: "ed25519",
    public_key: publicKeyB64,
    sig: u8ToB64(sig),
  };
}

function readLastEntryMeta() {
  ensureFiles();
  const content = fs.readFileSync(LOG_PATH, "utf8").trim();
  if (!content) return null;
  const lines = content.split("\n");
  const last = JSON.parse(lines[lines.length - 1]);
  return { seq: last.seq, entry_hash: last.entry_hash };
}

function readCheckpoint() {
  ensureFiles();
  const raw = fs.readFileSync(CHECKPOINT_PATH, "utf8").trim();
  if (!raw || raw === "{}") return null;
  return JSON.parse(raw);
}

function readEntries(from, limit) {
  ensureFiles();
  const content = fs.readFileSync(LOG_PATH, "utf8").trim();
  if (!content) return [];
  const lines = content.split("\n").filter(Boolean);
  const start = Math.max(0, Number(from) || 0);
  const lim = Math.max(1, Math.min(1000, Number(limit) || 200));
  const slice = lines.slice(start, start + lim);
  return slice.map((l) => JSON.parse(l));
}

// This is called by publish endpoint
function appendPublishToLog({ logId, sourceRegistry, event, publisher_signature }) {
  ensureFiles();

  const now = new Date().toISOString();
  const last = readLastEntryMeta();
  const nextSeq = last ? last.seq + 1 : 0;

  const fullEvent = {
    spec_version: "oap.v0.4",
    type: "publish",
    publisher_id: event.publisher_id,
    agent_id: event.agent_id,
    version: event.version,
    manifest_sha256: event.manifest_sha256,
    package_sha256: event.package_sha256,
    published_at: event.published_at || now,
    source_registry: sourceRegistry,
  };

  const entryWithoutHash = {
    log_id: logId,
    seq: nextSeq,
    event: fullEvent,
    publisher_signature,
    ingested_at: now,
    prev_entry_hash: last ? last.entry_hash : null,
  };

  const entry_hash = sha256Hex(canonicalBytes(entryWithoutHash));
  const entry = { ...entryWithoutHash, entry_hash };

  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf8");

  // checkpoint
  const { pub, sec } = getLogKeys();
  const checkpointUnsigned = {
    log_id: logId,
    size: entry.seq,
    root: entry.entry_hash,
    issued_at: now,
  };

  const cpSig = signEd25519(canonicalBytes(checkpointUnsigned), sec, pub);
  const checkpoint = { ...checkpointUnsigned, sig: cpSig };

  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2), "utf8");

  return { entry, checkpoint };
}

module.exports = {
  readCheckpoint,
  readEntries,
  appendPublishToLog,
};