type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

function sortKeysDeep(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, Json>;
    const sorted: Record<string, Json> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortKeysDeep(obj[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalJsonBytes(value: Json): Buffer {
  const sorted = sortKeysDeep(value);
  const str = JSON.stringify(sorted); // inga extra spaces
  return Buffer.from(str, "utf8");
}