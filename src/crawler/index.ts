import { BrowserEngine } from "../browser/engine.js";
import { Logger } from "../utils/logger.js";

export interface CrawlResult {
  url: string;
  title: string;
  content: string;
  links: string[];
  metadata: Record<string, any>;
}

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  followLinks?: boolean;
  sameDomain?: boolean;
  selector?: string;
}

export class WebCrawler {
  private browserEngine: BrowserEngine;
  private logger: Logger;
  private visited: Set<string> = new Set();

  constructor(browserEngine: BrowserEngine) {
    this.browserEngine = browserEngine;
    this.logger = new Logger("WebCrawler");
  }

  async crawl(url: string, options: CrawlOptions = {}): Promise<CrawlResult[]> {
    const {
      maxDepth = 2,
      maxPages = 10,
      followLinks = true,
      sameDomain = true,
      selector = "body"
    } = options;

    this.logger.info(`Starting crawl: ${url}`);
    this.visited.clear();

    const results: CrawlResult[] = [];
    await this.crawlRecursive(url, 0, maxDepth, maxPages, followLinks, sameDomain, selector, results);

    this.logger.info(`Crawl completed: ${results.length} pages`);
    return results;
  }

  private async crawlRecursive(
    url: string,
    depth: number,
    maxDepth: number,
    maxPages: number,
    followLinks: boolean,
    sameDomain: boolean,
    selector: string,
    results: CrawlResult[]
  ): Promise<void> {
    if (depth > maxDepth || results.length >= maxPages || this.visited.has(url)) {
      return;
    }

    this.visited.add(url);
    this.logger.info(`Crawling: ${url} (depth: ${depth})`);

    try {
      await this.browserEngine.navigate(url);

      const title = await this.browserEngine.getTitle();
      const content = await this.browserEngine.extractText(selector);
      const links = await this.extractLinks(url, sameDomain);

      results.push({
        url,
        title,
        content: typeof content === "string" ? content : content.join("\n"),
        links,
        metadata: {
          depth,
          crawledAt: new Date().toISOString()
        }
      });

      if (followLinks && depth < maxDepth) {
        for (const link of links) {
          if (results.length >= maxPages) break;
          await this.crawlRecursive(link, depth + 1, maxDepth, maxPages, followLinks, sameDomain, selector, results);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to crawl ${url}`, error);
    }
  }

  private async extractLinks(baseUrl: string, sameDomain: boolean): Promise<string[]> {
    try {
      const links = await this.browserEngine.extractAttribute("a[href]", "href", true);
      const baseDomain = new URL(baseUrl).hostname;

      const filteredLinks: string[] = [];
      for (const link of links) {
        if (typeof link === "string") {
          try {
            const absoluteUrl = new URL(link, baseUrl).href;
            const linkDomain = new URL(absoluteUrl).hostname;

            if (!sameDomain || linkDomain === baseDomain) {
              if (!this.visited.has(absoluteUrl)) {
                filteredLinks.push(absoluteUrl);
              }
            }
          } catch {
            // Invalid URL, skip
          }
        }
      }

      return filteredLinks;
    } catch (error) {
      this.logger.error("Failed to extract links", error);
      return [];
    }
  }

  async crawlSingle(url: string, selector: string = "body"): Promise<CrawlResult> {
    this.logger.info(`Crawling single page: ${url}`);

    await this.browserEngine.navigate(url);

    const title = await this.browserEngine.getTitle();
    const content = await this.browserEngine.extractText(selector);
    const links = await this.extractLinks(url, false);

    return {
      url,
      title,
      content: typeof content === "string" ? content : content.join("\n"),
      links,
      metadata: {
        crawledAt: new Date().toISOString()
      }
    };
  }

  getVisitedUrls(): string[] {
    return Array.from(this.visited);
  }

  clearVisited(): void {
    this.visited.clear();
  }
}
