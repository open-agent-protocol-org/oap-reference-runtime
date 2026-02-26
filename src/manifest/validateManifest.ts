import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export function validateManifest(manifest: unknown): ValidationResult {
  const schemaPath = path.resolve("schema", "manifest.schema.json");

  if (!fs.existsSync(schemaPath)) {
    return { ok: false, errors: [`Schema not found at: ${schemaPath}`] };
  }

  const schemaRaw = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as object;

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schemaRaw);

  const valid = validate(manifest);

  if (valid) return { ok: true };

  const errors = (validate.errors ?? []).map((e) => {
    const where = e.instancePath ? e.instancePath : "(root)";
    return `${where} ${e.message ?? "is invalid"}`;
  });

  return { ok: false, errors };
}