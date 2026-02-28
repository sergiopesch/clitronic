#!/usr/bin/env npx tsx
import { Command } from "commander";
import { askCommand } from "../src/commands/ask.js";
import { chatCommand } from "../src/commands/chat.js";
import { identifyCommand } from "../src/commands/identify.js";
import { infoCommand } from "../src/commands/info.js";
import { listCommand } from "../src/commands/list.js";

const program = new Command();

program
  .name("clitronic")
  .description("AI-powered hardware companion for electronics enthusiasts")
  .version("0.1.0");

program
  .command("chat")
  .description("Start an interactive chat session with your hardware companion")
  .action(chatCommand);

program
  .command("ask <question...>")
  .description("Ask a one-shot question about electronics")
  .action((words: string[]) => askCommand(words.join(" ")));

program
  .command("identify <image>")
  .description("Identify an electronic component from an image")
  .action(identifyCommand);

program
  .command("info <component>")
  .description("Show detailed info about a component (e.g., resistor, led)")
  .action(infoCommand);

program
  .command("list [category]")
  .description("List components (categories: passive, active, input, output)")
  .action(listCommand);

program.parse();
