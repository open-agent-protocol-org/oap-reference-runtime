import fs from "fs";
import path from "path";
import nacl from "tweetnacl";

import { isHttpUrl, httpGetBuffer, httpGetJson, joinUrl } from "./http";
import { canonicalJsonBytes } from "../../transparency/canonical";
import { sha256Hex } from "../../transparency/hash";
import type { LogEntry, Checkpoint } from "../../transparency/log";

// ---- arg helpers ----

function getArg(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  return value ? String(value) : undefined;
}

function findInIndex(index: any, agentId: string, version: string) {
  const agents = Array.isArray(index?.agents) ? index.agents : [];
  const a = agents.find((x: any) => x?.agent_id === agentId);
  if (!a) return null;
  const v = a?.versions?.[version];
  if (!v) return null;
  return { agent: a, versionEntry: v };
}

function b64ToU8(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

// ---- report formatting ----

type Status = "OK" | "FAIL" | "SKIP" | "MISSING" | "DEV" | "FOUND" | "NOT FOUND";

function fmtRow(label: string, status: Status, detail?: string): string {
  return `  ${label.padEnd(24)}${status}${detail ? `  (${detail})` : ""}`;
}

function printReport(
  registry: string,
  agentId: string,
  version: string,
  rows: string[]
): void {
  console.log("");
  console.log("OAP Verify Report");
  console.log(`  Registry: ${registry}`);
  console.log(`  Agent:    ${agentId}@${version}`);
  console.log("");
  for (const r of rows) console.log(r);
  console.log("");
}

// ---- package hash helper ----

async function verifyPkgHash(
  registry: string,
  downloadRel: string,
  indexHash: string
): Promise<{ status: Status; detail?: string; fail: boolean }> {
  try {
    let buf: Buffer;
    if (isHttpUrl(registry)) {
      buf = await httpGetBuffer(joinUrl(registry, downloadRel));
    } else {
      const pkgPath = path.join(path.resolve(registry), downloadRel);
      if (!fs.existsSync(pkgPath)) {
        return { status: "SKIP", detail: "package file not found", fail: false };
      }
      buf = fs.readFileSync(pkgPath);
    }
    const actual = sha256Hex(buf);
    if (actual === indexHash) {
      return { status: "OK", fail: false };
    }
    return {
      status: "FAIL",
      detail: `expected ${indexHash.slice(0, 12)}... got ${actual.slice(0, 12)}...`,
      fail: true,
    };
  } catch (err: any) {
    return { status: "FAIL", detail: String(err?.message ?? err), fail: true };
  }
}

// ---- main ----

export async function verifyCommand(argv: string[]) {
  const registry = getArg(argv, "--registry") ?? "./registry";
  const agentId = getArg(argv, "--id");
  const version = getArg(argv, "--version");

  if (!agentId || !version) {
    console.error("Missing required args: --id <agent_id> --version <v>");
    console.error("Usage: oap verify --registry <path|url> --id <agent_id> --version <v>");
    process.exit(1);
  }

  const rows: string[] = [];

  // ---- 1. Load index ----
  let index: any = null;
  try {
    if (isHttpUrl(registry)) {
      index = await httpGetJson<any>(joinUrl(registry, "index.json"));
    } else {
      const indexPath = path.join(path.resolve(registry), "index.json");
      if (!fs.existsSync(indexPath)) throw new Error(`index not found: ${indexPath}`);
      index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    }
  } catch (err: any) {
    console.error(`Failed to load registry index: ${err?.message ?? err}`);
    process.exit(2);
  }

  // ---- 2. Find agent/version ----
  const found = findInIndex(index, agentId, version);
  if (!found) {
    rows.push(fmtRow("Index:", "FAIL", "agent/version not found"));
    printReport(registry, agentId, version, rows);
    process.exit(2);
  }
  rows.push(fmtRow("Index:", "OK"));

  // ---- 3. Package hash ----
  const pkg = found.versionEntry?.package ?? {};
  const downloadRel = (pkg.download_url ?? pkg.filename) as string | undefined;
  const indexHash = (pkg.sha256 ?? pkg.package_sha256) as string | undefined;

  if (!indexHash) {
    rows.push(fmtRow("Package hash:", "SKIP", "no hash in index"));
  } else if (!downloadRel) {
    rows.push(fmtRow("Package hash:", "SKIP", "no download_url in index"));
  } else {
    const { status, detail, fail } = await verifyPkgHash(registry, downloadRel, indexHash);
    rows.push(fmtRow("Package hash:", status, detail));
    if (fail) {
      printReport(registry, agentId, version, rows);
      process.exit(3);
    }
  }

  // ---- 4. Transparency (HTTP only) ----
  if (!isHttpUrl(registry)) {
    rows.push(fmtRow("Transparency head:", "SKIP", "local registry"));
    rows.push(fmtRow("Checkpoint signature:", "SKIP", "local registry"));
    rows.push(fmtRow("Log chain integrity:", "SKIP", "local registry"));
    rows.push(fmtRow("Publish event match:", "SKIP", "local registry"));
  } else {
    // 4a. fetch /transparency/head
    let checkpoint: Checkpoint | null = null;
    let headStatus: Status = "MISSING";
    try {
      const resp = await httpGetJson<any>(joinUrl(registry, "transparency/head"));
      if (resp?.dev_mode === true) {
        headStatus = "DEV";
      } else {
        checkpoint = resp as Checkpoint;
        headStatus = "OK";
      }
    } catch {
      headStatus = "MISSING";
    }
    rows.push(fmtRow("Transparency head:", headStatus));

    // 4b. fetch /transparency/entries
    let entries: LogEntry[] = [];
    try {
      const resp = await httpGetJson<any>(
        joinUrl(registry, "transparency/entries") + "?from=0&limit=1000"
      );
      if (Array.isArray(resp?.entries)) entries = resp.entries as LogEntry[];
    } catch {
      // non-fatal; entries stays empty
    }

    // 4c. log chain integrity
    if (entries.length === 0) {
      rows.push(fmtRow("Log chain integrity:", "SKIP", "no entries"));
    } else {
      const sorted = [...entries].sort((a, b) => a.seq - b.seq);
      let chainOk = true;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].prev_entry_hash !== sorted[i - 1].entry_hash) {
          chainOk = false;
          break;
        }
      }
      rows.push(fmtRow("Log chain integrity:", chainOk ? "OK" : "FAIL"));
    }

    // 4d. checkpoint signature
    if (!checkpoint?.sig) {
      rows.push(fmtRow("Checkpoint signature:", "SKIP", "no checkpoint"));
    } else {
      let pubKeyB64: string | null = null;
      try {
        const resp = await httpGetJson<any>(joinUrl(registry, "transparency/public-key"));
        pubKeyB64 = resp?.public_key_b64 ?? null;
      } catch {
        // ignore
      }

      if (!pubKeyB64) {
        rows.push(fmtRow("Checkpoint signature:", "SKIP", "no public key"));
      } else {
        try {
          const checkpointUnsigned = {
            issued_at: checkpoint.issued_at,
            log_id: checkpoint.log_id,
            root: checkpoint.root,
            size: checkpoint.size,
          };
          const msgBytes = canonicalJsonBytes(checkpointUnsigned as any);
          const valid = nacl.sign.detached.verify(
            new Uint8Array(msgBytes),
            b64ToU8(checkpoint.sig.sig),
            b64ToU8(pubKeyB64)
          );
          rows.push(fmtRow("Checkpoint signature:", valid ? "OK" : "FAIL"));
        } catch (err: any) {
          rows.push(fmtRow("Checkpoint signature:", "FAIL", err?.message ?? "verify error"));
        }
      }
    }

    // 4e. publish event match
    if (entries.length === 0) {
      rows.push(fmtRow("Publish event match:", "SKIP", "no entries"));
    } else {
      const match = entries.find((e) => {
        const ev = e.event;
        if (!ev || ev.type !== "publish") return false;
        if (ev.agent_id !== agentId || ev.version !== version) return false;
        // also match package hash when both sides have it
        if (indexHash && ev.package_sha256 && ev.package_sha256 !== indexHash) return false;
        return true;
      });
      rows.push(fmtRow("Publish event match:", match ? "FOUND" : "NOT FOUND"));
    }
  }

  printReport(registry, agentId, version, rows);
  // exit 0 implicitly
}
