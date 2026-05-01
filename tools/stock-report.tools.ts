import yahooFinance from 'yahoo-finance2';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const getStockPrice = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const q = await yahooFinance.quote(ticker) as any;
      return JSON.stringify({
        ticker,
        name: q.longName || q.shortName,
        price: q.regularMarketPrice,
        currency: q.currency,
        exchange: q.fullExchangeName,
        dayHigh: q.regularMarketDayHigh,
        dayLow: q.regularMarketDayLow,
        dayChange: q.regularMarketChange?.toFixed(2),
        dayChangePct: q.regularMarketChangePercent?.toFixed(2) + '%',
        volume: q.regularMarketVolume,
        avgVolume: q.averageVolume,
        weekHigh52: q.fiftyTwoWeekHigh,
        weekLow52: q.fiftyTwoWeekLow,
        ma50: q.fiftyDayAverage,
        ma200: q.twoHundredDayAverage,
        marketCap: q.marketCap,
        trailingPE: q.trailingPE,
        forwardPE: q.forwardPE,
        eps: q.epsTrailingTwelveMonths,
        dividendYield: q.dividendYield ? (q.dividendYield * 100).toFixed(2) + '%' : 'N/A',
      });
    } catch (e) {
      return `Failed to fetch stock price for ${ticker}: ${e}`;
    }
  },
  {
    name: 'get_stock_price',
    description: 'Get the current stock price, key market stats, and valuation ratios.',
    schema: z.object({ ticker: z.string().describe('Stock ticker symbol (e.g. AAPL)') }),
  }
);

export const getCompanyInfo = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const s = await yahooFinance.quoteSummary(ticker, {
        modules: ['assetProfile', 'defaultKeyStatistics', 'summaryDetail'],
      }) as any;
      const p = s.assetProfile ?? {};
      const k = s.defaultKeyStatistics ?? {};
      const d = s.summaryDetail ?? {};
      return JSON.stringify({
        ticker,
        sector: p.sector ?? 'N/A',
        industry: p.industry ?? 'N/A',
        country: p.country ?? 'N/A',
        employees: p.fullTimeEmployees ?? 'N/A',
        description: (p.longBusinessSummary ?? '').substring(0, 600) + '...',
        website: p.website ?? 'N/A',
        marketCap: d.marketCap?.raw ?? 'N/A',
        enterpriseValue: k.enterpriseValue?.raw ?? 'N/A',
        beta: k.beta?.raw ?? 'N/A',
        profitMargins: k.profitMargins?.raw ? (k.profitMargins.raw * 100).toFixed(2) + '%' : 'N/A',
        heldByInsiders: k.heldPercentInsiders?.raw ? (k.heldPercentInsiders.raw * 100).toFixed(2) + '%' : 'N/A',
        heldByInstitutions: k.heldPercentInstitutions?.raw ? (k.heldPercentInstitutions.raw * 100).toFixed(2) + '%' : 'N/A',
      });
    } catch (e) {
      return `Failed to fetch company info for ${ticker}: ${e}`;
    }
  },
  {
    name: 'get_company_info',
    description: 'Get company overview, sector, industry, key statistics, and ownership data.',
    schema: z.object({ ticker: z.string().describe('Stock ticker symbol') }),
  }
);

export const getFinancials = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const s = await yahooFinance.quoteSummary(ticker, {
        modules: ['incomeStatementHistory', 'cashflowStatementHistory', 'balanceSheetHistory', 'financialData'],
      }) as any;
      const fd = s.financialData ?? {};
      const f = (v: any) => v?.raw ?? 'N/A';
      const pct = (v: any) => v?.raw ? (v.raw * 100).toFixed(2) + '%' : 'N/A';
      const income = (s.incomeStatementHistory?.incomeStatementHistory ?? []).slice(0, 2).map((x: any) => ({
        year: x.endDate?.raw ? new Date(x.endDate.raw * 1000).getFullYear() : 'N/A',
        revenue: f(x.totalRevenue), grossProfit: f(x.grossProfit),
        operatingIncome: f(x.operatingIncome), netIncome: f(x.netIncome), eps: f(x.dilutedEPS),
      }));
      return JSON.stringify({
        ticker,
        grossMargins: pct(fd.grossMargins), operatingMargins: pct(fd.operatingMargins),
        ebitdaMargins: pct(fd.ebitdaMargins), returnOnEquity: pct(fd.returnOnEquity),
        returnOnAssets: pct(fd.returnOnAssets), debtToEquity: fd.debtToEquity?.raw ?? 'N/A',
        currentRatio: fd.currentRatio?.raw ?? 'N/A', freeCashflow: fd.freeCashflow?.raw ?? 'N/A',
        earningsGrowth: fd.earningsGrowth?.raw ?? 'N/A', revenueGrowth: fd.revenueGrowth?.raw ?? 'N/A',
        incomeStatements: income,
      });
    } catch (e) {
      return `Failed to fetch financials for ${ticker}: ${e}`;
    }
  },
  {
    name: 'get_financials',
    description: 'Get income statement, cash flow, balance sheet highlights, and profitability ratios.',
    schema: z.object({ ticker: z.string().describe('Stock ticker symbol') }),
  }
);

