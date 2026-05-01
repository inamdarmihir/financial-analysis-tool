/**
 * Orchestrator Agent
 *
 * The master coordinator. It:
 * 1. Enriches each query with Qdrant semantic memory
 * 2. Delegates to specialist agents with rich context
 * 3. Synthesizes multi-agent outputs into a unified report
 * 4. Extracts insights and stores them back to Qdrant (self-improving loop)
 */

import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createDeepAgent } from "deepagents";

import { getMarketResearchAgent } from "./market-research.agent.ts";
import { getStockReportAgent } from "./stock-report.agent.ts";
import { getPortfolioAgent } from "./portfolio.agent.ts";
import { getQuantAgent } from "./quant.agent.ts";
import { getMacroAgent } from "./macro.agent.ts";
import { getSentimentAgent } from "./sentiment.agent.ts";
import { qdrantMemory } from "../memory/qdrant-memory.ts";
import type { QueryType } from "../memory/research-memory.ts";

// ─── Helper: invoke a sub-agent ───────────────────────────────────────────────

async function invokeAgent(agent: any, task: string, context?: string): Promise<string> {
  const fullTask = context ? `${context}\n\n---\n\n${task}` : task;
  const result = await agent.invoke({ messages: [{ role: "user", content: fullTask }] });
  const last = result.messages[result.messages.length - 1];
  if (typeof last?.content === "string") return last.content;
  if (Array.isArray(last?.content))
    return last.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  return "No response";
}

// ─── Delegation tools ─────────────────────────────────────────────────────────

const delegateMarketResearch = tool(
  async ({ task, context }: { task: string; context?: string }) =>
    invokeAgent(getMarketResearchAgent(), task, context),
  {
    name: "delegate_market_research",
    description: "Delegate to Market Research Agent for sector trends, industry analysis, competitor comparison, trending stocks, and thematic market research.",
    schema: z.object({ task: z.string(), context: z.string().optional() }),
  }
);

const delegateStockReport = tool(
  async ({ task, context }: { task: string; context?: string }) =>
    invokeAgent(getStockReportAgent(), task, context),
  {
    name: "delegate_stock_report",
    description: "Delegate to Stock Report Agent for deep fundamental analysis: financials, valuation ratios, analyst ratings, earnings, historical returns, buy/hold/sell recommendation.",
    schema: z.object({ task: z.string(), context: z.string().optional() }),
  }
);

const delegatePortfolio = tool(
  async ({ task, context }: { task: string; context?: string }) =>
    invokeAgent(getPortfolioAgent(), task, context),
  {
    name: "delegate_portfolio",
    description: "Delegate to Portfolio Agent for portfolio P&L analysis, asset allocation, diversification risk, rebalancing strategy, and portfolio-level recommendations.",
    schema: z.object({ task: z.string(), context: z.string().optional() }),
  }
);

const delegateQuant = tool(
  async ({ task, context }: { task: string; context?: string }) =>
    invokeAgent(getQuantAgent(), task, context),
  {
    name: "delegate_quant",
    description: "Delegate to Quantitative Agent for technical indicators (RSI, MACD, Bollinger Bands), volatility analysis, support/resistance levels, and momentum signals.",
    schema: z.object({ task: z.string(), context: z.string().optional() }),
  }
);

const delegateMacro = tool(
  async ({ task, context }: { task: string; context?: string }) =>
    invokeAgent(getMacroAgent(), task, context),
  {
    name: "delegate_macro",
    description: "Delegate to Macro Agent for market regime analysis, VIX/fear index, yield curve, sector rotation, commodities, and risk-on/risk-off environment assessment.",
    schema: z.object({ task: z.string(), context: z.string().optional() }),
  }
);

const delegateSentiment = tool(
  async ({ task, context }: { task: string; context?: string }) =>
    invokeAgent(getSentimentAgent(), task, context),
  {
    name: "delegate_sentiment",
    description: "Delegate to Sentiment Agent for news sentiment scoring, short interest analysis, insider buying/selling activity, and market buzz assessment.",
    schema: z.object({ task: z.string(), context: z.string().optional() }),
  }
);

// ─── Self-improving loop tool ─────────────────────────────────────────────────

