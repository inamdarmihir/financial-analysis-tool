#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import * as dotenv from "dotenv";
import * as readline from "readline/promises";

import { getOrchestratorAgent } from "./agents/orchestrator.agent.ts";
import { memory } from "./memory/research-memory.ts";
import { qdrantMemory } from "./memory/qdrant-memory.ts";
import {
  classifyIntent,
  generateClarificationQuestions,
  extractTickers,
} from "./clarification/intent-classifier.ts";

dotenv.config();

const program = new Command();
program.name("dexter").description("Dexter — Multi-Agent Financial Research System").version("2.0.0");

const HISTORY_FILE = path.join(process.cwd(), ".dexter_history.json");

async function loadHistory(): Promise<any[]> {
  try { return JSON.parse(await fs.readFile(HISTORY_FILE, "utf-8")); } catch { return []; }
}
async function saveHistory(messages: any[]) {
  try { await fs.writeFile(HISTORY_FILE, JSON.stringify(messages, null, 2), "utf-8"); } catch { /* ignore */ }
}
async function clearHistory() {
  try { await fs.unlink(HISTORY_FILE); } catch { /* ignore */ }
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function printBanner(qdrantStatus: boolean) {
  console.log(chalk.bold.cyan("\n╔══════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║     DEXTER ─ Multi-Agent Financial Research System   ║"));
  console.log(chalk.bold.cyan("╚══════════════════════════════════════════════════════╝\n"));
  console.log(chalk.dim("  Specialist Agents:"));
  console.log(chalk.dim("  📊  Market Research  ─ sector trends, competitors, news"));
  console.log(chalk.dim("  📈  Stock Report     ─ fundamentals, valuation, earnings"));
  console.log(chalk.dim("  📉  Quantitative     ─ RSI, MACD, volatility, technicals"));
  console.log(chalk.dim("  🌍  Macro            ─ VIX, yield curve, sector rotation"));
  console.log(chalk.dim("  🧠  Sentiment        ─ news scoring, short interest, insider"));
  console.log(chalk.dim("  💼  Portfolio        ─ P&L, allocation, rebalancing\n"));

  const qdrantIcon = qdrantStatus ? chalk.green("● Qdrant") : chalk.yellow("○ Qdrant");
  console.log(`  Memory: ${qdrantIcon} ${qdrantStatus ? chalk.dim("(semantic vector search active)") : chalk.dim("(fallback: keyword search)")}`);
  console.log(chalk.dim("\n  Just ask naturally. Dexter clarifies, then deep-researches."));
  console.log(chalk.dim("  Commands: /reset  /memory  /profile  /agents  /help  /exit\n"));
}

// ─── Clarification loop ───────────────────────────────────────────────────────

async function runClarificationLoop(
  rl: readline.Interface,
  initialInput: string
): Promise<{ finalQuery: string; clarifications: Record<string, string> }> {
  const profile = memory.getUserProfile();
  const intent = classifyIntent(initialInput);
  const questions = generateClarificationQuestions(intent, profile);

  if (questions.length === 0 || intent.confidence === "high") {
    return { finalQuery: initialInput, clarifications: {} };
  }

  console.log(chalk.bold.yellow("\n🔍 Let me ask a couple of quick questions to give you the best analysis:\n"));

  const clarifications: Record<string, string> = {};
  const answeredParts: string[] = [`User query: ${initialInput}`];

  for (const q of questions) {
    console.log(chalk.cyan(q));
    const answer = await rl.question(chalk.green("   ↳ "));
    if (answer.trim()) {
      clarifications[q] = answer.trim();
      answeredParts.push(`Q: ${q.replace(/[\n\s]+/g, " ").trim()}\nA: ${answer.trim()}`);
    }
    console.log();
  }

  // Update user profile from answers
  const allAnswers = Object.values(clarifications).join(" ").toLowerCase();
  const profileUpdates: any = {};
  if (/conservative/.test(allAnswers)) profileUpdates.riskTolerance = "conservative";
  else if (/aggressive/.test(allAnswers)) profileUpdates.riskTolerance = "aggressive";
  else if (/moderate/.test(allAnswers)) profileUpdates.riskTolerance = "moderate";
  if (/short.?term|<1y/.test(allAnswers)) profileUpdates.investmentHorizon = "short";
  else if (/long.?term|3y/.test(allAnswers)) profileUpdates.investmentHorizon = "long";
  else if (/medium|1.?3/.test(allAnswers)) profileUpdates.investmentHorizon = "medium";
  const tickers = extractTickers(allAnswers + " " + initialInput);
  if (tickers.length > 0) profileUpdates.mentionedTickers = tickers;
  if (Object.keys(profileUpdates).length > 0) await memory.updateUserProfile(profileUpdates);

  return {
    finalQuery: answeredParts.join("\n\n"),
    clarifications,
  };
}

// ─── Tool label map ───────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  delegate_market_research: "📊 Market Research Agent",
  delegate_stock_report:    "📈 Stock Report Agent",
  delegate_portfolio:       "💼 Portfolio Agent",
  delegate_quant:           "📉 Quantitative Agent",
  delegate_macro:           "🌍 Macro Agent",
  delegate_sentiment:       "🧠 Sentiment Agent",
  store_research_insight:   "💾 Storing to Qdrant memory...",
};

