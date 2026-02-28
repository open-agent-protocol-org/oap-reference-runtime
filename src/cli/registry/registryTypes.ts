export type RegistryIndexV01 = {
  registry_version: "0.1";
  generated_at: string;
  agents: RegistryAgentEntry[];
};

export type RegistryAgentEntry = {
  agent_id: string;
  name: string;
  description: string;
  publisher: {
    display_name: string;
    publisher_id: string;
    public_key_ed25519?: string; // optional for v0.1
  };
  latest_version: string;
  versions: Record<string, RegistryAgentVersionEntry>;
};

export type RegistryAgentVersionEntry = {
  package: {
    filename: string;
    sha256: string;
    size_bytes: number;
    // In local mode we keep a URL-like field but it can be empty/relative
    download_url?: string;
  };
  manifest: {
    oap_version?: string;
    agent_id: string;
    version: string;
    permissions?: string[];
    tools?: string[];
  };
  signature?: {
    alg: "ed25519";
    signed_at: string;
    payload_sha256?: string;
    signature: string; // placeholder for v0.2
  };
};