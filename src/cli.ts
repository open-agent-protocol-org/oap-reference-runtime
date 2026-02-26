#!/usr/bin/env node

import { main as runMain } from "./main";
import { listTools, registerTool } from "./tools/toolRegistry";
import { mockEcho, mockEchoDescriptor } from "./tools/mockEcho";
import { loadAgent } from "./agent/loadAgent";
import { validateManifest } from "./manifest/validateManifest";

import { initCommand } from "./cli/initCommand";
import { packCommand } from "./cli/packCommand";
import { unpackCommand } from "./cli/unpackCommand";
import { agentsCommand } from "./cli/agentsCommand";

import { publishCommand } from "./cli/registry/publishCommand";
import { searchCommand } from "./cli/registry/searchCommand";
import { installCommand } from "./cli/registry/installCommand";

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  return value ?? null;
}

function printHelp() {
  console.log(`
Open Agent Protocol (OAP) Reference Runtime

Usage:
  oap run --agent <path> | --installed <id> --version <v>     Run an agent
  oap validate --agent <path>                                  Validate an agent manifest
  oap tools                                                     List available tools

  oap init --dir <path>                                        Create a new agent scaffold
  oap pack --agent <path>                                      Package an agent into a .oap file
  oap unpack --file <path>                                     Unpack a .oap into a local agents folder
  oap agents list [--store <dir>]                               List installed agents

  oap publish --agent <path> --registry <dir>                  Publish agent to a registry (local mode)
  oap search --registry <dir> <query>                          Search registry
  oap install --registry <dir> --id <agent_id> --version <v>   Install from registry to local store

  oap --help                                                   Show help

Examples:
  oap publish --agent .\\my-first-agent --registry .\\registry
  oap search --registry .\\registry myfirst
  oap install --registry .\\registry --id com.oap.myfirst --version 0.1.0
  oap agents list
  oap run --installed com.oap.myfirst --version 0.1.0
`.trim());
}

async function cmdRun() {
  await runMain();
}

async function cmdValidate() {
  const agentPath = getArg("--agent");
  if (!agentPath) {
    console.error("Missing --agent <path>");
    process.exit(1);
  }

  const loaded = loadAgent(agentPath);
  const validation = validateManifest(loaded.manifestRaw);

  if (validation.ok === false) {
    console.error("Manifest validation failed:");
    for (const err of validation.errors ?? []) console.error(`- ${err}`);
    process.exit(1);
  }

  console.log("Manifest validation: OK ✅");
}

async function cmdTools() {
  registerTool(mockEchoDescriptor, mockEcho);
  console.log(JSON.stringify(listTools(), null, 2));
}

async function cli() {
  const cmd = process.argv[2];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  if (cmd === "run") return cmdRun();
  if (cmd === "validate") return cmdValidate();
  if (cmd === "tools") return cmdTools();

  if (cmd === "init") return initCommand(process.argv);
  if (cmd === "pack") return packCommand(process.argv);
  if (cmd === "unpack") return unpackCommand(process.argv);
  if (cmd === "agents") return agentsCommand(process.argv);

  if (cmd === "publish") return publishCommand(process.argv);
  if (cmd === "search") return searchCommand(process.argv);
  if (cmd === "install") return installCommand(process.argv);

  console.error(`Unknown command: ${cmd}\n`);
  printHelp();
  process.exit(1);
}

cli().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});