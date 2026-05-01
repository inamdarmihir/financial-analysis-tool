/**
 * Macroeconomic Tools
 * Uses Yahoo Finance to pull market indices, commodities, yields, and fear indicators.
 */

import yahooFinance from "yahoo-finance2";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const MACRO_TICKERS: Record<string, { symbol: string; label: string }> = {
  // Indices
  sp500:      { symbol: "^GSPC", label: "S&P 500" },
  nasdaq:     { symbol: "^IXIC", label: "Nasdaq Composite" },
  dow:        { symbol: "^DJI",  label: "Dow Jones Industrial" },
  russell2000:{ symbol: "^RUT",  label: "Russell 2000 (Small Cap)" },
  // Volatility
  vix:        { symbol: "^VIX",  label: "VIX (Fear Index)" },
  // Yields
  treasury10y:{ symbol: "^TNX",  label: "10-Year Treasury Yield" },
  treasury2y: { symbol: "^IRX",  label: "13-Week Treasury Yield" },
  // Commodities
  gold:       { symbol: "GC=F",  label: "Gold Futures" },
  oil:        { symbol: "CL=F",  label: "Crude Oil (WTI)" },
  natgas:     { symbol: "NG=F",  label: "Natural Gas" },
  // Dollar
  dxy:        { symbol: "DX-Y.NYB", label: "US Dollar Index (DXY)" },
  // Bonds
  longbonds:  { symbol: "TLT",   label: "Long-Term Treasury ETF (TLT)" },
};

async function fetchQuote(symbol: string): Promise<any> {
  return yahooFinance.quote(symbol) as any;
}

export const getMarketSnapshot = tool(
  async (_: Record<string, never>) => {
    const keys = ["sp500", "nasdaq", "dow", "vix", "treasury10y", "gold", "oil", "dxy"];
    const results: Record<string, any> = {};

    await Promise.all(keys.map(async (key) => {
      const cfg = MACRO_TICKERS[key]!;
      try {
        const q = await fetchQuote(cfg.symbol);
        results[key] = {
          label: cfg.label,
          value: q.regularMarketPrice,
          dayChangePct: q.regularMarketChangePercent?.toFixed(2) + "%",
          yearHigh: q.fiftyTwoWeekHigh,
          yearLow: q.fiftyTwoWeekLow,
        };
      } catch {
        results[key] = { label: cfg.label, error: "unavailable" };
      }
    }));

    const vix = results["vix"]?.value ?? 0;
    const marketMood = vix > 30 ? "FEAR (VIX>30)" : vix > 20 ? "CAUTION (VIX 20-30)" : "GREED (VIX<20)";

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      marketSnapshot: results,
      marketMoodIndicator: marketMood,
      summary: `S&P500: ${results["sp500"]?.value ?? "N/A"} (${results["sp500"]?.dayChangePct ?? "N/A"}), VIX: ${vix} → ${marketMood}`,
    });
  },
  {
    name: "get_market_snapshot",
    description: "Get a real-time macro snapshot: S&P500, Nasdaq, Dow, VIX fear index, 10Y Treasury yield, Gold, Oil, and USD index.",
    schema: z.object({}),
  }
);

export const getYieldCurve = tool(
  async (_: Record<string, never>) => {
    try {
      const [t13w, t10y] = await Promise.all([
        fetchQuote("^IRX"),
        fetchQuote("^TNX"),
      ]);
      const short = t13w.regularMarketPrice ?? 0;
      const long = t10y.regularMarketPrice ?? 0;
      const spread = parseFloat((long - short).toFixed(3));
      const inverted = spread < 0;
      return JSON.stringify({
        thirteenWeekYield: short + "%",
        tenYearYield: long + "%",
        spread2s10s: spread + "% (approx)",
        inverted,
        interpretation: inverted
          ? "⚠️ Yield curve is INVERTED — historically a recession predictor within 12-18 months."
          : "✅ Yield curve is NORMAL — no near-term recession signal from yields alone.",
        note: "Yield data from Yahoo Finance. 13W used as short-term proxy.",
      });
    } catch (e) {
      return `Failed to fetch yield curve: ${e}`;
    }
  },
  {
    name: "get_yield_curve",
    description: "Get the current yield curve (13W vs 10Y Treasury yields) and inversion status.",
    schema: z.object({}),
  }
);

export const getSectorPerformance = tool(
  async (_: Record<string, never>) => {
    const sectorETFs: Record<string, string> = {
      Technology: "XLK", Healthcare: "XLV", Financials: "XLF",
      "Consumer Discretionary": "XLY", "Consumer Staples": "XLP",
      Energy: "XLE", Utilities: "XLU", Materials: "XLB",
      Industrials: "XLI", "Real Estate": "XLRE", "Comm. Services": "XLC",
    };

    const results: Record<string, any> = {};
    await Promise.all(Object.entries(sectorETFs).map(async ([sector, etf]) => {
      try {
        const q = await fetchQuote(etf);
        results[sector] = {
          etf,
          price: q.regularMarketPrice,
          dayChangePct: q.regularMarketChangePercent?.toFixed(2) + "%",
          ytdHigh: q.fiftyTwoWeekHigh,
          ytdLow: q.fiftyTwoWeekLow,
        };
      } catch {
        results[sector] = { etf, error: "unavailable" };
      }
    }));

    // Rank by day change
    const ranked = Object.entries(results)
      .filter(([, v]) => !v.error)
      .sort((a, b) => parseFloat(b[1].dayChangePct) - parseFloat(a[1].dayChangePct));

    return JSON.stringify({
      sectorPerformance: results,
      todaysLeaders: ranked.slice(0, 3).map(([s, v]) => `${s}: ${v.dayChangePct}`),
      todaysLaggards: ranked.slice(-3).map(([s, v]) => `${s}: ${v.dayChangePct}`),
    });
  },
  {
    name: "get_sector_performance",
    description: "Get today's performance of all 11 S&P 500 sectors via sector ETFs. Identifies leaders and laggards.",
    schema: z.object({}),
  }
);

export const getCommoditiesAndCurrencies = tool(
  async (_: Record<string, never>) => {
    const assets = {
      Gold: "GC=F", "Silver": "SI=F", "Oil (WTI)": "CL=F",
      "Natural Gas": "NG=F", "Copper": "HG=F",
      "USD Index": "DX-Y.NYB", "EUR/USD": "EURUSD=X",
      "USD/JPY": "JPY=X", "GBP/USD": "GBPUSD=X",
      Bitcoin: "BTC-USD", Ethereum: "ETH-USD",
    };
    const results: Record<string, any> = {};
    await Promise.all(Object.entries(assets).map(async ([label, sym]) => {
      try {
        const q = await fetchQuote(sym);
        results[label] = { price: q.regularMarketPrice, dayChangePct: q.regularMarketChangePercent?.toFixed(2) + "%" };
      } catch {
        results[label] = { error: "unavailable" };
      }
    }));
    return JSON.stringify({ timestamp: new Date().toISOString(), commoditiesAndCurrencies: results });
  },
  {
    name: "get_commodities_and_currencies",
    description: "Get real-time prices for commodities (gold, silver, oil, copper, gas) and major currency pairs.",
    schema: z.object({}),
  }
);

export const macroTools = [getMarketSnapshot, getYieldCurve, getSectorPerformance, getCommoditiesAndCurrencies];
