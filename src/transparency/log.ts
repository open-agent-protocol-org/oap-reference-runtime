import fs from "fs";
import path from "path";
import { canonicalJsonBytes } from "./canonical";
import { sha256Hex } from "./hash";

// --- Typer ---
export type PublishEvent = {
  spec_version: "oap.v0.4";
  type: "publish";
  publisher_id: string;
  agent_id: string;
  version: string;
  manifest_sha256: string;
  package_sha256: string;
  published_at: string; // ISO
  source_registry: string; // ex registry host/id
};

export type Ed25519Sig = {
  alg: "ed25519";
  public_key: string; // base64
  sig: string; // base64
};

export type LogEntry = {
  log_id: string; // ex "oaplog:registry.example.org"
  seq: number;
  event: PublishEvent;
  publisher_signature: Ed25519Sig;
  ingested_at: string;
  prev_entry_hash: string | null;
  entry_hash: string;
};

export type Checkpoint = {
  log_id: string;
  size: number; // senaste seq
  root: string; // entry_hash för senaste
  issued_at: string;
  sig: Ed25519Sig; // signerat av registry log key
};

// --- Paths ---
const DATA_DIR = path.join(process.cwd(), "data", "transparency");
const LOG_PATH = path.join(DATA_DIR, "log.ndjson");
const CHECKPOINT_PATH = path.join(DATA_DIR, "checkpoint.json");

// --- Registry log key ---
// Antag att ni redan har nycklar någonstans. Här läser vi från env.
// Du ska lägga in dessa i din .env eller i din config.
function getRegistryLogKeypair(): { publicKeyB64: string; secretKeyB64: string } {
  const publicKeyB64 = process.env.OAP_LOG_PUBLIC_KEY_B64;
  const secretKeyB64 = process.env.OAP_LOG_SECRET_KEY_B64;
  if (!publicKeyB64 || !secretKeyB64) {
    throw new Error(
      "Missing OAP_LOG_PUBLIC_KEY_B64 / OAP_LOG_SECRET_KEY_B64 in environment"
    );
  }
  return { publicKeyB64, secretKeyB64 };
}

// --- Sign/verify (Ed25519) ---
// Jag skriver det här med Node crypto. Om ni redan har Ed25519 helpers, byt ut detta mot era.
// Node's crypto.sign för ed25519 kräver KeyObject/PEM. Om ni har raw keys idag:
// enklast: använd tweetnacl. Jag visar tweetnacl-variant (superenkel).

import nacl from "tweetnacl";

function b64ToU8(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
function u8ToB64(u8: Uint8Array): string {
  return Buffer.from(u8).toString("base64");
}

function signEd25519(message: Buffer, secretKeyB64: string): Ed25519Sig {
  const secretKey = b64ToU8(secretKeyB64);
  const sig = nacl.sign.detached(new Uint8Array(message), secretKey);
  // public key är sista 32 bytes i nacl secret key (64 bytes) – men vi tar från env ändå
  return {
    alg: "ed25519",
    public_key: process.env.OAP_LOG_PUBLIC_KEY_B64!,
    sig: u8ToB64(sig),
  };
}

function ensureDataFilesExist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LOG_PATH)) fs.writeFileSync(LOG_PATH, "", "utf8");
  if (!fs.existsSync(CHECKPOINT_PATH)) fs.writeFileSync(CHECKPOINT_PATH, "{}", "utf8");
}

function readLastEntry(): { seq: number; entry_hash: string } | null {
  ensureDataFilesExist();
  const content = fs.readFileSync(LOG_PATH, "utf8").trim();
  if (!content) return null;
  const lines = content.split("\n");
  const last = JSON.parse(lines[lines.length - 1]) as LogEntry;
  return { seq: last.seq, entry_hash: last.entry_hash };
}

export function computeEntryHash(entryWithoutHash: Omit<LogEntry, "entry_hash">): string {
  const bytes = canonicalJsonBytes(entryWithoutHash as any);
  return sha256Hex(bytes);
}

export function appendPublishToLog(args: {
  logId: string;
  sourceRegistry: string;
  event: Omit<PublishEvent, "spec_version" | "type" | "source_registry"> & {
    published_at?: string;
  };
  publisher_signature: Ed25519Sig;
}): { entry: LogEntry; checkpoint: Checkpoint } {
  ensureDataFilesExist();

  const now = new Date().toISOString();
  const last = readLastEntry();

  const fullEvent: PublishEvent = {
    spec_version: "oap.v0.4",
    type: "publish",
    publisher_id: args.event.publisher_id,
    agent_id: args.event.agent_id,
    version: args.event.version,
    manifest_sha256: args.event.manifest_sha256,
    package_sha256: args.event.package_sha256,
    published_at: args.event.published_at ?? now,
    source_registry: args.sourceRegistry,
  };

  const nextSeq = last ? last.seq + 1 : 0;

  const entryWithoutHash: Omit<LogEntry, "entry_hash"> = {
    log_id: args.logId,
    seq: nextSeq,
    event: fullEvent,
    publisher_signature: args.publisher_signature,
    ingested_at: now,
    prev_entry_hash: last ? last.entry_hash : null,
  };

  const entry_hash = computeEntryHash(entryWithoutHash);
  const entry: LogEntry = { ...entryWithoutHash, entry_hash };

  // Append NDJSON
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf8");

  // Update checkpoint (signerat av registry)
  const { secretKeyB64 } = getRegistryLogKeypair();
  const checkpointUnsigned = {
    log_id: args.logId,
    size: entry.seq,
    root: entry.entry_hash,
    issued_at: now,
  };

  const cpBytes = canonicalJsonBytes(checkpointUnsigned as any);
  const cpSig = signEd25519(cpBytes, secretKeyB64);

  const checkpoint: Checkpoint = { ...checkpointUnsigned, sig: cpSig };
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2), "utf8");

  return { entry, checkpoint };
}

export function readCheckpoint(): Checkpoint | null {
  ensureDataFilesExist();
  const raw = fs.readFileSync(CHECKPOINT_PATH, "utf8").trim();
  if (!raw || raw === "{}") return null;
  return JSON.parse(raw) as Checkpoint;
}

export function readEntries(from: number, limit: number): LogEntry[] {
  ensureDataFilesExist();
  const content = fs.readFileSync(LOG_PATH, "utf8").trim();
  if (!content) return [];
  const lines = content.split("\n").filter(Boolean);
  const start = Math.max(0, from);
  const end = Math.min(lines.length, start + Math.max(1, limit));
  const slice = lines.slice(start, end);
  return slice.map((l) => JSON.parse(l) as LogEntry);
}