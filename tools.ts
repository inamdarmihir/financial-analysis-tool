import yahooFinance from 'yahoo-finance2';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const getStockPrice = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const quote = await yahooFinance.quote(ticker) as any;
      return JSON.stringify({
        ticker,
        price: quote.regularMarketPrice,
        currency: quote.currency,
        dayHigh: quote.regularMarketDayHigh,
        dayLow: quote.regularMarketDayLow,
        volume: quote.regularMarketVolume,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
      });
    } catch (e) {
      return `Failed to fetch price for ${ticker}: ${e}`;
    }
  },
  {
    name: 'get_stock_price',
    description: 'Get the current stock price and basic market data for a given ticker symbol.',
    schema: z.object({
      ticker: z.string().describe('The stock ticker symbol (e.g. AAPL, MSFT)'),
    }),
  }
);

export const getCompanyInfo = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const quote = await yahooFinance.quote(ticker) as any;
      const summary = await yahooFinance.quoteSummary(ticker, { modules: ['assetProfile', 'defaultKeyStatistics'] }) as any;

      return JSON.stringify({
        ticker,
        companyName: quote.longName || quote.shortName,
        sector: summary.assetProfile?.sector,
        industry: summary.assetProfile?.industry,
        description: summary.assetProfile?.longBusinessSummary?.substring(0, 500) + '...',
        marketCap: summary.defaultKeyStatistics?.enterpriseValue?.raw || quote.marketCap,
        forwardPE: summary.defaultKeyStatistics?.forwardPE?.raw,
      });
    } catch (e) {
      return `Failed to fetch company info for ${ticker}: ${e}`;
    }
  },
  {
    name: 'get_company_info',
    description: 'Get company overview, sector, industry, and key statistics for a given ticker symbol.',
    schema: z.object({
      ticker: z.string().describe('The stock ticker symbol (e.g. AAPL, MSFT)'),
    }),
  }
);

export const getRecentNews = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const results = await yahooFinance.search(ticker, { newsCount: 5 }) as any;
      const news = results.news.map((n: any) => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
      }));
      return JSON.stringify(news);
    } catch (e) {
      return `Failed to fetch news for ${ticker}: ${e}`;
    }
  },
  {
    name: 'get_recent_news',
    description: 'Get recent news articles for a given ticker symbol.',
    schema: z.object({
      ticker: z.string().describe('The stock ticker symbol (e.g. AAPL, MSFT)'),
    }),
  }
);

export const calculator = tool(
  async ({ expression }: { expression: string }) => {
    try {
      // Very basic and restricted evaluation for calculator
      const result = new Function(`return ${expression}`)();
      return JSON.stringify({ expression, result });
    } catch (e: any) {
      return `Failed to evaluate expression: ${e.message}`;
    }
  },
  {
    name: 'calculator',
    description: 'Evaluate a mathematical expression. Use this for all calculations to ensure accuracy.',
    schema: z.object({
      expression: z.string().describe('A mathematical expression (e.g. "100 * 0.05", "1234.56 / 12")'),
    }),
  }
);

export const tools = [getStockPrice, getCompanyInfo, getRecentNews, calculator];
