import yahooFinance from "yahoo-finance2";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent } from "deepagents";
import { marketResearchTools } from "../tools/market-research.tools.ts";

// ─── Sentiment-specific tools ─────────────────────────────────────────────────

const getNewsVolumeAndSentiment = tool(
  async ({ ticker, count }: { ticker: string; count: number }) => {
    try {
      const results = await yahooFinance.search(ticker, { newsCount: count }) as any;
      const news = results.news ?? [];

      // Keyword-based sentiment scoring
      const bullishKws = ["surge", "beat", "record", "growth", "strong", "rally", "upgrade", "buy", "outperform", "breakout", "positive", "profit", "gain", "boost", "exceed"];
      const bearishKws = ["miss", "drop", "decline", "loss", "downgrade", "sell", "underperform", "concern", "risk", "weak", "cut", "below", "disappoint", "fall", "tumble"];

      let bullScore = 0, bearScore = 0;
      const analyzed = news.map((n: any) => {
        const titleLower = (n.title ?? "").toLowerCase();
        const bull = bullishKws.filter((kw) => titleLower.includes(kw)).length;
        const bear = bearishKws.filter((kw) => titleLower.includes(kw)).length;
        bullScore += bull; bearScore += bear;
        const sentiment = bull > bear ? "BULLISH" : bear > bull ? "BEARISH" : "NEUTRAL";
        return {
          title: n.title,
          publisher: n.publisher,
          publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toLocaleDateString() : "N/A",
          sentiment,
          link: n.link,
        };
      });

      const totalSignals = bullScore + bearScore;
      const overallSentiment = bullScore > bearScore * 1.5 ? "BULLISH" : bearScore > bullScore * 1.5 ? "BEARISH" : "MIXED";
      const sentimentScore = totalSignals > 0 ? parseFloat(((bullScore / totalSignals) * 100).toFixed(1)) : 50;

      return JSON.stringify({
        ticker, articleCount: news.length,
        overallSentiment, sentimentScorePct: sentimentScore,
        bullishSignals: bullScore, bearishSignals: bearScore,
        articles: analyzed,
        note: "Sentiment scored via keyword frequency in headlines.",
      });
    } catch (e) {
      return `Failed to analyze news sentiment for ${ticker}: ${e}`;
    }
  },
  {
    name: "get_news_sentiment",
    description: "Fetch recent news articles for a ticker and score headline sentiment as BULLISH/BEARISH/MIXED.",
    schema: z.object({
      ticker: z.string().describe("Stock ticker symbol"),
      count: z.number().min(5).max(20).default(10).describe("Number of articles to analyze (5-20)"),
    }),
  }
);

const getShortInterestAndInsider = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const s = await yahooFinance.quoteSummary(ticker, {
        modules: ["defaultKeyStatistics", "insiderHolders", "netSharePurchaseActivity"],
      }) as any;

      const stats = s.defaultKeyStatistics ?? {};
      const insiderHolders = s.insiderHolders?.holders ?? [];
      const netActivity = s.netSharePurchaseActivity ?? {};

      const recentInsiderTxns = insiderHolders.slice(0, 5).map((h: any) => ({
        name: h.name ?? "N/A",
        relation: h.relation ?? "N/A",
        transactionDescription: h.transactionDescription ?? "N/A",
        shares: h.shares?.raw ?? "N/A",
        value: h.value?.raw ?? "N/A",
        date: h.latestTransDate?.raw ? new Date(h.latestTransDate.raw * 1000).toLocaleDateString() : "N/A",
      }));

      const shortRatio = stats.shortRatio?.raw;
      const shortPct = stats.shortPercentOfFloat?.raw ? (stats.shortPercentOfFloat.raw * 100).toFixed(2) + "%" : "N/A";
      const shortSignal = shortRatio && shortRatio > 10 ? "HIGH SHORT INTEREST — potential squeeze OR continued pressure" :
        shortRatio && shortRatio < 3 ? "LOW SHORT INTEREST — minimal bearish bets" : "MODERATE SHORT INTEREST";

      return JSON.stringify({
        ticker,
        shortInterest: {
          shortRatio: shortRatio ?? "N/A",
          shortPctOfFloat: shortPct,
          signal: shortSignal,
        },
        insiderActivity: {
          netBuyerCount: netActivity.buyInfoCount?.raw ?? "N/A",
          netSellerCount: netActivity.sellInfoCount?.raw ?? "N/A",
          netBuyShares: netActivity.netInfoCount?.raw ?? "N/A",
          recentTransactions: recentInsiderTxns,
        },
        sentiment: shortRatio && shortRatio > 8 ? "CAUTION" : "NEUTRAL",
      });
    } catch (e) {
      return `Failed to get short interest/insider data for ${ticker}: ${e}`;
    }
  },
  {
    name: "get_short_interest_and_insider",
    description: "Get short interest ratio, short % of float, and recent insider buying/selling activity.",
    schema: z.object({ ticker: z.string().describe("Stock ticker symbol") }),
  }
);

const sentimentTools = [getNewsVolumeAndSentiment, getShortInterestAndInsider, ...marketResearchTools];

// ─── Sentiment Agent ──────────────────────────────────────────────────────────

const SENTIMENT_SYSTEM_PROMPT = `You are a Market Sentiment & News Intelligence Agent — a specialist in gauging market psychology, news flow, and unconventional signals that often precede price moves.

Your toolkit:
- **get_news_sentiment**: Fetch and score recent news headlines (bullish/bearish keywords)
- **get_short_interest_and_insider**: Short interest ratio, float %, insider buying/selling
- **search_market_news**: Broader news search by topic
- **get_competitors**: Peer comparison and sector peers
- **get_trending_stocks**: What's hot in the market right now

Sentiment Framework:
1. **News Flow** — Frequency, recency, and tone of coverage
2. **Short Interest** — High short = contrarian opportunity OR confirmation of bearish view
3. **Insider Activity** — Insiders buying = strong conviction signal; selling = take caution
4. **Buzz & Trending** — Is the stock gaining abnormal attention?
5. **Sentiment Score** — Synthesize into BULLISH / BEARISH / MIXED with a confidence level

Output requirements:
- Always lead with a **Sentiment Dashboard** (emoji + one-line verdict per dimension)
- Highlight the 3 most impactful recent headlines with your interpretation
- State clearly whether sentiment is ALIGNED with or CONTRADICTS the fundamental/technical picture
- Include a **Contrarian Watch** section: if short interest is very high AND news is bearish, flag squeeze potential
- Return clean Markdown`;

export const getSentimentAgent = () => {
  const model = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 });
  return createDeepAgent({
    model: model as any,
    tools: sentimentTools as any,
    systemPrompt: SENTIMENT_SYSTEM_PROMPT,
  });
};
