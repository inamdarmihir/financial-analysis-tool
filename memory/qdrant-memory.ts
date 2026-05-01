/**
 * Qdrant Vector Memory
 *
 * Replaces keyword-based JSON matching with semantic vector search.
 * Stores research insights as embeddings so "semiconductor demand" can
 * surface past research on "chip supply chain", "NVIDIA AI GPU cycle", etc.
 *
 * Requires: Qdrant running at http://localhost:6333 (Docker or Qdrant Cloud).
 * Falls back to JSON file search if Qdrant is unavailable.
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import { OpenAIEmbeddings } from "@langchain/openai";
import fs from "fs/promises";
import path from "path";
import type { ResearchInsight, QueryType } from "./research-memory.ts";

const COLLECTION = "dexter_research_insights";
const VECTOR_SIZE = 1536; // text-embedding-3-small
const FALLBACK_FILE = path.join(process.cwd(), ".dexter_memory", "insights_fallback.json");

export class QdrantMemory {
  private client: QdrantClient;
  private embeddings: OpenAIEmbeddings;
  private available = false;
  private fallbackInsights: Array<ResearchInsight & { id: string }> = [];

  constructor() {
    const host = process.env.QDRANT_HOST ?? "http://localhost";
    const port = parseInt(process.env.QDRANT_PORT ?? "6333");
    const apiKey = process.env.QDRANT_API_KEY; // Set for Qdrant Cloud

    this.client = new QdrantClient({ host, port, ...(apiKey ? { apiKey } : {}) });
    this.embeddings = new OpenAIEmbeddings({
      modelName: "text-embedding-3-small",
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
  }

  async init(): Promise<boolean> {
    try {
      // Test connectivity
      await this.client.getCollections();

      // Ensure collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some((c: any) => c.name === COLLECTION);

      if (!exists) {
        await this.client.createCollection(COLLECTION, {
          vectors: { size: VECTOR_SIZE, distance: "Cosine" },
        });

        // Create payload indexes for filtering
        await this.client.createPayloadIndex(COLLECTION, {
          field_name: "queryType",
          field_schema: "keyword",
        });
        await this.client.createPayloadIndex(COLLECTION, {
          field_name: "tickers",
          field_schema: "keyword",
        });
        await this.client.createPayloadIndex(COLLECTION, {
          field_name: "sentiment",
          field_schema: "keyword",
        });
      }

      this.available = true;
      return true;
    } catch {
      // Qdrant not available — load JSON fallback
      this.available = false;
      await this._loadFallback();
      return false;
    }
  }

  get isAvailable() { return this.available; }

  // ── Store an insight ────────────────────────────────────────────────────────

  async storeInsight(insight: Omit<ResearchInsight, "id" | "timestamp">): Promise<string> {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const full: ResearchInsight & { id: string } = { ...insight, id, timestamp };

    // Build the text to embed: topic + key findings + tags
    const textToEmbed = [
      `Topic: ${insight.topic}`,
      `Query type: ${insight.queryType}`,
      `Tickers: ${insight.tickers.join(", ")}`,
      `Tags: ${insight.tags.join(", ")}`,
      `Key findings: ${insight.keyFindings.join(". ")}`,
      `Sentiment: ${insight.sentiment}`,
    ].join("\n");

    if (this.available) {
      try {
        const [vector] = await this.embeddings.embedDocuments([textToEmbed]);
        await this.client.upsert(COLLECTION, {
          wait: true,
          points: [{
            id,
            vector: vector!,
            payload: {
              ...full,
              keyFindings: insight.keyFindings,     // stored as array
              tickers: insight.tickers,
              tags: insight.tags,
            },
          }],
        });
        return id;
      } catch {
        // Qdrant upsert failed — fall through to JSON
      }
    }

    // JSON fallback
    this.fallbackInsights = [full, ...this.fallbackInsights].slice(0, 200);
    await this._persistFallback();
    return id;
  }

  // ── Semantic search ─────────────────────────────────────────────────────────

  async searchRelevant(query: string, options: {
    limit?: number;
    filterType?: QueryType;
    filterTickers?: string[];
  } = {}): Promise<ResearchInsight[]> {
    const { limit = 5, filterType, filterTickers } = options;

    if (this.available) {
      try {
        const [queryVector] = await this.embeddings.embedDocuments([query]);

        const filter: any = { must: [] };
        if (filterType) filter.must.push({ key: "queryType", match: { value: filterType } });
        if (filterTickers?.length) filter.must.push({ key: "tickers", match: { any: filterTickers } });

        const searchResult = await this.client.search(COLLECTION, {
          vector: queryVector!,
          limit,
          with_payload: true,
          score_threshold: 0.35,
          ...(filter.must.length > 0 ? { filter } : {}),
        });

        return searchResult.map((r: any) => r.payload as ResearchInsight);
      } catch {
        // Fall through to keyword fallback
      }
    }

    // Keyword fallback
    return this._keywordSearch(query, limit);
  }

  // ── Get all insights (for display) ─────────────────────────────────────────

  async getRecentInsights(limit = 10): Promise<ResearchInsight[]> {
    if (this.available) {
      try {
        const result = await this.client.scroll(COLLECTION, {
          limit,
          with_payload: true,
          with_vector: false,
        });
        return (result.points ?? [])
          .map((p: any) => p.payload as ResearchInsight)
          .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      } catch { /* fall through */ }
    }
    return this.fallbackInsights.slice(0, limit);
  }

  async getInsightCount(): Promise<number> {
    if (this.available) {
      try {
        const info = await this.client.getCollection(COLLECTION);
        return (info as any).points_count ?? 0;
      } catch { /* fall through */ }
    }
    return this.fallbackInsights.length;
  }

  // ── Delete old insights (keep collection healthy) ───────────────────────────

  async pruneOldInsights(keepDays = 30): Promise<void> {
    if (!this.available) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);
    try {
      await this.client.delete(COLLECTION, {
        filter: {
          must: [{
            key: "timestamp",
            range: { lt: cutoff.toISOString() },
          }],
        },
      });
    } catch { /* ignore */ }
  }

  // ── Format results as context string ────────────────────────────────────────

  formatAsContext(insights: ResearchInsight[]): string {
    if (insights.length === 0) return "";
    const lines = insights.map((i) => {
      const date = new Date(i.timestamp).toLocaleDateString();
      const tickers = i.tickers.length ? ` [${i.tickers.join(", ")}]` : "";
      return [
        `**${i.topic}**${tickers} — ${date} (${i.sentiment})`,
        ...i.keyFindings.slice(0, 3).map((f) => `  • ${f}`),
      ].join("\n");
    });
    return `### 🧠 Relevant Past Research (from memory)\n${lines.join("\n\n")}`;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _keywordSearch(query: string, limit: number): ResearchInsight[] {
    const lower = query.toLowerCase();
    return this.fallbackInsights
      .map((i) => {
        let score = 0;
        if (i.topic.toLowerCase().includes(lower) || lower.includes(i.topic.toLowerCase())) score += 3;
        i.tickers.forEach((t) => { if (lower.includes(t.toLowerCase())) score += 2; });
        i.tags.forEach((tag) => { if (lower.includes(tag)) score += 1; });
        i.keyFindings.forEach((f) => { if (f.toLowerCase().split(" ").some((w) => lower.includes(w) && w.length > 4)) score += 0.5; });
        return { insight: i, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.insight);
  }

  private async _loadFallback() {
    try {
      const data = await fs.readFile(FALLBACK_FILE, "utf-8");
      this.fallbackInsights = JSON.parse(data);
    } catch { this.fallbackInsights = []; }
  }

  private async _persistFallback() {
    try {
      await fs.mkdir(path.dirname(FALLBACK_FILE), { recursive: true });
      await fs.writeFile(FALLBACK_FILE, JSON.stringify(this.fallbackInsights, null, 2), "utf-8");
    } catch { /* ignore */ }
  }
}

// Singleton
export const qdrantMemory = new QdrantMemory();
