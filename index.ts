#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import { getFinancialAgent } from "./agent";
import fs from "fs/promises";
import path from "path";
import * as dotenv from "dotenv";
import * as readline from "readline/promises";

dotenv.config();

const program = new Command();

program
  .name("dexter")
  .description("Autonomous Financial Research Agent")
  .version("1.0.0");

const HISTORY_FILE = path.join(process.cwd(), ".dexter_history.json");

async function loadHistory(): Promise<any[]> {
  try {
    const data = await fs.readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function saveHistory(messages: any[]) {
  try {
    await fs.writeFile(HISTORY_FILE, JSON.stringify(messages, null, 2), "utf-8");
  } catch (e) {
    // Ignore save errors
  }
}

async function clearHistory() {
  try {
    await fs.unlink(HISTORY_FILE);
  } catch (e) {
    // Ignore if doesn't exist
  }
}

async function runInteractiveChat(initialPrompt?: string) {
  if (!process.env.OPENAI_API_KEY) {
    console.error(chalk.red("Error: OPENAI_API_KEY environment variable is missing."));
    console.log(chalk.yellow("Please create a .env file with OPENAI_API_KEY=your_key or export it in your shell."));
    process.exit(1);
  }

  const agent = getFinancialAgent();
  let messages = await loadHistory();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.bold.blue("========================================"));
  console.log(chalk.bold.blue("      Dexter - Financial Agent          "));
  console.log(chalk.bold.blue("========================================"));
  console.log(chalk.dim("Slash Commands: /reset, /exit, /help\n"));

  if (initialPrompt) {
    messages.push({ role: "user", content: initialPrompt });
  }

  while (true) {
    try {
      if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
        const userInput = await rl.question(chalk.green("\n❯ What would you like to research? \n  "));
        
        const command = userInput.trim().toLowerCase();

        if (command === "/exit" || command === "exit" || command === "quit") {
          console.log(chalk.blue("Goodbye!"));
          break;
        }

        if (command === "/reset" || command === "/new") {
          messages = [];
          await clearHistory();
          console.log(chalk.yellow("Memory cleared. Starting a new session.\n"));
          continue;
        }

        if (command === "/help") {
          console.log(chalk.cyan("Available Commands:"));
          console.log(chalk.cyan("  /reset  - Clear the conversation history"));
          console.log(chalk.cyan("  /exit   - Exit the CLI"));
          console.log(chalk.cyan("  /help   - Show this menu"));
          continue;
        }

        if (userInput.trim() !== "") {
          messages.push({ role: "user", content: userInput });
          await saveHistory(messages);
        }
      }

      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === "user") {
        console.log(chalk.dim("\nThinking..."));
        
        const response = await agent.invoke(
          { messages },
          {
            callbacks: [
              {
                handleLLMNewToken(token: string) {
                  process.stdout.write(chalk.cyan(token));
                },
                handleToolStart(tool: any, input: any, runId: string, parentRunId: string, tags: string[], metadata: any, name: string) {
                  console.log(chalk.yellow(`\n\n[Running Tool: ${name || tool.id?.[tool.id.length - 1]}]`));
                  console.log(chalk.dim(JSON.stringify(input)));
                },
                handleToolEnd(output: any, runId: string, parentRunId?: string, tags?: string[]) {
                  console.log(chalk.yellow(`\n[Tool Finished]`));
                }
              }
            ]
          }
        );

        messages = response.messages;
        await saveHistory(messages);
        console.log(); // Add a newline after the final streamed output
      }
    } catch (e: any) {
       console.error(chalk.red("\nAn error occurred during analysis:"));
       console.error(e.message);
       break;
    }
  }

  rl.close();
}

program
  .argument("[query...]", "Natural language query to start the research")
  .option("-p, --portfolio <json>", "JSON string of the portfolio")
  .option("-f, --file <path>", "Path to the JSON file containing the portfolio")
  .action(async (queryArgs, options) => {
    let initialPrompt = "";

    if (options.file) {
      try {
        const fileContent = await fs.readFile(options.file, "utf-8");
        initialPrompt += `Here is a portfolio file I provided: ${fileContent}\n\n`;
      } catch (e: any) {
        console.error(chalk.red("Failed to read file:"), e.message);
        process.exit(1);
      }
    }

    if (options.portfolio) {
      initialPrompt += `Here is a portfolio string I provided: ${options.portfolio}\n\n`;
    }

    if (queryArgs && queryArgs.length > 0) {
      initialPrompt += queryArgs.join(" ");
    }

    await runInteractiveChat(initialPrompt.trim() !== "" ? initialPrompt.trim() : undefined);
  });

program.parse();