// ─── Main chat loop ───────────────────────────────────────────────────────────

async function runInteractiveChat(initialPrompt?: string) {
  if (!process.env.OPENAI_API_KEY) {
    console.error(chalk.red("✖ OPENAI_API_KEY is not set."));
    console.log(chalk.yellow("  Create a .env file: OPENAI_API_KEY=sk-..."));
    process.exit(1);
  }

  // Initialize memory
  await memory.init();
  await memory.updateUserProfile({ sessionCount: 1 });
  const qdrantOk = await qdrantMemory.init();
  const stats = memory.getStats();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  printBanner(qdrantOk);

  if (stats.totalInsights > 0) {
    console.log(chalk.dim(`  📚 Memory: ${stats.totalInsights} research records | ${stats.sessionCount} sessions | Top tickers: ${stats.topTickers.join(", ") || "none yet"}\n`));
  }

  let messages = await loadHistory();

  // Handle initial prompt from CLI args
  if (initialPrompt) {
    messages.push({ role: "user", content: initialPrompt });
  }

  while (true) {
    try {
      let rawInput = "";

      // Get input if no pending user message
      if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
        rawInput = await rl.question(chalk.green("\n❯ "));
        const cmd = rawInput.trim().toLowerCase();

        // ── Commands ──
        if (cmd === "/exit" || cmd === "exit" || cmd === "quit") {
          console.log(chalk.cyan("\nGoodbye! Happy investing. 📈\n")); break;
        }

        if (cmd === "/reset" || cmd === "/new") {
          messages = [];
          await clearHistory();
          console.log(chalk.yellow("\n✓ Session cleared. Starting fresh.\n")); continue;
        }

        if (cmd === "/memory") {
          const recent = await qdrantMemory.getRecentInsights(5);
          const count = await qdrantMemory.getInsightCount();
          console.log(chalk.bold.cyan(`\n🧠 Qdrant Memory — ${count} total insights\n`));
          if (recent.length === 0) { console.log(chalk.dim("  No insights stored yet.\n")); }
          else {
            recent.forEach((ins, i) => {
              console.log(chalk.cyan(`  ${i + 1}. ${ins.topic} (${new Date(ins.timestamp).toLocaleDateString()}) — ${ins.sentiment}`));
              ins.keyFindings.slice(0, 2).forEach((f) => console.log(chalk.dim(`     • ${f}`)));
            });
            console.log();
          }
          continue;
        }

        if (cmd === "/profile") {
          const p = memory.getUserProfile();
          console.log(chalk.bold.cyan("\n👤 Your Profile (learned over time)\n"));
          console.log(chalk.dim(`  Risk Tolerance:    ${p.riskTolerance}`));
          console.log(chalk.dim(`  Investment Style:  ${p.investmentStyle}`));
          console.log(chalk.dim(`  Horizon:           ${p.investmentHorizon}`));
          console.log(chalk.dim(`  Sectors:           ${p.preferredSectors.join(", ") || "none yet"}`));
          console.log(chalk.dim(`  Discussed Tickers: ${p.mentionedTickers.join(", ") || "none yet"}`));
          console.log(chalk.dim(`  Sessions:          ${p.sessionCount}\n`));
          continue;
        }

        if (cmd === "/agents") {
          console.log(chalk.bold.cyan("\n🤖 Specialist Agents\n"));
          const agents = [
            ["📊", "Market Research", "Sector trends, industry analysis, competitor comparison, trending stocks"],
            ["📈", "Stock Report",    "Full fundamental report: financials, PE ratios, earnings, analyst ratings"],
            ["📉", "Quantitative",    "RSI, MACD, Bollinger Bands, volatility profile, support/resistance"],
            ["🌍", "Macro",          "S&P500, VIX fear index, yield curve, sector rotation, commodities"],
            ["🧠", "Sentiment",      "News sentiment scoring, short interest, insider buying/selling"],
            ["💼", "Portfolio",      "P&L analysis, allocation breakdown, diversification, rebalancing advice"],
          ];
          agents.forEach(([icon, name, desc]) => {
            console.log(chalk.cyan(`  ${icon} ${chalk.bold(name)}`));
            console.log(chalk.dim(`     ${desc}\n`));
          });
          continue;
        }

        if (cmd === "/help") {
          console.log(chalk.cyan("\n  /reset    — Clear conversation history"));
          console.log(chalk.cyan("  /memory   — Show recent Qdrant memory contents"));
          console.log(chalk.cyan("  /profile  — Show your learned user profile"));
          console.log(chalk.cyan("  /agents   — Show all specialist agents"));
          console.log(chalk.cyan("  /exit     — Exit Dexter\n"));
          continue;
        }

        if (rawInput.trim() === "") continue;

        // ── Clarification loop ──
        const { finalQuery } = await runClarificationLoop(rl, rawInput.trim());
        messages.push({ role: "user", content: finalQuery });
        await saveHistory(messages);
      }

      // Process the user message
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role !== "user") continue;

      const queryText = typeof lastMsg.content === "string" ? lastMsg.content : "";
      const tickers = extractTickers(queryText);

      // Build a fresh orchestrator with Qdrant context for this query
      const agent = await getOrchestratorAgent(queryText, tickers);

      // Progress spinner
      let dotInterval: Timer | null = setInterval(() => process.stdout.write(chalk.dim(".")), 700);
      process.stdout.write(chalk.dim("\n⚙  Analyzing"));

      const clearDots = () => {
        if (dotInterval) { clearInterval(dotInterval); dotInterval = null; }
      };

      const response = await agent.invoke(
        { messages },
        {
          callbacks: [{
            handleToolStart(_: any, __: any, ___: string, ____: string, _____: string[], ______: any, name: string) {
              clearDots();
              const label = TOOL_LABELS[name] ?? name;
              console.log(chalk.yellow(`\n\n→ ${label}`));
              dotInterval = setInterval(() => process.stdout.write(chalk.dim(".")), 700);
            },
            handleToolEnd() {
              clearDots();
              process.stdout.write(chalk.dim(" ✓"));
            },
          }],
        }
      );

      clearDots();
      process.stdout.write("\n\n");

      messages = response.messages;
      await saveHistory(messages);

      // Print final response
      const aiMsg = messages[messages.length - 1];
      const content = typeof aiMsg?.content === "string"
        ? aiMsg.content
        : Array.isArray(aiMsg?.content)
        ? aiMsg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("")
        : "";

      if (content) {
        console.log(chalk.white(content));
        console.log(chalk.dim("\n─────────────────────────────────────────────────────────\n"));
      }

    } catch (e: any) {
      console.error(chalk.red("\n✖ Error:"), e.message);
      if (process.env.DEBUG === "true") console.error(e.stack);
    }
  }

  rl.close();
}

// ─── CLI entrypoint ────────────────────────────────────────────────────────────

program
  .argument("[query...]", "Natural language query to start immediately")
  .option("-p, --portfolio <json>", "JSON string of portfolio holdings")
  .option("-f, --file <path>", "Path to a file with portfolio or query context")
  .action(async (queryArgs, options) => {
    let initialPrompt = "";

    if (options.file) {
      try {
        const content = await fs.readFile(options.file, "utf-8");
        initialPrompt += `Context file:\n\`\`\`\n${content}\n\`\`\`\n\n`;
      } catch (e: any) {
        console.error(chalk.red("Failed to read file:"), e.message); process.exit(1);
      }
    }
    if (options.portfolio) initialPrompt += `My portfolio: ${options.portfolio}\n\n`;
    if (queryArgs?.length > 0) initialPrompt += queryArgs.join(" ");

    await runInteractiveChat(initialPrompt.trim() || undefined);
  });

program.parse();
