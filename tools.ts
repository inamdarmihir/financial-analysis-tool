import yahooFinance from 'yahoo-finance2';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const getStockPrice = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const quote = await yahooFinance.quote(ticker);
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
      const quote = await yahooFinance.quote(ticker);
      const summary = await yahooFinance.quoteSummary(ticker, { modules: ['assetProfile', 'defaultKeyStatistics'] });

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
      const results = await yahooFinance.search(ticker, { newsCount: 5 });
      const news = results.news.map(n => ({
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

export const tools = [getStockPrice, getCompanyInfo, getRecentNews];