const extractAndStoreInsight = tool(
  async ({ topic, queryType, keyFindings, tickers, tags, sentiment, agentsUsed }: {
    topic: string;
    queryType: QueryType;
    keyFindings: string[];
    tickers: string[];
    tags: string[];
    sentiment: "bullish" | "bearish" | "neutral" | "mixed";
    agentsUsed: string[];
  }) => {
    try {
      const id = await qdrantMemory.storeInsight({ topic, queryType, keyFindings, tickers, tags, sentiment, agentsUsed });
      return `Insight stored successfully (id: ${id}). Memory now contains ${await qdrantMemory.getInsightCount()} research records.`;
    } catch (e) {
      return `Could not store insight: ${e}`;
    }
  },
  {
    name: "store_research_insight",
    description: "Store a distilled insight from the completed analysis into Qdrant vector memory for future use. Call this at the END of every analysis to feed the self-improving loop.",
    schema: z.object({
      topic: z.string().describe("The main subject (e.g. 'NVIDIA Q2 earnings', 'semiconductor sector outlook')"),
      queryType: z.enum(["stock_analysis","market_research","portfolio_analysis","macro_analysis","quant_analysis","sentiment_analysis","comparison","general"]),
      keyFindings: z.array(z.string()).min(2).max(8).describe("2-8 concise bullet-point findings from the analysis"),
      tickers: z.array(z.string()).describe("Ticker symbols mentioned (e.g. ['NVDA', 'AMD'])"),
      tags: z.array(z.string()).describe("Descriptive tags (e.g. ['bullish', 'high-growth', 'ai-play', 'tech'])"),
      sentiment: z.enum(["bullish", "bearish", "neutral", "mixed"]),
      agentsUsed: z.array(z.string()).describe("Which specialist agents contributed to this analysis"),
    }),
  }
);

// ─── Orchestrator system prompt ───────────────────────────────────────────────

const buildOrchestratorPrompt = (memoryContext: string, userProfileContext: string) => `
You are **Dexter**, the lead AI Financial Research Orchestrator coordinating a team of 6 specialist agents.

## Your Specialist Team
| Agent | Capability |
|-------|-----------|
| \`delegate_market_research\` | Sector trends, news, competitor analysis, thematic research |
| \`delegate_stock_report\` | Fundamental analysis, financials, valuation, analyst ratings |
| \`delegate_quant\` | RSI, MACD, Bollinger Bands, volatility, price levels |
| \`delegate_macro\` | Market regime, VIX, yield curve, sector rotation, commodities |
| \`delegate_sentiment\` | News sentiment, short interest, insider activity |
| \`delegate_portfolio\` | Portfolio P&L, allocation, diversification, rebalancing |

## Core Workflow

### Step 1 — Understand the Request
- Parse the user's natural language query fully
- Reference the user profile and past research below to personalize the response
- For COMPREHENSIVE analyses, call MULTIPLE agents and synthesize their views

### Step 2 — Delegate Strategically  
- **Stock deep-dive**: always use stock_report + quant + sentiment (3 agents minimum)
- **Market research**: use market_research + macro + sentiment
- **Portfolio review**: use portfolio + macro (for environment context)
- **Macro outlook**: use macro + market_research + sentiment
- Always pass relevant prior context to sub-agents via the \`context\` parameter

### Step 3 — Synthesize
Combine all agent outputs into a single coherent report with:
- **Executive Summary** (3-5 sentences)
- Clearly labeled sections per agent contribution
- **Overall Verdict** with confidence level
- **Actionable Recommendations** (specific, not vague)
- **Key Risks** to watch

### Step 4 — Store Insight (ALWAYS DO THIS LAST)
After EVERY completed analysis, call \`store_research_insight\` to:
- Distill the 3-8 most important findings
- Tag tickers, sentiment, and query type
- Feed the self-improving memory loop

## Self-Improving Memory
${memoryContext || "No prior research in memory yet — this is a fresh session."}

## User Profile
${userProfileContext || "No profile data yet — learn from this conversation."}

## Principles
- NEVER fabricate data. All numbers come from agent tools only.
- Always ask ONE targeted follow-up if a query is ambiguous — don't guess.  
- For portfolio questions, always ask for holdings if not provided.
- Provide institutional-grade depth: specific numbers, dates, percentages — not vague generalities.
- Format everything in clean Markdown with headers, tables, and bullet points.
`.trim();

// ─── Factory ──────────────────────────────────────────────────────────────────

export const getOrchestratorAgent = async (query: string, tickers: string[]) => {
  // 1. Semantic search for relevant past insights
  const pastInsights = await qdrantMemory.searchRelevant(query, {
    limit: 4,
    filterTickers: tickers.length > 0 ? tickers : undefined,
  });
  const memoryContext = qdrantMemory.formatAsContext(pastInsights);

  // 2. Get user profile from memory
  const { memory } = await import("../memory/research-memory.ts");
  await memory.init();
  const userProfileContext = memory.formatProfileAsContext();

  const model = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 });

  return createDeepAgent({
    model: model as any,
    tools: [
      delegateMarketResearch,
      delegateStockReport,
      delegatePortfolio,
      delegateQuant,
      delegateMacro,
      delegateSentiment,
      extractAndStoreInsight,
    ] as any,
    systemPrompt: buildOrchestratorPrompt(memoryContext, userProfileContext),
  });
};
