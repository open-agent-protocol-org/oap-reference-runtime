import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

type PublisherIdentity = {
  publisher_id: string;
  display_name: string;
  public_key_ed25519: string;  // base64 (SPKI DER)
  private_key_ed25519: string; // base64 (PKCS8 DER)
  created_at: string;
};

function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }

  const keys = Object.keys(value).sort();
  const props = keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k]));
  return "{" + props.join(",") + "}";
}

export function canonicalBytes(payload: any): Buffer {
  return Buffer.from(stableStringify(payload), "utf-8");
}

function oapHomeDir(): string {
  return path.join(os.homedir(), ".oap");
}

function identityPath(): string {
  return path.join(oapHomeDir(), "publisher.json");
}

export function loadOrCreatePublisher(): PublisherIdentity {
  const dir = oapHomeDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const p = identityPath();
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as PublisherIdentity;
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

  const publicDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const privateDer = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;

  const id: PublisherIdentity = {
    publisher_id: "pub_" + crypto.randomBytes(8).toString("hex"),
    display_name: "Anonymous",
    public_key_ed25519: publicDer.toString("base64"),
    private_key_ed25519: privateDer.toString("base64"),
    created_at: new Date().toISOString(),
  };

  fs.writeFileSync(p, JSON.stringify(id, null, 2), "utf-8");
  return id;
}

export function signPayloadEd25519(payload: any, privateKeyBase64Der: string): { signatureBase64: string; payloadSha256: string } {
  const bytes = canonicalBytes(payload);
  const payloadSha256 = crypto.createHash("sha256").update(bytes).digest("hex");

  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyBase64Der, "base64"),
    format: "der",
    type: "pkcs8",
  });

  const sig = crypto.sign(null, bytes, privateKey);
  return { signatureBase64: sig.toString("base64"), payloadSha256 };
}

export function verifyPayloadEd25519(payload: any, signatureBase64: string, publicKeyBase64Der: string): boolean {
  const bytes = canonicalBytes(payload);

  const publicKey = crypto.createPublicKey({
    key: Buffer.from(publicKeyBase64Der, "base64"),
    format: "der",
    type: "spki",
  });

  return crypto.verify(null, bytes, publicKey, Buffer.from(signatureBase64, "base64"));
}