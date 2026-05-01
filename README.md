# Dexter — Multi-Agent Financial Research System

> Inspired by [hermes-agent](https://github.com/nousresearch/hermes-agent)'s self-improving agent architecture — built for financial research.

A terminal-based AI financial research system with **6 specialist agents**, **Qdrant-powered semantic memory**, a **self-improving research loop**, and a **natural language clarification engine**. Just describe what you want — Dexter asks the right follow-up questions, coordinates the right experts, and stores what it learns for next time.

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
  │        (Dexter)        │◀────│  Semantic search of past     │
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
| **📊 Market Research** | Sector trends, competitors, thematic research | `get_sector_overview`, `search_market_news`, `get_competitors`, `get_trending_stocks` |
| **📈 Stock Report** | Deep fundamental analysis & valuation | `get_stock_price`, `get_company_info`, `get_financials`, `get_historical_prices`, `get_analyst_ratings` |
| **📉 Quantitative** | Technical indicators & price signals | `get_technical_indicators` (RSI/MACD/BB), `get_volatility_profile`, `get_price_targets` |
| **🌍 Macro** | Market regime, rates, commodities | `get_market_snapshot`, `get_yield_curve`, `get_sector_performance`, `get_commodities_and_currencies` |
| **🧠 Sentiment** | News scoring, short interest, insider activity | `get_news_sentiment`, `get_short_interest_and_insider` |
| **💼 Portfolio** | P&L, allocation, rebalancing | `get_portfolio_snapshot`, portfolio math via `calculator` |
| **🎯 Orchestrator** | Routes, synthesizes, stores insights | `delegate_*` × 6, `store_research_insight` |

---

## 🧠 Qdrant Vector Memory (Self-Improving Loop)

Dexter uses **Qdrant** as a vector database to build semantic memory across sessions:

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
- Semantic search finds `"chip supply chain"` when you ask about `"semiconductor demand"` — keyword search can't do this
- Insights accumulate across sessions — the more you use Dexter, the smarter it gets
- Filtered by ticker, query type, and sentiment for precision retrieval
- Falls back to keyword-based JSON matching if Qdrant is unavailable

### Setting up Qdrant

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

> **Without Qdrant:** Dexter still works fully — it falls back to keyword-based JSON memory automatically. You'll see `○ Qdrant (fallback: keyword search)` in the banner.

---

## 🔍 Clarification Engine

Before delegating to specialists, Dexter classifies intent and asks targeted follow-up questions:

```
User: "Tell me about Apple"
                │
                ▼
  Intent: stock_analysis (medium confidence)
  Missing: time_horizon, risk_tolerance, analysis_depth
                │
                ▼
  Dexter asks:
    📋 What depth for AAPL analysis?
      a) Full fundamental (financials, valuation, analyst views)
      b) Technical/quant (momentum, volatility, signals)
      c) Competitive landscape (peer comparison)
      d) Full comprehensive deep-dive

    ⚖️ What is your risk tolerance? (conservative/moderate/aggressive)
    📅 Investment time horizon? (short/medium/long term)
                │
                ▼
  User answers → profile updated in memory → enriched query → agents
```

The clarification engine:
- Detects 8 query types: `stock_analysis`, `market_research`, `portfolio_analysis`, `macro_analysis`, `quant_analysis`, `sentiment_analysis`, `comparison`, `general`
- Skips questions already answered in your learned user profile
- Updates your profile from every answer (persistent across sessions)
- Generates at most 3 targeted questions — never interrogates the user

---

## 🚀 Quick Start

### 1. Prerequisites
```bash
# Bun runtime
curl -fsSL https://bun.sh/install | bash

# Qdrant (optional but recommended)
docker run -p 6333:6333 qdrant/qdrant
```

### 2. Install dependencies
```bash
cd financial-analysis-tool
bun install
```

### 3. Configure environment
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
DEBUG=true
```

### 4. Run Dexter
```bash
# Interactive session
bun start

# Start with an immediate query
bun start "Give me a comprehensive analysis of NVIDIA"

# Portfolio analysis
bun start --portfolio '[{"ticker":"AAPL","shares":10,"avgCost":150}]'

# Load from file
bun start --file portfolio.json "Am I well diversified?"
```

---

## 💬 Example Queries

Dexter handles **pure natural language** — no syntax required:

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
| `/memory` | View recent Qdrant memory contents |
| `/profile` | Show your learned user profile (risk, horizon, style) |
| `/agents` | Display all specialist agents and their capabilities |
| `/reset` | Clear conversation history (memory persists) |
| `/help` | Show available commands |
| `/exit` | Exit Dexter |

---

## 📁 Project Structure

```
financial-analysis-tool/
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
├── .dexter_memory/                   # Local memory files (auto-created)
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

## 🔑 Design Principles

- **No hardcoded commands** — pure natural language, intent-classified automatically
- **Clarification before analysis** — ask precisely what's needed, never more than 3 questions
- **Multi-agent by default** — stock deep-dives invoke 3+ agents, not just one
- **Semantic memory** — Qdrant stores embeddings of every analysis for cross-session learning
- **Self-improving loop** — every completed analysis is distilled and stored back to Qdrant
- **Graceful degradation** — Qdrant offline? Falls back to keyword JSON. Still fully functional.
- **Live data only** — all financial data fetched in real-time from Yahoo Finance

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Agent Framework | [deepagents](https://npmjs.com/package/deepagents) + [LangChain](https://langchain.com) |
| LLM | OpenAI GPT-4o |
| Embeddings | OpenAI `text-embedding-3-small` |
| Vector DB | [Qdrant](https://qdrant.tech) |
| Market Data | [yahoo-finance2](https://npmjs.com/package/yahoo-finance2) |
| CLI | Commander.js + Chalk |
