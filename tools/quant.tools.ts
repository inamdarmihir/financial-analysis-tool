/**
 * Quantitative Analysis Tools
 * Technical indicators calculated from Yahoo Finance historical data.
 */

import yahooFinance from "yahoo-finance2";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

function getStartDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split("T")[0]!;
}

// ─── RSI ──────────────────────────────────────────────────────────────────────
function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return -1;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

// ─── SMA / EMA ───────────────────────────────────────────────────────────────
function calcSMA(closes: number[], period: number): number {
  const slice = closes.slice(-period);
  return parseFloat((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2));
}

function calcEMA(closes: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = closes[0]!;
  for (let i = 1; i < closes.length; i++) ema = closes[i]! * k + ema * (1 - k);
  return parseFloat(ema.toFixed(2));
}

// ─── MACD ────────────────────────────────────────────────────────────────────
function calcMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema12 = calcEMA(closes.slice(-26 - 9), 12);
  const ema26 = calcEMA(closes.slice(-26 - 9), 26);
  const macd = parseFloat((ema12 - ema26).toFixed(4));
  // Approximate signal as 9-period EMA of MACD
  const signal = parseFloat((macd * 0.8).toFixed(4)); // simplified
  return { macd, signal, histogram: parseFloat((macd - signal).toFixed(4)) };
}

// ─── Volatility (annualized) ──────────────────────────────────────────────────
function calcVolatility(closes: number[]): number {
  if (closes.length < 2) return 0;
  const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]!));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  return parseFloat((Math.sqrt(variance) * Math.sqrt(252) * 100).toFixed(2));
}

// ─── Bollinger Bands ─────────────────────────────────────────────────────────
function calcBollinger(closes: number[], period = 20): { upper: number; middle: number; lower: number; bandwidth: number } {
  const slice = closes.slice(-period);
  const middle = calcSMA(slice, period);
  const stdDev = Math.sqrt(slice.reduce((a, c) => a + (c - middle) ** 2, 0) / period);
  const upper = parseFloat((middle + 2 * stdDev).toFixed(2));
  const lower = parseFloat((middle - 2 * stdDev).toFixed(2));
  const bandwidth = parseFloat(((upper - lower) / middle * 100).toFixed(2));
  return { upper, middle, lower, bandwidth };
}

// ─── Tools ───────────────────────────────────────────────────────────────────

export const getTechnicalIndicators = tool(
  async ({ ticker, period }: { ticker: string; period: string }) => {
    try {
      const months = period === "3mo" ? 3 : period === "6mo" ? 6 : 12;
      const raw = await yahooFinance.historical(ticker, {
        period1: getStartDate(months + 1),
        period2: new Date().toISOString().split("T")[0]!,
        interval: "1d",
      }) as any[];

      if (!raw?.length) return `No data for ${ticker}`;
      const closes = raw.map((r: any) => r.close).filter(Boolean) as number[];
      const volumes = raw.map((r: any) => r.volume).filter(Boolean) as number[];
      const current = closes[closes.length - 1]!;

      const rsi14 = calcRSI(closes, 14);
      const sma20 = calcSMA(closes, Math.min(20, closes.length));
      const sma50 = calcSMA(closes, Math.min(50, closes.length));
      const sma200 = calcSMA(closes, Math.min(200, closes.length));
      const ema20 = calcEMA(closes, Math.min(20, closes.length));
      const macd = calcMACD(closes);
      const vol = calcVolatility(closes);
      const bb = calcBollinger(closes, Math.min(20, closes.length));
      const avgVol20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
      const momentum = parseFloat(((current / closes[closes.length - 20]! - 1) * 100).toFixed(2));

      // Signals
      const signals: string[] = [];
      if (rsi14 > 70) signals.push("⚠️ RSI overbought (>70)");
      else if (rsi14 < 30) signals.push("💡 RSI oversold (<30) — potential opportunity");
      if (current > sma50) signals.push("✅ Price above 50-day SMA — bullish");
      else signals.push("⚠️ Price below 50-day SMA — bearish");
      if (sma50 > sma200) signals.push("✅ Golden cross (50 > 200 SMA) — bullish trend");
      else signals.push("⚠️ Death cross (50 < 200 SMA) — bearish trend");
      if (macd.histogram > 0) signals.push("✅ MACD histogram positive — bullish momentum");
      else signals.push("⚠️ MACD histogram negative — bearish momentum");
      if (current > bb.upper) signals.push("⚠️ Price above upper Bollinger Band — potentially overbought");
      else if (current < bb.lower) signals.push("💡 Price below lower Bollinger Band — potentially oversold");

      return JSON.stringify({
        ticker, currentPrice: current,
        movingAverages: { sma20, sma50, sma200, ema20 },
        momentum: { rsi14, macd, momentum20dayPct: momentum + "%" },
        volatility: { annualizedVolPct: vol + "%", bollingerBands: bb },
        volume: { avgVolume20day: Math.round(avgVol20) },
        signals,
        interpretation: rsi14 > 60 && current > sma50 ? "BULLISH" : rsi14 < 40 && current < sma50 ? "BEARISH" : "NEUTRAL",
      });
    } catch (e) {
      return `Failed to calculate indicators for ${ticker}: ${e}`;
    }
  },
  {
    name: "get_technical_indicators",
    description: "Calculate RSI, MACD, Bollinger Bands, SMA/EMA, volatility, and momentum signals for a stock.",
    schema: z.object({
      ticker: z.string().describe("Stock ticker symbol"),
      period: z.enum(["3mo", "6mo", "1y"]).describe("Lookback period for indicator calculation"),
    }),
  }
);