function getStartDate(period: string): string {
  const now = new Date();
  const months: Record<string, number> = { '1mo': 1, '3mo': 3, '6mo': 6, '1y': 12, '2y': 24, '5y': 60 };
  now.setMonth(now.getMonth() - (months[period] ?? 12));
  return now.toISOString().split('T')[0]!;
}

export const getHistoricalPrices = tool(
  async ({ ticker, period }: { ticker: string; period: string }) => {
    try {
      const isShort = period === '1mo' || period === '3mo';
      const result = await yahooFinance.historical(ticker, {
        period1: getStartDate(period),
        period2: new Date().toISOString().split('T')[0],
        interval: isShort ? '1d' : '1wk',
      }) as any[];
      if (!result?.length) return `No historical data for ${ticker}`;
      const prices = result.map((r: any) => r.close).filter(Boolean);
      const first = prices[0], last = prices[prices.length - 1];
      return JSON.stringify({
        ticker, period,
        startPrice: first, endPrice: last,
        periodHigh: Math.max(...prices), periodLow: Math.min(...prices),
        totalReturnPct: (((last - first) / first) * 100).toFixed(2) + '%',
        recentDataPoints: result.slice(-10).map((r: any) => ({
          date: r.date?.toISOString?.()?.split('T')[0], close: r.close, volume: r.volume,
        })),
      });
    } catch (e) {
      return `Failed to fetch historical prices for ${ticker}: ${e}`;
    }
  },
  {
    name: 'get_historical_prices',
    description: 'Get historical OHLCV price data for a stock with period summary.',
    schema: z.object({
      ticker: z.string().describe('Stock ticker symbol'),
      period: z.enum(['1mo', '3mo', '6mo', '1y', '2y', '5y']).describe('Time period'),
    }),
  }
);

export const getAnalystRatings = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const s = await yahooFinance.quoteSummary(ticker, {
        modules: ['recommendationTrend', 'financialData'],
      }) as any;
      const fd = s.financialData ?? {};
      const trend = s.recommendationTrend?.trend?.[0] ?? {};
      return JSON.stringify({
        ticker,
        consensusRating: fd.recommendationKey ?? 'N/A',
        targetMean: fd.targetMeanPrice?.raw ?? 'N/A',
        targetHigh: fd.targetHighPrice?.raw ?? 'N/A',
        targetLow: fd.targetLowPrice?.raw ?? 'N/A',
        numberOfAnalysts: fd.numberOfAnalystOpinions?.raw ?? 'N/A',
        breakdown: { strongBuy: trend.strongBuy, buy: trend.buy, hold: trend.hold, sell: trend.sell, strongSell: trend.strongSell },
      });
    } catch (e) {
      return `Failed to fetch analyst ratings for ${ticker}: ${e}`;
    }
  },
  {
    name: 'get_analyst_ratings',
    description: 'Get Wall Street analyst consensus rating and price targets.',
    schema: z.object({ ticker: z.string().describe('Stock ticker symbol') }),
  }
);

export const calculator = tool(
  async ({ expression }: { expression: string }) => {
    try {
      const safe = expression.replace(/[^0-9+\-*/().,\s]/g, '');
      const result = new Function(`return ${safe}`)();
      return JSON.stringify({ expression, result: Number(Number(result).toFixed(4)) });
    } catch (e: any) {
      return `Failed to evaluate: ${e.message}`;
    }
  },
  {
    name: 'calculator',
    description: 'Evaluate a mathematical expression. Use for all financial calculations.',
    schema: z.object({ expression: z.string().describe('Math expression (e.g. "100 * 0.05")') }),
  }
);

export const stockReportTools = [getStockPrice, getCompanyInfo, getFinancials, getHistoricalPrices, getAnalystRatings, calculator];
