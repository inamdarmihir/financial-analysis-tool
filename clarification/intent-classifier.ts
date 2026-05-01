/**
 * Intent Classifier & Follow-Up Question Engine
 */

import type { QueryType } from "../memory/research-memory.ts";

export interface ClassifiedIntent {
  queryType: QueryType;
  confidence: "high" | "medium" | "low";
  detectedTickers: string[];
  detectedSectors: string[];
  needsClarification: boolean;
  missingContext: string[];
}

const KNOWN_TICKERS = new Set([
  "AAPL","MSFT","GOOGL","GOOG","AMZN","META","TSLA","NVDA","AMD","INTC",
  "NFLX","PYPL","ADBE","CRM","ORCL","IBM","QCOM","TXN","AVGO","MU",
  "JPM","BAC","GS","MS","WFC","C","V","MA","AXP","BRK",
  "JNJ","PFE","MRK","ABBV","LLY","UNH","CVS","BMY","AMGN",
  "XOM","CVX","COP","EOG","SLB","BP","SHEL",
  "WMT","TGT","COST","HD","LOW","NKE","SBUX","MCD",
  "BA","RTX","LMT","NOC","GE","CAT","DE","HON",
  "SPY","QQQ","DIA","IWM","VTI","VOO","GLD","TLT",
]);

export function extractTickers(text: string): string[] {
  const words = text.toUpperCase().split(/[\s,;()\[\]]+/);
  const found: string[] = [];
  for (const word of words) {
    const clean = word.replace(/[^A-Z]/g, "");
    if (clean.length >= 2 && clean.length <= 5 && KNOWN_TICKERS.has(clean)) found.push(clean);
    if (word.startsWith("$") && word.length > 1) found.push(word.slice(1));
  }
  return [...new Set(found)];
}

const SECTOR_KEYWORDS: Record<string, string[]> = {
  technology: ["tech","software","semiconductor","chip","ai","cloud","saas"],
  healthcare: ["healthcare","pharma","biotech","drug","medical"],
  financials: ["bank","finance","insurance","credit","payment"],
  energy: ["energy","oil","gas","petroleum","renewable","solar"],
  "consumer discretionary": ["retail","consumer","ecommerce","luxury","auto"],
  industrials: ["industrial","aerospace","defense","manufacturing"],
  crypto: ["crypto","bitcoin","ethereum","blockchain","defi"],
};

export function extractSectors(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(SECTOR_KEYWORDS)
    .filter(([, kws]) => kws.some((kw) => lower.includes(kw)))
    .map(([s]) => s);
}

const QUERY_PATTERNS: Array<{ type: QueryType; keywords: string[]; weight: number }> = [
  { type: "portfolio_analysis",  keywords: ["portfolio","holdings","positions","rebalance","allocation","i hold","i own","i have","my stocks"], weight: 3 },
  { type: "stock_analysis",      keywords: ["analyze","analysis","report","research","fundamental","valuation","earnings","buy","sell","hold","invest in","deep dive"], weight: 2 },
  { type: "quant_analysis",      keywords: ["technical","rsi","macd","moving average","momentum","volatility","quantitative","chart","pattern","overbought","oversold"], weight: 3 },
  { type: "macro_analysis",      keywords: ["macro","economy","fed","interest rate","inflation","gdp","recession","yield","treasury","monetary","market outlook"], weight: 2 },
  { type: "sentiment_analysis",  keywords: ["sentiment","news","buzz","fear","greed","short interest","insider","options","put call"], weight: 2 },
  { type: "market_research",     keywords: ["sector","industry","market","trend","compare","competition","competitors","landscape","outlook","space","emerging"], weight: 1 },
  { type: "comparison",          keywords: ["vs","versus","compare","better","which","between"], weight: 2 },
];

export function classifyIntent(query: string): ClassifiedIntent {
  const lower = query.toLowerCase();
  const detectedTickers = extractTickers(query);
  const detectedSectors = extractSectors(query);

  const scores = new Map<QueryType, number>();
  for (const p of QUERY_PATTERNS) {
    let score = 0;
    for (const kw of p.keywords) if (lower.includes(kw)) score += p.weight;
    if (score > 0) scores.set(p.type, (scores.get(p.type) ?? 0) + score);
  }
  if (detectedTickers.length > 0) scores.set("stock_analysis", (scores.get("stock_analysis") ?? 0) + detectedTickers.length * 2);
  if (detectedTickers.length > 2) scores.set("comparison", (scores.get("comparison") ?? 0) + 2);
  if (detectedSectors.length > 0) scores.set("market_research", (scores.get("market_research") ?? 0) + detectedSectors.length);

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const queryType: QueryType = sorted[0]?.[0] ?? "general";
  const topScore = sorted[0]?.[1] ?? 0;
  const confidence: "high" | "medium" | "low" = topScore >= 4 ? "high" : topScore >= 2 ? "medium" : "low";
  const missingContext = getMissingContext(queryType, detectedTickers, detectedSectors, lower);

  return { queryType, confidence, detectedTickers, detectedSectors, needsClarification: confidence === "low" || missingContext.length > 0, missingContext };
}

