# 🌌 Astra — Multi-Agent Financial Research System

> Inspired by [hermes-agent](https://github.com/nousresearch/hermes-agent)'s self-improving agent architecture — built for financial research.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.x-fbf0df?logo=bun&logoColor=black)](https://bun.sh)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai&logoColor=white)](https://platform.openai.com/)
[![Powered by Qdrant](https://img.shields.io/badge/Powered%20by-Qdrant-DC244C?logo=qdrant&logoColor=white)](https://qdrant.tech)
[![LangChain](https://img.shields.io/badge/LangChain-0.3.x-1C3C3C?logo=langchain&logoColor=white)](https://langchain.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A terminal-based AI financial research system with **6 specialist agents**, **Qdrant-powered semantic memory**, a **self-improving research loop**, and a **natural language clarification engine**. Just describe what you want — Astra asks the right follow-up questions, coordinates the right experts, and stores what it learns for next time.

> ⚠️ **Disclaimer:** This tool is for **educational and informational purposes only**. It does not constitute financial advice, investment recommendations, or professional financial guidance of any kind. Always consult a licensed financial advisor before making any investment decisions.

---

## 🏗️ Architecture

```
User (natural language)
          │
          ▼
  ┌────────────────────────┐
  │  Clarification Engine  │  ← Classifies intent, asks targeted follow-ups
  └────────────┬───────────┘
               │
               ▼
  ┌────────────────────────┐     ┌─────────────────────────────┐
  │   Orchestrator Agent   │────▶│  Qdrant Vector Memory        │
  │        (Astra)         │◀────│  Semantic search of past     │
  └────────────┬───────────┘     │  research across sessions    │
               │                 └─────────────────────────────┘
    delegates to 6 specialists
    ┌─────┬──────┬──────┬──────┬──────┐
    ▼     ▼      ▼      ▼      ▼      ▼
  📊    📈     📉     🌍     🧠     💼
Market Stock  Quant  Macro  Senti- Port-
Rsrch  Report        ment   folio
               │
               ▼
    store_research_insight → Qdrant
    (self-improving loop)
```

---

## 🤖 Specialist Agents

| Agent | Specialization | Key Tools |
|-------|---------------|-----------|
| 📊 **Market Research** | Sector trends, competitors, thematic research | `get_sector_overview`, `search_market_news`, `get_competitors`, `get_trending_stocks` |
| 📈 **Stock Report** | Deep fundamental analysis & valuation | `get_stock_price`, `get_company_info`, `get_financials`, `get_historical_prices`, `get_analyst_ratings` |
| 📉 **Quantitative** | Technical indicators & price signals | `get_technical_indicators` (RSI/MACD/BB), `get_volatility_profile`, `get_price_targets` |
| 🌍 **Macro** | Market regime, rates, commodities | `get_market_snapshot`, `get_yield_curve`, `get_sector_performance`, `get_commodities_and_currencies` |
| 🧠 **Sentiment** | News scoring, short interest, insider activity | `get_news_sentiment`, `get_short_interest_and_insider` |
| 💼 **Portfolio** | P&L, allocation, rebalancing | `get_portfolio_snapshot`, portfolio math via `calculator` |
| 🎯 **Orchestrator** | Routes, synthesizes, stores insights | `delegate_*` × 6, `store_research_insight` |

---

## 🧠 Qdrant Vector Memory (Self-Improving Loop)

Powered by **[Qdrant](https://qdrant.tech)** — the high-performance vector database built for AI.

```
Query → OpenAI Embeddings → Qdrant search → Relevant past insights
                                                       ↓
                            Injected as context into Orchestrator
                                                       ↓
                         Specialists produce analysis
                                                       ↓
                   Orchestrator distills key findings → Qdrant store
                              (self-improving loop)
```

**Why Qdrant matters:**
- 🔍 Semantic search finds `"chip supply chain"` when you ask about `"semiconductor demand"` — keyword search can't do this
- 📈 Insights accumulate across sessions — the more you use Astra, the smarter it gets
- 🎯 Filtered by ticker, query type, and sentiment for precision retrieval
- 🔄 Falls back to keyword-based JSON matching if Qdrant is unavailable

### ⚙️ Setting up Qdrant

**Option A — Docker (recommended for local use):**
```bash
docker run -p 6333:6333 qdrant/qdrant
```

**Option B — Qdrant Cloud (free tier):**
1. Sign up at [cloud.qdrant.io](https://cloud.qdrant.io)
2. Create a cluster and get your URL + API key
3. Set in `.env`:
```env
QDRANT_HOST=https://your-cluster-id.us-east4-0.gcp.cloud.qdrant.io
QDRANT_PORT=6333
QDRANT_API_KEY=your_api_key_here
```

> 💡 **Without Qdrant:** Astra still works fully — it falls back to keyword-based JSON memory automatically. You'll see `○ Qdrant (fallback: keyword search)` in the banner.

---

## 🔍 Clarification Engine

Before delegating to specialists, Astra classifies intent and asks targeted follow-up questions:

```
User: "Tell me about Apple"
                │
                ▼
  Intent: stock_analysis (medium confidence)
  Missing: time_horizon, risk_tolerance, analysis_depth
                │
                ▼
  Astra asks:
    📋 What depth for AAPL analysis?
      a) Full fundamental (financials, valuation, analyst views)
      b) Technical/quant (momentum, volatility, signals)
      c) Competitive landscape (peer comparison)
      d) Full comprehensive deep-dive

    ⚖️  What is your risk tolerance? (conservative/moderate/aggressive)
    📅 Investment time horizon? (short/medium/long term)
                │
                ▼
  User answers → profile updated in memory → enriched query → agents
```

The clarification engine:
- 🧠 Detects 8 query types: `stock_analysis`, `market_research`, `portfolio_analysis`, `macro_analysis`, `quant_analysis`, `sentiment_analysis`, `comparison`, `general`
- ⏭️ Skips questions already answered in your learned user profile
- 💾 Updates your profile from every answer (persistent across sessions)
- 🎯 Generates at most 3 targeted questions — never interrogates the user

---

## 🚀 Quick Start

### 1. 🔧 Prerequisites
```bash
# Bun runtime (v1.x)
curl -fsSL https://bun.sh/install | bash

# Qdrant (optional but recommended)
docker run -p 6333:6333 qdrant/qdrant
```

### 2. 📦 Install Dependencies
```bash
git clone https://github.com/inamdarmihir/financial-analysis-tool
cd financial-analysis-tool
bun install
```

### 3. 🔑 Configure Environment
```bash
cp .env.example .env
# Edit .env with your keys
```

```env
# Required
OPENAI_API_KEY=sk-...

# Optional — Qdrant (local Docker default shown)
QDRANT_HOST=http://localhost
QDRANT_PORT=6333

# Optional — Qdrant Cloud
# QDRANT_HOST=https://xyz.cloud.qdrant.io
# QDRANT_API_KEY=your_cloud_api_key

# Optional
DEBUG=false
```

### 4. ▶️ Run Astra
```bash
# Interactive session
bun start

# Start with an immediate query
bun start "Give me a comprehensive analysis of NVIDIA"

# Portfolio analysis
bun start --portfolio '[{"ticker":"AAPL","shares":10,"avgCost":150}]'

# Load portfolio from file
bun start --file portfolio.json "Am I well diversified?"
```

---

## 💬 Example Queries

Astra handles **pure natural language** — no syntax required:

```
"Give me a deep dive on Tesla — fundamentals, technicals, and sentiment"
"What's happening in the AI semiconductor space?"
"Compare NVIDIA vs AMD vs Intel"
"I have AAPL 10@150, MSFT 5@300, NVDA 3@500 — am I overexposed to tech?"
"What does the macro environment look like for equity investors right now?"
"Is TSLA overbought? Give me the technical picture"
"Which sectors are leading today and why?"
"Analyze my portfolio for recession risk"
"What are insiders doing at Microsoft?"
```

---

## 🛠️ CLI Commands

| Command | Description |
|---------|-------------|
| `/memory` | 🗄️ View recent Qdrant memory contents |
| `/profile` | 👤 Show your learned user profile (risk, horizon, style) |
| `/agents` | 🤖 Display all specialist agents and their capabilities |
| `/reset` | 🔄 Clear conversation history (memory persists) |
| `/help` | ❓ Show available commands |
| `/exit` | 🚪 Exit Astra |

---

## 📁 Project Structure

```
astra/
├── index.ts                          # CLI entry point + clarification loop
│
├── agents/
│   ├── orchestrator.agent.ts         # Master coordinator + Qdrant integration
│   ├── market-research.agent.ts      # Sector & news research
│   ├── stock-report.agent.ts         # Fundamental stock analysis
│   ├── quant.agent.ts                # Technical indicators & volatility
│   ├── macro.agent.ts                # Macroeconomic analysis
│   ├── sentiment.agent.ts            # News sentiment & insider activity
│   └── portfolio.agent.ts            # Portfolio P&L & risk
│
├── tools/
│   ├── market-research.tools.ts      # Sector ETFs, news, competitors, trending
│   ├── stock-report.tools.ts         # Price, financials, historical, ratings
│   ├── quant.tools.ts                # RSI, MACD, Bollinger, volatility
│   ├── macro.tools.ts                # VIX, yield curve, sector ETFs, FX
│   └── portfolio.tools.ts            # Portfolio snapshot + P&L
│
├── memory/
│   ├── qdrant-memory.ts              # Qdrant vector store (primary memory)
│   └── research-memory.ts            # User profile + JSON fallback memory
│
├── clarification/
│   └── intent-classifier.ts          # Query type detection + follow-up Q's
│
├── .astra_memory/                    # Local memory files (auto-created)
│   ├── insights_fallback.json        # JSON fallback when Qdrant unavailable
│   ├── user_profile.json             # Persistent user profile
│   └── patterns.json                 # Successful research patterns
│
└── .env                              # API keys (not committed)
```

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ Yes | — | Powers all LLM agents + embeddings |
| `QDRANT_HOST` | No | `http://localhost` | Qdrant server hostname |
| `QDRANT_PORT` | No | `6333` | Qdrant server port |
| `QDRANT_API_KEY` | No | — | Required for Qdrant Cloud |
| `DEBUG` | No | `false` | Enable verbose error stack traces |

---

## 📦 Tech Stack

| Layer | Package | Version |
|-------|---------|---------|
| ⚡ Runtime | [Bun](https://bun.sh) | `^1.0` |
| 🔤 Language | TypeScript | `^5.0` |
| 🤖 Agent Framework | [deepagents](https://npmjs.com/package/deepagents) | `^0.5.0` |
| 🔗 LLM Orchestration | [LangChain](https://langchain.com) | `^0.3.0` |
| 🧠 LLM | OpenAI GPT-4o | `gpt-4o` |
| 🔢 Embeddings | OpenAI | `text-embedding-3-small` |
| 🗄️ Vector DB | [Qdrant](https://qdrant.tech) (`@qdrant/js-client-rest`) | `^1.17.0` |
| 📈 Market Data | [yahoo-finance2](https://npmjs.com/package/yahoo-finance2) | `^3.14.0` |
| 🖥️ CLI | [Commander.js](https://npmjs.com/package/commander) + [Chalk](https://npmjs.com/package/chalk) | `^12.0` / `^5.0` |

---

## 🔑 Design Principles

- 🗣️ **No hardcoded commands** — pure natural language, intent-classified automatically
- ❓ **Clarification before analysis** — ask precisely what's needed, never more than 3 questions
- 🤝 **Multi-agent by default** — stock deep-dives invoke 3+ agents, not just one
- 🧠 **Semantic memory** — Qdrant stores embeddings of every analysis for cross-session learning
- 🔁 **Self-improving loop** — every completed analysis is distilled and stored back to Qdrant
- 🛡️ **Graceful degradation** — Qdrant offline? Falls back to keyword JSON. Still fully functional.
- 📡 **Live data only** — all financial data fetched in real-time from Yahoo Finance

---

## ⚠️ Disclaimer

This project is intended **for educational and informational purposes only**. Nothing produced by this tool constitutes financial advice, investment recommendations, or professional financial guidance. All data is sourced from public APIs and may be inaccurate, delayed, or incomplete. **Do not make investment decisions based on the output of this tool.** The contributors assume no liability for any financial decisions made using this software. Consult a licensed financial professional before investing.

---

<div align="center">
  <sub>Powered by <a href="https://qdrant.tech">Qdrant</a> · Built with <a href="https://bun.sh">Bun</a> · Inspired by <a href="https://github.com/nousresearch/hermes-agent">hermes-agent</a></sub>
</div>
