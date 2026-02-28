import fs from "fs";
import path from "path";
import { isHttpUrl, httpGetJson, joinUrl } from "./http";
import { TrustFileV01 } from "./trustTypes";

export async function loadTrust(registry: string): Promise<TrustFileV01 | null> {
  try {
    if (isHttpUrl(registry)) {
      return await httpGetJson<TrustFileV01>(joinUrl(registry, "trust.json"));
    }
    const trustPath = path.join(registry, "trust.json");
    if (!fs.existsSync(trustPath)) return null;
    return JSON.parse(fs.readFileSync(trustPath, "utf-8")) as TrustFileV01;
  } catch {
    return null;
  }
}

export function isPublisherTrusted(trust: TrustFileV01 | null, publisherId?: string): boolean {
  if (!trust || !publisherId) return false;
  if (trust.denylist_publishers?.includes(publisherId)) return false;
  return trust.allowlist_publishers?.includes(publisherId) ?? false;
}

export function permissionRequiresTrust(trust: TrustFileV01 | null, permissions?: string[]): boolean {
  if (!trust) return false;
  const gate = trust.policy?.require_trusted_for_permissions ?? [];
  const requested = permissions ?? [];
  return requested.some((p) => gate.includes(p));
}