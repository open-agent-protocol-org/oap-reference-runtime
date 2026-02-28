import fs from "fs";
import path from "path";

import { isHttpUrl, httpGetJson, joinUrl } from "../registry/http";

function getArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const value = argv[idx + 1];
  return value ?? null;
}

function getLocalPublisherId(): string | null {
  const home = process.env.USERPROFILE || process.env.HOME || ".";
  const pubPath = path.join(home, ".oap", "publisher.json");
  if (!fs.existsSync(pubPath)) return null;

  try {
    const pub = JSON.parse(fs.readFileSync(pubPath, "utf-8"));
    return pub?.publisher_id ?? null;
  } catch {
    return null;
  }
}

export async function publisherProfileCommand(argv: string[]) {
  const registry = getArg(argv, "--registry");
  const id = getArg(argv, "--id");
  const me = argv.includes("--me");

  if (!registry) {
    console.error("Missing --registry <url>");
    console.error("Usage: oap publisher profile --registry <url> --id <publisher_id>");
    console.error("   or: oap publisher profile --registry <url> --me");
    process.exit(1);
  }

  if (!isHttpUrl(registry)) {
    console.error("publisher profile currently supports HTTP registries only.");
    console.error("Example: --registry http://localhost:8788");
    process.exit(1);
  }

  let publisherId = id;
  if (!publisherId && me) {
    publisherId = getLocalPublisherId();
  }

  if (!publisherId) {
    console.error("Missing publisher id. Use --id <publisher_id> or --me");
    process.exit(1);
  }

  const url = joinUrl(registry, `publisher/${encodeURIComponent(publisherId)}.json`);
  const profile = await httpGetJson<any>(url);

  console.log(JSON.stringify(profile, null, 2));
}