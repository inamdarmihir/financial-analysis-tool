/**
 * Research Memory — Self-Improving Loop
 *
 * Persists: research insights, user profile, and analysis patterns.
 * Used by the orchestrator to enrich new queries with relevant past context.
 */

import fs from "fs/promises";
import path from "path";

const MEMORY_DIR = path.join(process.cwd(), ".dexter_memory");
const INSIGHTS_FILE = path.join(MEMORY_DIR, "insights.json");
const USER_PROFILE_FILE = path.join(MEMORY_DIR, "user_profile.json");
const PATTERNS_FILE = path.join(MEMORY_DIR, "patterns.json");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResearchInsight {
  id: string;
  timestamp: string;
  topic: string;            // e.g., "AAPL", "semiconductor sector", "portfolio"
  queryType: QueryType;
  keyFindings: string[];    // Bullet points extracted by LLM
  tickers: string[];        // Tickers mentioned
  tags: string[];           // e.g. ["bullish", "high-growth", "tech"]
  sentiment: "bullish" | "bearish" | "neutral" | "mixed";
  agentsUsed: string[];
}

export interface UserProfile {
  riskTolerance: "conservative" | "moderate" | "aggressive" | "unknown";
  investmentHorizon: "short" | "medium" | "long" | "unknown";
  preferredSectors: string[];
  investmentStyle: "growth" | "value" | "income" | "blend" | "unknown";
  mentionedTickers: string[];
  preferenceNotes: string[];    // Free-form observations about the user
  sessionCount: number;
  lastUpdated: string;
}

export interface AnalysisPattern {
  id: string;
  queryPattern: string;       // Regex-like description of the query
  effectiveClarifications: string[];  // Questions that worked well
  agentSequence: string[];    // Which agents to call in order
  usageCount: number;
  avgSatisfactionScore: number; // 1-5, updated over time
}

export type QueryType =
  | "stock_analysis"
  | "market_research"
  | "portfolio_analysis"
  | "macro_analysis"
  | "quant_analysis"
  | "sentiment_analysis"
  | "comparison"
  | "general";

// ─── Memory Manager ───────────────────────────────────────────────────────────

export class ResearchMemory {
  private insights: ResearchInsight[] = [];
  private userProfile: UserProfile = defaultUserProfile();
  private patterns: AnalysisPattern[] = [];
  private initialized = false;

  async init() {
    if (this.initialized) return;
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    await Promise.all([
      this._loadInsights(),
      this._loadUserProfile(),
      this._loadPatterns(),
    ]);
    this.initialized = true;
  }

  // ── Insights ────────────────────────────────────────────────────────────────

  async saveInsight(insight: Omit<ResearchInsight, "id" | "timestamp">) {
    await this.init();
    const full: ResearchInsight = {
      ...insight,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    // Keep last 100 insights
    this.insights = [full, ...this.insights].slice(0, 100);
    await this._persistInsights();
    return full.id;
  }

  /**
   * Retrieve insights relevant to the current query.
   * Matches by topic, tickers, and tags.
   */
  getRelevantInsights(topic: string, tickers: string[], limit = 5): ResearchInsight[] {
    const topicLower = topic.toLowerCase();
    const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));

