# Open Agent Protocol (OAP) — Specification v0.2 (Draft)

**Status:** Draft  
**Version:** 0.2  
**Last updated:** 2026-02-26  
**Scope:** Defines the agent package format, manifest, permissions model, tool allowlisting, execution/audit basics, and interoperability requirements for runtimes and registries.

---

## 1. Purpose

OAP is an open, vendor-neutral protocol for distributing and running AI agents across platforms. It defines:

- A **portable agent package** format (`.oap`)
- A **manifest** (`manifest.json`) describing identity, capabilities, permissions, and tools
- A **permissions model** that is explicit and user-auditable
- A **tool allowlisting** mechanism to constrain what an agent may call
- Minimal **execution and audit log** expectations for runtime interoperability

OAP is designed to be:
- **Open:** anyone can publish agents and implement runtimes/registries
- **Portable:** agents can run across devices and vendors
- **Safe-by-default:** permissions and tools are explicit and enforceable
- **Composable:** registries, stores, and runtimes can evolve independently

---

## 2. Terminology

- **Agent:** A packaged unit of behavior defined by an OAP manifest and optional assets/config.
- **Runtime:** Software that loads an agent package/directory, validates it, prompts for permissions, executes agent logic, and enforces tool/permission rules.
- **Tool:** An external callable capability exposed by the runtime (e.g., calendar access). Tools are runtime-defined and must be declared in the agent manifest to be callable.
- **Permission:** A human-readable capability request which the runtime may grant/deny per execution or policy.
- **Registry:** A distribution service that indexes and serves `.oap` packages and metadata.
- **Store (Local Agent Store):** A local folder structure where installed agents are placed (e.g., `agents/<agent_id>/<version>/`).

---

## 3. Compatibility and Versioning

### 3.1 OAP version field

Every agent MUST declare:

- `oap_version` (string) e.g. `"0.2"`

Runtimes MUST reject manifests with an `oap_version` they do not support.

### 3.2 Agent version field

Agents MUST declare:

- `version` (string)

SemVer is RECOMMENDED (e.g., `0.1.0`) but not required in v0.2.

### 3.3 Backward/forward compatibility

- Runtimes SHOULD ignore unknown manifest fields for forward compatibility.
- Agents SHOULD NOT rely on runtime behavior not expressed in the manifest.

---

## 4. Package Format (`.oap`)

### 4.1 Container

An `.oap` file is a **ZIP** container with the extension `.oap`.

### 4.2 Required files

An OAP package MUST include:

- `manifest.json` (required)

### 4.3 Recommended files

An OAP package SHOULD include:

- `README.md`
- `assets/` (images, icons, etc.)
- `examples/` (optional usage examples)

### 4.4 Ignored paths

Runtimes and registries SHOULD ignore typical junk paths:

- `node_modules/`, `.git/`, `dist/`, `.DS_Store`

---

## 5. Manifest (`manifest.json`)

### 5.1 Overview

The manifest describes identity, constraints, compatibility, and requested capabilities.

### 5.2 Required fields

A valid OAP v0.2 manifest MUST contain:

- `oap_version` (string)
- `agent_id` (string, globally unique recommended)
- `name` (string)
- `description` (string)
- `version` (string)
- `permissions` (array of strings)

### 5.3 Optional fields

- `author` (object)
- `runtime_compatibility` (object)
- `tools` (array of tool names)
- `memory` (object)
- `triggers` (object)

### 5.4 Canonical JSON example

~~~json
{
  "oap_version": "0.2",
  "agent_id": "com.example.dailyplanner",
  "name": "Daily Planner",
  "description": "Plans your day using your calendar and sends reminders.",
  "version": "0.1.0",
  "author": {
    "name": "Anonymous",
    "contact": "n/a"
  },
  "runtime_compatibility": {
    "models_supported": ["openai:gpt-5"]
  },
  "permissions": [
    "calendar.read",
    "calendar.write",
    "notifications.send"
  ],
  "tools": [
    "tools.calendar_read",
    "tools.calendar_write",
    "tools.notifications_send"
  ],
  "memory": {
    "enabled": true,
    "scope": "per_user"
  },
  "triggers": {
    "manual": true,
    "scheduled": [],
    "events": []
  }
}
~~~

---

## 6. Agent Identity (`agent_id`)

### 6.1 Format

`agent_id` SHOULD follow reverse-domain style identifiers:

- `com.company.agentname`
- `org.project.agent`

Allowed characters RECOMMENDED: `a-zA-Z0-9.-`

### 6.2 Uniqueness

Registries SHOULD treat `agent_id` as globally unique.  
Runtimes MUST treat `agent_id` as the primary identity key for install/run/audit.

---

## 7. Permissions

### 7.1 Declaration

Agents MUST declare requested permissions in:

