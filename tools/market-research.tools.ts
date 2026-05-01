import yahooFinance from 'yahoo-finance2';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Sector ETF map for sector-level analysis
const SECTOR_ETF_MAP: Record<string, string> = {
  technology: 'XLK',
  healthcare: 'XLV',
  financials: 'XLF',
  'consumer discretionary': 'XLY',
  'consumer staples': 'XLP',
  energy: 'XLE',
  utilities: 'XLU',
  materials: 'XLB',
  industrials: 'XLI',
  'real estate': 'XLRE',
  'communication services': 'XLC',
};

/**
 * Get an overview of a market sector using its representative ETF
 */
export const getSectorOverview = tool(
  async ({ sector }: { sector: string }) => {
    try {
      const etfTicker = SECTOR_ETF_MAP[sector.toLowerCase()] ?? 'SPY';
      const quote = await yahooFinance.quote(etfTicker) as any;
      const summary = await yahooFinance.quoteSummary(etfTicker, {
        modules: ['summaryDetail', 'defaultKeyStatistics'],
      }) as any;

      return JSON.stringify({
        sector,
        representativeETF: etfTicker,
        etfPrice: quote.regularMarketPrice,
        dayChange: quote.regularMarketChangePercent?.toFixed(2) + '%',
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        averageVolume: quote.averageVolume,
        ytdReturn: summary.summaryDetail?.ytdReturn ?? 'N/A',
        beta: summary.defaultKeyStatistics?.beta?.raw ?? 'N/A',
        note: `Sector data proxied via ${etfTicker} ETF performance`,
      });
    } catch (e) {
      return `Failed to fetch sector overview for "${sector}": ${e}`;
    }
  },
  {
    name: 'get_sector_overview',
    description:
      'Get a broad overview of a market sector (e.g. technology, healthcare) including ETF performance, 52-week range, and beta.',
    schema: z.object({
      sector: z
        .string()
        .describe(
          'The sector name (e.g. "technology", "healthcare", "financials")'
        ),
    }),
  }
);

/**
 * Search for recent news about a ticker or topic
 */
export const searchMarketNews = tool(
  async ({ query, count }: { query: string; count: number }) => {
    try {
      const results = await yahooFinance.search(query, {
        newsCount: count,
      }) as any;

      if (!results.news || results.news.length === 0) {
        return `No news found for query: "${query}"`;
      }

      const news = results.news.map((n: any, i: number) => ({
        index: i + 1,
        title: n.title,
        publisher: n.publisher,
        publishedAt: n.providerPublishTime
          ? new Date(n.providerPublishTime * 1000).toISOString()
          : 'Unknown',
        link: n.link,
        thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
      }));

      return JSON.stringify({ query, articles: news });
    } catch (e) {
      return `Failed to search news for "${query}": ${e}`;
    }
  },
  {
    name: 'search_market_news',
    description:
      'Search for recent news articles related to a stock ticker, company name, or financial topic.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'The search query — can be a ticker (e.g. "AAPL"), company name, or topic (e.g. "AI chip demand")'
        ),
      count: z
        .number()
        .min(1)
        .max(10)
        .default(5)
        .describe('Number of news articles to retrieve (1-10, default 5)'),
    }),
  }
);

/**
 * Get peer/competitor stocks for a given ticker
 */
export const getCompetitors = tool(
  async ({ ticker }: { ticker: string }) => {
    try {
      const result = await yahooFinance.recommendationsBySymbol(ticker) as any;
      const peers = result?.recommendedSymbols?.slice(0, 5) ?? [];

      if (peers.length === 0) {
        return `No competitor data found for ${ticker}`;
      }

      // Fetch quick quotes for each peer
      const peerData = await Promise.all(
        peers.map(async (p: any) => {
          try {
            const q = await yahooFinance.quote(p.symbol) as any;
            return {
              ticker: p.symbol,
              name: q.longName || q.shortName,
              price: q.regularMarketPrice,
              marketCap: q.marketCap,
              dayChangePercent:
                q.regularMarketChangePercent?.toFixed(2) + '%',
              score: p.score,
            };
          } catch {
            return { ticker: p.symbol, error: 'Failed to fetch quote' };
          }
        })
      );

      return JSON.stringify({ targetTicker: ticker, competitors: peerData });
    } catch (e) {
      return `Failed to fetch competitors for ${ticker}: ${e}`;
    }
  },
  {
    name: 'get_competitors',
    description:
      'Get a list of competitor / peer companies for a given stock ticker, with their current market data.',
    schema: z.object({
      ticker: z
        .string()
        .describe('The stock ticker symbol to find competitors for (e.g. AAPL)'),
    }),
  }
);

/**
 * Get trending stocks on Yahoo Finance
 */
export const getTrendingStocks = tool(
  async ({ region }: { region: string }) => {
    try {
      const result = await yahooFinance.trendingSymbols(region, {
        count: 10,
      }) as any;

      const quotes = result?.quotes ?? [];

      const trendingData = await Promise.all(
        quotes.slice(0, 10).map(async (q: any) => {
          try {
            const quote = await yahooFinance.quote(q.symbol) as any;
            return {
              ticker: q.symbol,
              name: quote.longName || quote.shortName,
              price: quote.regularMarketPrice,
              dayChangePercent:
                quote.regularMarketChangePercent?.toFixed(2) + '%',
              volume: quote.regularMarketVolume,
            };
          } catch {
            return { ticker: q.symbol, error: 'Failed to fetch quote' };
          }
        })
      );

      return JSON.stringify({ region, trending: trendingData });
    } catch (e) {
      return `Failed to fetch trending stocks for region "${region}": ${e}`;
    }
  },
  {
    name: 'get_trending_stocks',
    description:
      'Get the current trending/most-active stocks in a given region.',
    schema: z.object({
      region: z
        .string()
        .default('US')
        .describe(
          'Market region code (e.g. "US", "GB", "IN", "JP"). Defaults to "US".'
        ),
    }),
  }
);

export const marketResearchTools = [
  getSectorOverview,
  searchMarketNews,
  getCompetitors,
  getTrendingStocks,
];
