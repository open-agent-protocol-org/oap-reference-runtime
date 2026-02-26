# OAP Reference Runtime

Reference implementation of the Open Agent Protocol (OAP).

This repository provides a working runtime + CLI that demonstrates how OAP-compliant agents can be:

- validated
- packaged
- published
- discovered
- installed
- executed
- audited

Canonical protocol specification:
https://github.com/open-agent-protocol-org/open-agent-protocol

---

## What this repo is for

This is a **reference implementation** to prove the protocol flow end-to-end:

- `manifest.json` validation (schema + rules)
- explicit permission prompting + enforcement
- tool allowlisting + permission gating at tool-call time
- packaging as `.oap` (zip container)
- local registry publish/search/install
- execution output + audit logs

Not production-hardened yet.

---

## Features

### Runtime
- Loads agents from a directory or installed store
- Validates manifest against schema
- Prompts for permissions (approve/deny)
- Enforces tool allowlist + permissions required by tools
- Runs a simulated execution path
- Produces a structured execution result
- Writes an audit log per execution

### CLI (`oap`)
- `oap --help` — help
- `oap init` — scaffold a new agent
- `oap validate` — validate an agent manifest
- `oap run` — run an agent (dir or installed)
- `oap tools` — list available tools
- `oap pack` — package an agent into a `.oap` file
- `oap unpack` — unpack a `.oap` into the local agent store
- `oap publish` — publish agent to a local registry
- `oap search` — search a registry index
- `oap install` — install from registry into the local agent store
- `oap agents list` — list installed agents

---

## Quick Start

### Prerequisites
- Node.js (LTS recommended)
- npm
- Git

### Install, build, link
~~~bash
npm install
npm run build
npm link
~~~

Verify:
~~~bash
oap --help
~~~

---

## Create and run an agent

### Create
~~~bash
oap init --dir my-agent --id com.example.myagent --name "My Agent"
~~~

### Validate
~~~bash
oap validate --agent ./my-agent
~~~

### Run (from directory)
~~~bash
oap run --agent ./my-agent
~~~

---

## Package and distribute

### Pack as `.oap`
~~~bash
oap pack --agent ./my-agent
~~~

### Publish to local registry
~~~bash
oap publish --agent ./my-agent --registry ./registry
~~~

### Search registry
~~~bash
oap search --registry ./registry myagent
~~~

### Install from registry
~~~bash
oap install --registry ./registry --id com.example.myagent --version 0.1.0
~~~

### List installed agents
~~~bash
oap agents list
~~~

### Run installed agent
~~~bash
oap run --installed com.example.myagent --version 0.1.0
~~~

---

## Repository structure

~~~text
oap-reference-runtime/
├── src/                  Runtime and CLI implementation
├── schema/               JSON schema files
├── examples/             Example agents
├── packages/             Built .oap packages (local)
├── registry/             Local registry (index + packages)
├── agents/               Installed agent store
├── logs/                 Execution audit logs (local)
├── tsconfig.json
├── package.json
└── README.md
~~~

---

## Local registry model

The reference implementation includes a simple local registry:

- `registry/index.json` — catalog of agents and versions
- `registry/packages/` — stored `.oap` packages

This simulates a real registry backend. Future work may add:
- HTTP registry support
- signature verification (ed25519)
- trust/provenance model
- policy-based permission persistence

---

## Execution & audit logs

Each run produces:
- an `executionId`
- execution status/output
- optional tool-call records

Audit logs are written to:
- `logs/<executionId>.json`

---

## Status

Targets OAP protocol draft: **v0.2**

Breaking changes may occur as the protocol evolves toward v1.0.

---

## Contributing

This repo implements the protocol.

Protocol changes/spec discussion should happen in:
https://github.com/open-agent-protocol-org/open-agent-protocol

Implementation improvements (CLI/runtime) are welcome here via PRs.

---

## License

Licensed under the Apache License 2.0.  
See the LICENSE file for details.