- `permissions: string[]`

### 7.2 Runtime prompting

Runtimes MUST display permissions to the user and allow approval/deny (interactive or policy-based).

### 7.3 Enforcement

Runtimes MUST enforce permission checks at the time of:

- tool invocation (tool-required permissions)
- protected runtime operations (if any)

If permissions are denied, runtimes MUST refuse the action and SHOULD return a structured error.

### 7.4 Permission naming

Permissions are strings using dot-separated namespaces, e.g.:

- `calendar.read`
- `calendar.write`
- `notifications.send`
- `files.read`
- `files.write`

---

## 8. Tools and Allowlisting

### 8.1 Tool declaration

Agents MAY declare allowed tools:

- `tools: string[]`

If `tools` is absent:

- runtime MAY treat it as “no tools allowed” (strict mode), or
- runtime MAY allow tools based on policy (compat mode)

For safety, **strict mode is RECOMMENDED**.

### 8.2 Runtime tool registry

Runtimes define available tools with descriptors including:

- `name`
- `title`
- `description`
- `version`
- `permissionsRequired`
- `inputSchema`
- `outputSchema`

### 8.3 Enforcement rules

A runtime MUST enforce:

1) **Manifest allowlist:** the tool name MUST appear in `manifest.tools`  
2) **Permission requirement:** user-approved permissions MUST include tool-required permissions

If either fails, the runtime MUST deny the tool call.

---

## 9. Execution Model

### 9.1 Execution context

Each run produces an `executionId` and is associated with:

- `agent_id`
- `triggerType` (`manual | scheduled | event`)
- approved permissions
- tool calls (if any)

### 9.2 Minimal execution result

Runtimes SHOULD return a result object:

~~~json
{
  "executionId": "uuid",
  "status": "success",
  "output": "string",
  "toolCalls": [
    {
      "call": { "name": "tools.mock_echo", "input": { "hello": "world" } },
      "result": { "ok": true, "output": { "echoed": { "hello": "world" } } }
    }
  ]
}
~~~

---

## 10. Audit Logging

### 10.1 Requirement

Runtimes SHOULD write an audit log record per execution including:

- `executionId`
- `agentId`
- `timestamp`
- `triggerType`
- `permissions`
- `status`
- `output`
- `toolCalls` (optional but recommended)

### 10.2 Storage

Storage location is runtime-defined. For local runtimes, a `logs/` directory is RECOMMENDED.

---

## 11. Triggers (Optional)

### 11.1 Structure

`triggers` MAY include:

- `manual: boolean`
- `scheduled: [{ id, cron, description? }]`
- `events: [{ id, source, event_type, filter?, debounce? }]`

### 11.2 Runtime handling

Runtimes MAY support some or all trigger types. Unsupported triggers MUST be ignored or rejected per policy.

---

## 12. Memory (Optional)

### 12.1 Structure

`memory` MAY include:

- `enabled: boolean`
- `scope: "per_user" | "per_workspace"`

### 12.2 Interoperability note

Memory semantics are runtime-defined. The manifest indicates intent only.

---

## 13. Security Model (v0.2)

### 13.1 Baseline goals

- Explicit permissions
- Tool allowlisting
- Auditable execution logs
- Deterministic package contents

### 13.2 v0.2 limitations

- Package signing is not required in v0.2
- Registry trust is not formally enforced in v0.2

### 13.3 Forward compatibility (v0.3+)

Future versions SHOULD add:

- publisher identity + signing (ed25519)
- checksum enforcement and provenance
- policy enforcement for sensitive capabilities
- sandbox constraints

---

## 14. Compliance Requirements Summary (MUST/SHOULD)

### 14.1 Agent MUST

- Provide `manifest.json` with required fields
- Declare permissions

### 14.2 Runtime MUST

- Validate `manifest.json` against schema
- Prompt for permissions (or enforce policy)
- Enforce tool allowlist + permissions at tool call time

### 14.3 Runtime SHOULD

- Provide audit logs
- Provide tool descriptors and list capabilities

### 14.4 Registry SHOULD

- Index by `agent_id` and `version`
- Provide checksum for packages
- Provide a stable download URL or path

---

## Appendix A — JSON Schema (Reference)

A reference JSON schema file for `manifest.json` SHOULD be published under:

- `schema/manifest.schema.json`

This spec is the normative source; schema is an implementation aid.

---

## Appendix B — Non-goals (v0.2)

- Cross-runtime dependency resolution
- Standardized agent “code execution” format
- Mandatory cryptographic signing
- Guaranteed model/provider neutrality at runtime execution level

---

## Appendix C — Design Principles

- Make unsafe things explicit
- Prefer allowlists over denylists
- Keep the core minimal so multiple runtimes can exist
- Optimize for ecosystem growth and interoperability