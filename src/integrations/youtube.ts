import { Innertube } from "youtubei.js";
import { BrowserEngine } from "../browser/engine.js";
import { Logger } from "../utils/logger.js";

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channel: string;
  duration: string;
  views: string;
  url: string;
}

export interface YouTubeTranscript {
  text: string;
  start: number;
  duration: number;
}

export class YouTubeIntegration {
  private innertube: any;
  private browserEngine: BrowserEngine;
  private logger: Logger;
  private useBrowserFallback: boolean = false;

  constructor(browserEngine: BrowserEngine) {
    this.browserEngine = browserEngine;
    this.logger = new Logger("YouTube");
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info("Initializing YouTube integration...");
      this.innertube = await Innertube.create();
      this.logger.info("YouTube integration initialized with youtubei.js");
    } catch (error) {
      this.logger.warn("Failed to initialize youtubei.js, falling back to browser automation", error);
      this.useBrowserFallback = true;
    }
  }

  async search(query: string, limit: number = 10): Promise<YouTubeVideo[]> {
    if (!this.useBrowserFallback && this.innertube) {
      return this.searchWithYoutubei(query, limit);
    } else {
      return this.searchWithBrowser(query, limit);
    }
  }

  private async searchWithYoutubei(query: string, limit: number): Promise<YouTubeVideo[]> {
    try {
      this.logger.info(`Searching YouTube with youtubei.js: ${query}`);
      const search = await this.innertube.search(query, { type: "video" });

      const videos: YouTubeVideo[] = [];
      for (const video of search.videos.slice(0, limit)) {
        videos.push({
          id: video.id,
          title: video.title.text || "",
          description: video.description || "",
          channel: video.author?.name || "",
          duration: video.duration?.text || "",
          views: video.view_count?.text || "",
          url: `https://www.youtube.com/watch?v=${video.id}`
        });
      }

      return videos;
    } catch (error) {
      this.logger.error("youtubei.js search failed, falling back to browser", error);
      return this.searchWithBrowser(query, limit);
    }
  }

  private async searchWithBrowser(query: string, limit: number): Promise<YouTubeVideo[]> {
    this.logger.info(`Searching YouTube with browser: ${query}`);

    await this.browserEngine.navigate(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
    await this.browserEngine.waitForSelector("ytd-video-renderer");

    const videos: YouTubeVideo[] = [];
    const elements = await this.browserEngine.extractText("ytd-video-renderer", true);

    for (let i = 0; i < Math.min(elements.length, limit); i++) {
      const element = elements[i];
      if (typeof element === "string") {
        videos.push({
          id: `browser-${i}`,
          title: element.split("\n")[0] || "",
          description: "",
          channel: "",
          duration: "",
          views: "",
          url: ""
        });
      }
    }

    return videos;
  }

  async getTranscript(videoId: string): Promise<YouTubeTranscript[]> {
    if (!this.useBrowserFallback && this.innertube) {
      return this.getTranscriptWithYoutubei(videoId);
    } else {
      return this.getTranscriptWithBrowser(videoId);
    }
  }

  private async getTranscriptWithYoutubei(videoId: string): Promise<YouTubeTranscript[]> {
    try {
      this.logger.info(`Getting transcript with youtubei.js: ${videoId}`);
      const info = await this.innertube.getInfo(videoId);
      const transcript = await info.getTranscript();

      const segments: YouTubeTranscript[] = [];
      for (const segment of transcript.segments) {
        segments.push({
          text: segment.text,
          start: segment.start_ms / 1000,
          duration: (segment.end_ms - segment.start_ms) / 1000
        });
      }

      return segments;
    } catch (error) {
      this.logger.error("youtubei.js transcript failed, falling back to browser", error);
      return this.getTranscriptWithBrowser(videoId);
    }
  }

  private async getTranscriptWithBrowser(videoId: string): Promise<YouTubeTranscript[]> {
    this.logger.info(`Getting transcript with browser: ${videoId}`);

    await this.browserEngine.navigate(`https://www.youtube.com/watch?v=${videoId}`);

    // Click on "Show transcript" button if available
    try {
      await this.browserEngine.click('button[aria-label="Show transcript"]');
      await this.browserEngine.waitForSelector("ytd-transcript-segment-list-renderer");

      const segments: YouTubeTranscript[] = [];
      const texts = await this.browserEngine.extractText("ytd-transcript-segment-renderer", true);

      for (let i = 0; i < texts.length; i++) {
        if (typeof texts[i] === "string") {
          segments.push({
            text: texts[i] as string,
            start: i * 5,
            duration: 5
          });
        }
      }

      return segments;
    } catch (error) {
      this.logger.warn("Could not get transcript via browser", error);
      return [];
    }
  }

  async getVideoInfo(videoId: string): Promise<YouTubeVideo | null> {
    if (!this.useBrowserFallback && this.innertube) {
      return this.getVideoInfoWithYoutubei(videoId);
    } else {
      return this.getVideoInfoWithBrowser(videoId);
    }
  }

  private async getVideoInfoWithYoutubei(videoId: string): Promise<YouTubeVideo | null> {
    try {
      this.logger.info(`Getting video info with youtubei.js: ${videoId}`);
      const info = await this.innertube.getInfo(videoId);

      return {
        id: videoId,
        title: info.basic_info.title || "",
        description: info.basic_info.short_description || "",
        channel: info.basic_info.author || "",
        duration: info.basic_info.duration?.text || "",
        views: info.basic_info.view_count?.text || "",
        url: `https://www.youtube.com/watch?v=${videoId}`
      };
    } catch (error) {
      this.logger.error("youtubei.js video info failed, falling back to browser", error);
      return this.getVideoInfoWithBrowser(videoId);
    }
  }

  private async getVideoInfoWithBrowser(videoId: string): Promise<YouTubeVideo | null> {
    this.logger.info(`Getting video info with browser: ${videoId}`);

    await this.browserEngine.navigate(`https://www.youtube.com/watch?v=${videoId}`);

    try {
      const title = await this.browserEngine.extractText("h1.ytd-video-primary-info-renderer");
      const description = await this.browserEngine.extractText("#description");

      return {
        id: videoId,
        title: typeof title === "string" ? title : "",
        description: typeof description === "string" ? description : "",
        channel: "",
        duration: "",
        views: "",
        url: `https://www.youtube.com/watch?v=${videoId}`
      };
    } catch (error) {
      this.logger.error("Browser video info failed", error);
      return null;
    }
  }
}
