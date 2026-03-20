import { LLMManager } from "../ai/llmManager.js";
import { WebCrawler } from "../crawler/index.js";
import { SemanticMemory } from "../memory/semanticMemory.js";
import { Logger } from "../utils/logger.js";

export interface ResearchReport {
  topic: string;
  summary: string;
  sections: ResearchSection[];
  sources: string[];
  generatedAt: string;
}

export interface ResearchSection {
  title: string;
  content: string;
  sources: string[];
}

export interface ResearchOptions {
  depth?: "shallow" | "medium" | "deep";
  maxSources?: number;
  includeImages?: boolean;
  format?: "markdown" | "html" | "text";
}

export class ResearchReportGenerator {
  private llmManager: LLMManager;
  private crawler: WebCrawler;
  private memory: SemanticMemory;
  private logger: Logger;

  constructor(
    llmManager: LLMManager,
    crawler: WebCrawler,
    memory: SemanticMemory
  ) {
    this.llmManager = llmManager;
    this.crawler = crawler;
    this.memory = memory;
    this.logger = new Logger("ResearchReportGenerator");
  }

  async generateReport(topic: string, options: ResearchOptions = {}): Promise<ResearchReport> {
    const {
      depth = "medium",
      maxSources = 5,
      format = "markdown"
    } = options;

    this.logger.info(`Generating research report: ${topic}`);

    // Step 1: Search for information
    const searchResults = await this.searchForTopic(topic, maxSources);

    // Step 2: Crawl relevant pages
    const crawledContent = await this.crawlRelevantPages(searchResults, depth);

    // Step 3: Generate report using AI
    const report = await this.generateReportWithAI(topic, crawledContent, format);

    // Step 4: Store in memory
    await this.storeReportInMemory(report);

    this.logger.info(`Research report generated: ${topic}`);
    return report;
  }

  private async searchForTopic(topic: string, maxSources: number): Promise<string[]> {
    this.logger.info(`Searching for topic: ${topic}`);

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(topic)}`;
    await this.crawler.crawlSingle(searchUrl);

    const links = await this.crawler.getVisitedUrls();
    return links.slice(0, maxSources);
  }

  private async crawlRelevantPages(urls: string[], depth: string): Promise<string[]> {
    this.logger.info(`Crawling ${urls.length} pages`);

    const contents: string[] = [];
    const maxDepth = depth === "shallow" ? 1 : depth === "medium" ? 2 : 3;

    for (const url of urls) {
      try {
        const results = await this.crawler.crawl(url, {
          maxDepth,
          maxPages: 3,
          followLinks: depth !== "shallow"
        });

        for (const result of results) {
          contents.push(result.content);
        }
      } catch (error) {
        this.logger.error(`Failed to crawl ${url}`, error);
      }
    }

    return contents;
  }

  private async generateReportWithAI(
    topic: string,
    contents: string[],
    format: string
  ): Promise<ResearchReport> {
    this.logger.info("Generating report with AI");

    const combinedContent = contents.join("\n\n---\n\n");

    const prompt = `Generate a comprehensive research report on: ${topic}

Based on the following sources:

${combinedContent}

Please create a well-structured report with:
1. An executive summary
2. Multiple sections covering different aspects
3. Key findings and insights
4. Sources and references

Format: ${format}`;

    const response = await this.llmManager.generate(prompt, {
      maxTokens: 4000,
      temperature: 0.7
    });

    // Parse the AI response into structured report
    const report = this.parseReportResponse(topic, response.content, contents);

    return report;
  }

  private parseReportResponse(topic: string, content: string, sources: string[]): ResearchReport {
    // Simple parsing - in production, you'd want more sophisticated parsing
    const sections: ResearchSection[] = [];

    // Split by headers (## or ###)
    const lines = content.split("\n");
    let currentSection: ResearchSection | null = null;

    for (const line of lines) {
      if (line.startsWith("## ") || line.startsWith("### ")) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          title: line.replace(/^#+\s*/, ""),
          content: "",
          sources: []
        };
      } else if (currentSection) {
        currentSection.content += line + "\n";
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    // Extract summary from first section or create one
    const summary = sections.length > 0
      ? sections[0].content.substring(0, 500) + "..."
      : `Research report on ${topic}`;

    return {
      topic,
      summary,
      sections,
      sources,
      generatedAt: new Date().toISOString()
    };
  }

  private async storeReportInMemory(report: ResearchReport): Promise<void> {
    this.logger.info("Storing report in memory");

    const content = `Research Report: ${report.topic}\n\nSummary: ${report.summary}\n\nSections: ${report.sections.length}\nSources: ${report.sources.length}`;

    await this.memory.store(content, "research_report", {
      tags: ["research", "report", report.topic.toLowerCase()],
      metadata: {
        topic: report.topic,
        sectionsCount: report.sections.length,
        sourcesCount: report.sources.length,
        generatedAt: report.generatedAt
      }
    });
  }

  async generateSummary(topic: string, content: string): Promise<string> {
    this.logger.info(`Generating summary for: ${topic}`);

    const prompt = `Provide a concise summary of the following content about ${topic}:

${content}

Summary:`;

    const response = await this.llmManager.generate(prompt, {
      maxTokens: 500,
      temperature: 0.5
    });

    return response.content;
  }

  async extractKeyPoints(content: string): Promise<string[]> {
    this.logger.info("Extracting key points");

    const prompt = `Extract the key points from the following content:

${content}

Key points (one per line):`;

    const response = await this.llmManager.generate(prompt, {
      maxTokens: 1000,
      temperature: 0.3
    });

    return response.content.split("\n").filter(line => line.trim().length > 0);
  }
}
