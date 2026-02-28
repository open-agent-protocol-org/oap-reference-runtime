import http from "http";
import https from "https";
import { URL } from "url";

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function httpGetBuffer(urlStr: string): Promise<Buffer> {
  const u = new URL(urlStr);
  const lib = u.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.get(u, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        reject(new Error(`HTTP ${status} for ${urlStr}`));
        res.resume();
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
  });
}

export async function httpGetJson<T>(urlStr: string): Promise<T> {
  const buf = await httpGetBuffer(urlStr);
  return JSON.parse(buf.toString("utf-8")) as T;
}

export function joinUrl(base: string, path: string): string {
  // Ensure base ends with "/" for URL resolution
  const b = base.endsWith("/") ? base : base + "/";
  return new URL(path.replace(/^\//, ""), b).toString();
}