    return this.insights
      .map((i) => {
        let score = 0;
        if (i.topic.toLowerCase().includes(topicLower) || topicLower.includes(i.topic.toLowerCase())) score += 3;
        i.tickers.forEach((t) => { if (tickerSet.has(t.toUpperCase())) score += 2; });
        i.tags.forEach((tag) => { if (topicLower.includes(tag)) score += 1; });
        return { insight: i, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.insight);
  }

  formatInsightsAsContext(insights: ResearchInsight[]): string {
    if (insights.length === 0) return "";
    const lines = insights.map((i) => {
      const date = new Date(i.timestamp).toLocaleDateString();
      return [
        `• **${i.topic}** (${date}, ${i.sentiment}):`,
        ...i.keyFindings.map((f) => `  - ${f}`),
      ].join("\n");
    });
    return `### Relevant Past Research\n${lines.join("\n\n")}`;
  }

  // ── User Profile ────────────────────────────────────────────────────────────

  async updateUserProfile(updates: Partial<UserProfile>) {
    await this.init();
    this.userProfile = {
      ...this.userProfile,
      ...updates,
      mentionedTickers: [
        ...new Set([...(this.userProfile.mentionedTickers ?? []), ...(updates.mentionedTickers ?? [])]),
      ].slice(0, 50),
      preferredSectors: [
        ...new Set([...(this.userProfile.preferredSectors ?? []), ...(updates.preferredSectors ?? [])]),
      ].slice(0, 20),
      preferenceNotes: [
        ...(this.userProfile.preferenceNotes ?? []),
        ...(updates.preferenceNotes ?? []),
      ].slice(-20),
      lastUpdated: new Date().toISOString(),
      sessionCount: (this.userProfile.sessionCount ?? 0) + (updates.sessionCount ?? 0),
    };
    await this._persistUserProfile();
  }

  getUserProfile(): UserProfile {
    return this.userProfile;
  }

  formatProfileAsContext(): string {
    const p = this.userProfile;
    if (p.riskTolerance === "unknown" && p.investmentHorizon === "unknown") return "";
    const lines: string[] = ["### User Profile (from memory)"];
    if (p.riskTolerance !== "unknown") lines.push(`- **Risk Tolerance:** ${p.riskTolerance}`);
    if (p.investmentHorizon !== "unknown") lines.push(`- **Investment Horizon:** ${p.investmentHorizon}`);
    if (p.investmentStyle !== "unknown") lines.push(`- **Style:** ${p.investmentStyle}`);
    if (p.preferredSectors.length > 0) lines.push(`- **Preferred Sectors:** ${p.preferredSectors.join(", ")}`);
    if (p.mentionedTickers.length > 0)
      lines.push(`- **Previously Discussed Tickers:** ${p.mentionedTickers.slice(0, 10).join(", ")}`);
    if (p.preferenceNotes.length > 0)
      lines.push(`- **Notes:** ${p.preferenceNotes.slice(-3).join(" | ")}`);
    return lines.join("\n");
  }

  // ── Patterns ─────────────────────────────────────────────────────────────────

  async recordSuccessfulPattern(pattern: Omit<AnalysisPattern, "id" | "usageCount" | "avgSatisfactionScore">) {
    await this.init();
    const existing = this.patterns.find((p) => p.queryPattern === pattern.queryPattern);
    if (existing) {
      existing.usageCount += 1;
      existing.effectiveClarifications = [
        ...new Set([...existing.effectiveClarifications, ...pattern.effectiveClarifications]),
      ];
    } else {
      this.patterns.push({ ...pattern, id: crypto.randomUUID(), usageCount: 1, avgSatisfactionScore: 4 });
    }
    await this._persistPatterns();
  }

  getBestClarificationsFor(queryType: QueryType): string[] {
    const relevant = this.patterns
      .filter((p) => p.queryPattern.includes(queryType))
      .sort((a, b) => b.usageCount * b.avgSatisfactionScore - a.usageCount * a.avgSatisfactionScore);
    return relevant.flatMap((p) => p.effectiveClarifications).slice(0, 5);
  }

  getStats() {
    return {
      totalInsights: this.insights.length,
      sessionCount: this.userProfile.sessionCount,
      trackedPatterns: this.patterns.length,
      topTickers: this.userProfile.mentionedTickers.slice(0, 5),
    };
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  private async _loadInsights() {
    try { this.insights = JSON.parse(await fs.readFile(INSIGHTS_FILE, "utf-8")); } catch { this.insights = []; }
  }
  private async _loadUserProfile() {
    try { this.userProfile = JSON.parse(await fs.readFile(USER_PROFILE_FILE, "utf-8")); } catch { this.userProfile = defaultUserProfile(); }
  }
  private async _loadPatterns() {
    try { this.patterns = JSON.parse(await fs.readFile(PATTERNS_FILE, "utf-8")); } catch { this.patterns = []; }
  }
  private async _persistInsights() {
    await fs.writeFile(INSIGHTS_FILE, JSON.stringify(this.insights, null, 2), "utf-8");
  }
  private async _persistUserProfile() {
    await fs.writeFile(USER_PROFILE_FILE, JSON.stringify(this.userProfile, null, 2), "utf-8");
  }
  private async _persistPatterns() {
    await fs.writeFile(PATTERNS_FILE, JSON.stringify(this.patterns, null, 2), "utf-8");
  }
}

function defaultUserProfile(): UserProfile {
  return {
    riskTolerance: "unknown",
    investmentHorizon: "unknown",
    preferredSectors: [],
    investmentStyle: "unknown",
    mentionedTickers: [],
    preferenceNotes: [],
    sessionCount: 0,
    lastUpdated: new Date().toISOString(),
  };
}

// Singleton
export const memory = new ResearchMemory();
