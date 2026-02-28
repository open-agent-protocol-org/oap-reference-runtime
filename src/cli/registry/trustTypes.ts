export type TrustPolicyV01 = {
  default_install: "allow_with_warning" | "require_trusted";
  require_trusted_for_permissions: string[];
};

export type TrustFileV01 = {
  trust_version: "0.1";
  generated_at: string;
  policy: TrustPolicyV01;
  allowlist_publishers: string[];
  denylist_publishers: string[];
};