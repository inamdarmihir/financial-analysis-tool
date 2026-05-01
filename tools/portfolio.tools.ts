import yahooFinance from 'yahoo-finance2';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getStockPrice, getCompanyInfo, calculator } from './stock-report.tools';

/**
 * Get portfolio snapshot — fetch current prices for multiple tickers at once
 */
export const getPortfolioSnapshot = tool(
  async ({ holdings }: { holdings: Array<{ ticker: string; shares: number; avgCost: number }> }) => {
    const results = await Promise.all(
      holdings.map(async (h) => {
        try {
          const q = await yahooFinance.quote(h.ticker) as any;
          const currentPrice = q.regularMarketPrice ?? 0;
          const currentValue = currentPrice * h.shares;
          const costBasis = h.avgCost * h.shares;
          const gainLoss = currentValue - costBasis;
          const gainLossPct = costBasis > 0 ? ((gainLoss / costBasis) * 100).toFixed(2) + '%' : 'N/A';
          return {
            ticker: h.ticker,
            name: q.longName || q.shortName || h.ticker,
            shares: h.shares,
            avgCost: h.avgCost,
            currentPrice,
            currentValue: currentValue.toFixed(2),
            costBasis: costBasis.toFixed(2),
            gainLoss: gainLoss.toFixed(2),
            gainLossPct,
            dayChangePct: q.regularMarketChangePercent?.toFixed(2) + '%',
          };
        } catch {
          return { ticker: h.ticker, error: 'Failed to fetch data' };
        }
      })
    );
    const totalValue = results.reduce((sum, r) => sum + (parseFloat((r as any).currentValue ?? '0')), 0);
    const totalCost = results.reduce((sum, r) => sum + (parseFloat((r as any).costBasis ?? '0')), 0);
    const totalGainLoss = totalValue - totalCost;
    return JSON.stringify({
      holdings: results,
      summary: {
        totalValue: totalValue.toFixed(2),
        totalCostBasis: totalCost.toFixed(2),
        totalGainLoss: totalGainLoss.toFixed(2),
        totalGainLossPct: totalCost > 0 ? ((totalGainLoss / totalCost) * 100).toFixed(2) + '%' : 'N/A',
      },
    });
  },
  {
    name: 'get_portfolio_snapshot',
    description: 'Get a real-time snapshot of a portfolio including current values, P&L, and performance for each holding.',
    schema: z.object({
      holdings: z.array(z.object({
        ticker: z.string().describe('Stock ticker symbol'),
        shares: z.number().describe('Number of shares held'),
        avgCost: z.number().describe('Average cost basis per share'),
      })).describe('List of portfolio holdings'),
    }),
  }
);

export const portfolioTools = [getPortfolioSnapshot, getStockPrice, getCompanyInfo, calculator];