function getMissingContext(type: QueryType, tickers: string[], sectors: string[], lower: string): string[] {
  const missing: string[] = [];
  const hasHorizon = /short.?term|medium.?term|long.?term|day trad|year|month|\d+y|\d+m/.test(lower);
  const hasRisk = /risk|conservative|aggressive|moderate/.test(lower);
  const hasGoal = /goal|retire|income|growth|dividend|wealth|target/.test(lower);

  if (type === "stock_analysis") {
    if (tickers.length === 0) missing.push("ticker");
    if (!hasHorizon) missing.push("time_horizon");
    if (!hasRisk) missing.push("risk_tolerance");
  } else if (type === "portfolio_analysis") {
    if (tickers.length === 0 && !lower.includes("share") && !lower.includes("%")) missing.push("portfolio_holdings");
    if (!hasRisk) missing.push("risk_tolerance");
    if (!hasGoal) missing.push("investment_goal");
  } else if (type === "market_research") {
    if (sectors.length === 0 && tickers.length === 0) missing.push("sector_or_topic");
  } else if (type === "comparison") {
    if (tickers.length < 2 && sectors.length < 2) missing.push("comparison_subjects");
  } else if (type === "quant_analysis") {
    if (tickers.length === 0) missing.push("ticker");
  }
  return missing;
}

export function generateClarificationQuestions(
  intent: ClassifiedIntent,
  profile: { riskTolerance: string; investmentHorizon: string }
): string[] {
  const q: string[] = [];
  const { queryType, missingContext, detectedTickers, detectedSectors } = intent;
  const knowsRisk = profile.riskTolerance !== "unknown";
  const knowsHorizon = profile.investmentHorizon !== "unknown";

  if (missingContext.includes("ticker"))
    q.push("🔍 Which company or ticker symbol should I analyze? (e.g., AAPL, NVDA, TSLA)");
  if (missingContext.includes("sector_or_topic"))
    q.push("📊 Which sector or theme are you interested in? (e.g., AI/semiconductors, clean energy, financials)");
  if (missingContext.includes("portfolio_holdings"))
    q.push('💼 Please share your holdings — e.g., "AAPL 10 shares at $150, MSFT 5 at $300"');
  if (missingContext.includes("comparison_subjects"))
    q.push("⚖️ Which stocks/sectors to compare? (e.g., \"AAPL vs MSFT\" or \"EV vs traditional auto\")");
  if (!knowsRisk && missingContext.includes("risk_tolerance"))
    q.push("⚖️ What is your risk tolerance? (conservative / moderate / aggressive)");
  if (!knowsHorizon && missingContext.includes("time_horizon"))
    q.push("📅 Investment time horizon? (short-term <1y / medium 1-3y / long-term 3y+)");
  if (missingContext.includes("investment_goal"))
    q.push("🎯 Investment goal? (capital growth / income/dividends / wealth preservation / retirement)");

  // When missing nothing, ask depth question
  if (q.length === 0 && queryType === "stock_analysis" && detectedTickers.length > 0) {
    q.push(
      `📋 What depth for **${detectedTickers.join("/")}** analysis?\n` +
      `  a) Full fundamental (financials, valuation, analyst views)\n` +
      `  b) Technical/quant (momentum, volatility, signals)\n` +
      `  c) Competitive landscape (peer comparison)\n` +
      `  d) Full comprehensive deep-dive (all of the above)`
    );
  }
  if (q.length === 0 && queryType === "market_research" && detectedSectors.length > 0) {
    q.push(
      `🌐 Depth for **${detectedSectors.join("/")}** research?\n` +
      `  a) High-level overview (trends, key players, outlook)\n` +
      `  b) Deep dive (valuations, risks, catalysts)\n` +
      `  c) Specific investment opportunities (stocks to watch)`
    );
  }

  return q.slice(0, 3);
}

export function suggestAgentSequence(intent: ClassifiedIntent): string[] {
  switch (intent.queryType) {
    case "stock_analysis":    return ["stock_report", "quant", "sentiment"];
    case "market_research":   return ["market_research", "macro", "sentiment"];
    case "portfolio_analysis":return ["portfolio", "market_research", "macro"];
    case "quant_analysis":    return ["quant", "stock_report"];
    case "macro_analysis":    return ["macro", "market_research"];
    case "sentiment_analysis":return ["sentiment", "market_research"];
    case "comparison":        return ["stock_report", "quant", "market_research"];
    default:                  return ["market_research", "stock_report"];
  }
}
