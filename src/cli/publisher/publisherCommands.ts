import fs from "fs";
import path from "path";
import crypto from "crypto";

import { loadOrCreatePublisher } from "../../crypto/signing";

function getArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const value = argv[idx + 1];
  return value ?? null;
}

function publisherFilePath(): string {
  const home = process.env.USERPROFILE || process.env.HOME || ".";
  return path.join(home, ".oap", "publisher.json");
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fingerprintBase64Key(base64: string): string {
  const buf = Buffer.from(base64, "base64");
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

export function publisherInitCommand() {
  const pub = loadOrCreatePublisher();
  console.log("✅ Publisher initialized:");
  console.log(`- publisher_id: ${pub.publisher_id}`);
  console.log(`- display_name: ${pub.display_name}`);
  console.log(`- public_key:   ${pub.public_key_ed25519}`);
  console.log(`- fingerprint:  ${fingerprintBase64Key(pub.public_key_ed25519)}`);
  console.log(`- file:         ${publisherFilePath()}`);
}

export function publisherShowCommand() {
  const pub = loadOrCreatePublisher();
  console.log("Publisher:");
  console.log(`- publisher_id: ${pub.publisher_id}`);
  console.log(`- display_name: ${pub.display_name}`);
  console.log(`- public_key:   ${pub.public_key_ed25519}`);
  console.log(`- fingerprint:  ${fingerprintBase64Key(pub.public_key_ed25519)}`);
  console.log(`- file:         ${publisherFilePath()}`);
}

export function publisherSetNameCommand(argv: string[]) {
  const name = getArg(argv, "--name") ?? getArg(argv, "-n");
  if (!name) {
    console.error('Usage: oap publisher set-name --name "New Name"');
    process.exit(1);
  }

  const pubPath = publisherFilePath();
  ensureDir(pubPath);

  const pub = loadOrCreatePublisher();
  pub.display_name = name;

  fs.writeFileSync(pubPath, JSON.stringify(pub, null, 2), "utf-8");

  console.log("✅ Updated publisher display name:");
  console.log(`- display_name: ${pub.display_name}`);
}

export function publisherExportCommand(argv: string[]) {
  const out = getArg(argv, "--out") ?? "./publisher.json";

  const pub = loadOrCreatePublisher();

  const profile = {
    publisher_id: pub.publisher_id,
    display_name: pub.display_name,
    public_key_ed25519: pub.public_key_ed25519,
  };

  fs.writeFileSync(path.resolve(out), JSON.stringify(profile, null, 2), "utf-8");

  console.log("✅ Exported publisher profile:");
  console.log(`- out: ${path.resolve(out)}`);
}