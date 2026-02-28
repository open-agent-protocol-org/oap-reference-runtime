#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */
import { initCommand } from "./cli/initCommand";
import { packCommand } from "./cli/packCommand";
import { unpackCommand } from "./cli/unpackCommand";
import { agentsCommand } from "./cli/agentsCommand";

import { publishCommand } from "./cli/registry/publishCommand";
import { searchCommand } from "./cli/registry/searchCommand";
import { installCommand } from "./cli/registry/installCommand";

import { loadAgent } from "./agent/loadAgent";
import { validateManifest } from "./manifest/validateManifest";

import {
  publisherInitCommand,
  publisherShowCommand,
  publisherSetNameCommand,
  publisherExportCommand,
} from "./cli/publisher/publisherCommands";

import { publisherProfileCommand } from "./cli/publisher/profileCommand";

function printHelp() {
  console.log(
    `
Open Agent Protocol (OAP) Reference Runtime

Usage:
  oap run --agent <path> | --installed <id> --version <v>        Run an agent
  oap validate --agent <path>                                     Validate an agent manifest
  oap tools                                                        List available tools

  oap init --dir <path>                                           Create a new agent scaffold
  oap pack --agent <path>                                         Package an agent into a .oap file
  oap unpack --file <path>                                        Unpack a .oap into a local agents folder
  oap agents list [--store <dir>]                                  List installed agents

  oap publish --agent <path> --registry <path|url>                 Publish agent to a registry (local mode)
  oap search --registry <path|url> <query>                         Search registry
  oap install --registry <path|url> --id <agent_id> --version <v>  Install from registry to local store

  oap publisher init                                               Initialize publisher identity (creates keys)
  oap publisher show                                               Show publisher identity
  oap publisher set-name --name "Display Name"                     Set publisher display name
  oap publisher export --out <file>                                Export public publisher profile JSON
  oap publisher profile --registry <url> --id <publisher_id>       Fetch publisher profile from HTTP registry
  oap publisher profile --registry <url> --me                      Fetch your own publisher profile (uses local publisher_id)

  oap --help                                                       Show help

Examples:
  oap publish --agent .\\my-first-agent --registry .\\registry
  oap search --registry http://localhost:8788 myfirst
  oap install --registry http://localhost:8788 --id com.oap.myfirst --version 0.1.0
  oap agents list
  oap run --agent .\\my-first-agent
  oap publisher show
  oap publisher profile --registry http://localhost:8788 --me
`.trim()
  );
}

function getArg(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const value = argv[idx + 1];
  return value ?? null;
}

async function runValidate(argv: string[]) {
  const agentPath = getArg(argv, "--agent");
  if (!agentPath) {
    console.error("Missing --agent <path>");
    process.exit(1);
  }
  const loaded = loadAgent(agentPath);
  const res = validateManifest(loaded.manifestRaw);
  if (!res.ok) {
    console.error("Manifest validation failed:");
    for (const err of res.errors ?? []) console.error(`- ${err}`);
    process.exit(1);
  }
  console.log("Manifest validation: OK ✅");
}

async function runTools() {
  const mod = require("./tools/toolRegistry");

  let tools: any[] | null = null;

  if (typeof mod.listTools === "function") tools = mod.listTools();
  else if (typeof mod.getAvailableTools === "function") tools = mod.getAvailableTools();
  else if (typeof mod.getToolRegistry === "function") {
    const reg = mod.getToolRegistry();
    if (reg && typeof reg.list === "function") tools = reg.list();
    else if (reg && Array.isArray(reg.tools)) tools = reg.tools;
  } else if (Array.isArray(mod.tools)) tools = mod.tools;

  if (!tools) {
    console.log("No tools available (tool registry export not found).");
    return;
  }

  console.log("Available tools:");
  console.log(JSON.stringify(tools, null, 2));
}

async function runAgent(argv: string[]) {
  // Delegate to runtime entry if present (keeps behavior consistent)
  try {
    const mainMod = require("./main");
    if (typeof mainMod.main === "function") {
      await mainMod.main(argv);
      return;
    }
    if (typeof mainMod.run === "function") {
      await mainMod.run(argv);
      return;
    }
    if (typeof mainMod.runCli === "function") {
      await mainMod.runCli(argv);
      return;
    }
  } catch {
    // ignore
  }

  // Fallback to index.ts export
  try {
    const idxMod = require("./index");
    if (typeof idxMod.main === "function") {
      await idxMod.main(argv);
      return;
    }
  } catch {
    // ignore
  }

  throw new Error("Run entrypoint not found (expected ./main or ./index to export a runner).");
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const cmd = argv[0];

  try {
    switch (cmd) {
      case "run":
        await runAgent(argv);
        return;

      case "validate":
        await runValidate(argv);
        return;

      case "tools":
        await runTools();
        return;

      case "init":
        await initCommand(argv);
        return;

      case "pack":
        await packCommand(argv);
        return;

      case "unpack":
        await unpackCommand(argv);
        return;

      case "agents":
        await agentsCommand(argv);
        return;

      case "publish":
        await publishCommand(argv);
        return;

      case "search":
        await searchCommand(argv);
        return;

      case "install":
        await installCommand(argv);
        return;

      case "publisher": {
        const sub = argv[1];

        if (!sub || sub === "--help" || sub === "-h") {
          console.log(
            `
Usage:
  oap publisher init
  oap publisher show
  oap publisher set-name --name "Display Name"
  oap publisher export --out <file>
  oap publisher profile --registry <url> --id <publisher_id>
  oap publisher profile --registry <url> --me

Examples:
  oap publisher init
  oap publisher show
  oap publisher set-name --name "OAP Labs"
  oap publisher export --out .\\registry\\publisher.json
  oap publisher profile --registry http://localhost:8788 --me
`.trim()
          );
          return;
        }

        if (sub === "init") {
          publisherInitCommand();
          return;
        }
        if (sub === "show") {
          publisherShowCommand();
          return;
        }
        if (sub === "set-name") {
          publisherSetNameCommand(argv);
          return;
        }
        if (sub === "export") {
          publisherExportCommand(argv);
          return;
        }
        if (sub === "profile") {
          await publisherProfileCommand(argv);
          return;
        }

        console.error(`Unknown publisher subcommand: ${sub}`);
        process.exit(1);
      }

      default:
        console.error(`Unknown command: ${cmd}\n`);
        printHelp();
        process.exit(1);
    }
  } catch (err: any) {
    console.error("Fatal error:", err?.message ?? String(err));
    process.exit(1);
  }
}

main();