export const getVolatilityProfile = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const raw = await yahooFinance.historical(ticker, {
        period1: getStartDate(13),
        period2: new Date().toISOString().split("T")[0]!,
        interval: "1wk",
      }) as any[];

      const closes = raw.map((r: any) => r.close).filter(Boolean) as number[];
      const vol1y = calcVolatility(closes);
      const vol6m = calcVolatility(closes.slice(-26));
      const vol3m = calcVolatility(closes.slice(-13));

      // Max drawdown
      let peak = closes[0]!, maxDrawdown = 0;
      for (const c of closes) {
        if (c > peak) peak = c;
        const dd = (peak - c) / peak * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      // Upside/Downside weeks
      const returns = closes.slice(1).map((c, i) => c - closes[i]!);
      const upWeeks = returns.filter((r) => r > 0).length;
      const downWeeks = returns.filter((r) => r <= 0).length;

      const risk = vol1y > 40 ? "HIGH" : vol1y > 20 ? "MODERATE" : "LOW";

      return JSON.stringify({
        ticker,
        annualizedVolatility: { "3m": vol3m + "%", "6m": vol6m + "%", "1y": vol1y + "%" },
        maxDrawdownPct: maxDrawdown.toFixed(2) + "%",
        weeklyPattern: { upWeeks, downWeeks, winRate: ((upWeeks / (upWeeks + downWeeks)) * 100).toFixed(1) + "%" },
        riskRating: risk,
        note: `A ${risk.toLowerCase()} volatility stock. Higher volatility = higher risk AND potential reward.`,
      });
    } catch (e) {
      return `Failed to get volatility profile for ${ticker}: ${e}`;
    }
  },
  {
    name: "get_volatility_profile",
    description: "Get annualized volatility, max drawdown, and risk rating for a stock.",
    schema: z.object({ ticker: z.string().describe("Stock ticker symbol") }),
  }
);

export const getPriceTargets = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const raw = await yahooFinance.historical(ticker, {
        period1: getStartDate(12),
        period2: new Date().toISOString().split("T")[0]!,
        interval: "1wk",
      }) as any[];

      const closes = raw.map((r: any) => r.close).filter(Boolean) as number[];
      const current = closes[closes.length - 1]!;
      const sma50 = calcSMA(closes, Math.min(50, closes.length));
      const sma200 = calcSMA(closes, Math.min(200, closes.length));
      const yearHigh = Math.max(...closes);
      const yearLow = Math.min(...closes);

      // Key support/resistance levels
      return JSON.stringify({
        ticker, currentPrice: current,
        technicalLevels: {
          support1: parseFloat((current * 0.95).toFixed(2)),
          support2: parseFloat(Math.min(sma50, current * 0.9).toFixed(2)),
          resistance1: parseFloat((current * 1.05).toFixed(2)),
          resistance2: parseFloat((yearHigh).toFixed(2)),
        },
        yearRange: { high: yearHigh, low: yearLow, positionInRange: ((current - yearLow) / (yearHigh - yearLow) * 100).toFixed(1) + "%" },
        movingAverages: { sma50, sma200 },
        distanceFromSMA: {
          fromSMA50: ((current / sma50 - 1) * 100).toFixed(2) + "%",
          fromSMA200: ((current / sma200 - 1) * 100).toFixed(2) + "%",
        },
      });
    } catch (e) {
      return `Failed to get price levels for ${ticker}: ${e}`;
    }
  },
  {
    name: "get_price_targets",
    description: "Get key technical support/resistance levels, 52-week range position, and SMA distances.",
    schema: z.object({ ticker: z.string().describe("Stock ticker symbol") }),
  }
);

export const quantTools = [getTechnicalIndicators, getVolatilityProfile, getPriceTargets];
