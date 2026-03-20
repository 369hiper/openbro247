import { BrowserEngine } from "../browser/engine.js";
import { Logger } from "../utils/logger.js";

export interface SkillResult {
  success: boolean;
  message: string;
  data?: any;
}

export class PlatformSkills {
  private browserEngine: BrowserEngine;
  private logger: Logger;

  constructor(browserEngine: BrowserEngine) {
    this.browserEngine = browserEngine;
    this.logger = new Logger("PlatformSkills");
  }

  // WhatsApp Web Skills
  async whatsappSendMessage(phoneNumber: string, message: string): Promise<SkillResult> {
    this.logger.info(`Sending WhatsApp message to ${phoneNumber}`);

    try {
      await this.browserEngine.navigate("https://web.whatsapp.com");
      await this.browserEngine.waitForSelector('div[contenteditable="true"]');

      // Search for contact
      const searchBox = await this.browserEngine.extractText('div[contenteditable="true"]');
      if (typeof searchBox === "string") {
        await this.browserEngine.type(phoneNumber, 'div[contenteditable="true"]');
        await this.browserEngine.waitForSelector(`span[title="${phoneNumber}"]`);
        await this.browserEngine.click(`span[title="${phoneNumber}"]`);

        // Type message
        const messageBox = await this.browserEngine.extractText('div[contenteditable="true"]');
        if (typeof messageBox === "string") {
          await this.browserEngine.type(message, 'div[contenteditable="true"]');
          await this.browserEngine.click('button[aria-label="Send"]');
        }
      }

      return {
        success: true,
        message: `Message sent to ${phoneNumber}`
      };
    } catch (error) {
      this.logger.error("Failed to send WhatsApp message", error);
      return {
        success: false,
        message: `Failed to send message: ${error}`
      };
    }
  }

  // Telegram Web Skills
  async telegramSendMessage(username: string, message: string): Promise<SkillResult> {
    this.logger.info(`Sending Telegram message to ${username}`);

    try {
      await this.browserEngine.navigate("https://web.telegram.org");
      await this.browserEngine.waitForSelector('input[type="text"]');

      // Search for user
      await this.browserEngine.type(username, 'input[type="text"]');
      await this.browserEngine.waitForSelector(`div[title="${username}"]`);
      await this.browserEngine.click(`div[title="${username}"]`);

      // Type message
      const messageBox = await this.browserEngine.extractText('div[contenteditable="true"]');
      if (typeof messageBox === "string") {
        await this.browserEngine.type(message, 'div[contenteditable="true"]');
        await this.browserEngine.click('button[aria-label="Send message"]');
      }

      return {
        success: true,
        message: `Message sent to ${username}`
      };
    } catch (error) {
      this.logger.error("Failed to send Telegram message", error);
      return {
        success: false,
        message: `Failed to send message: ${error}`
      };
    }
  }

  // Facebook Skills
  async facebookPostStatus(status: string): Promise<SkillResult> {
    this.logger.info("Posting Facebook status");

    try {
      await this.browserEngine.navigate("https://www.facebook.com");
      await this.browserEngine.waitForSelector('div[contenteditable="true"]');

      // Click on status box
      await this.browserEngine.click('div[role="button"][aria-label="Create a post"]');

      // Type status
      const statusBox = await this.browserEngine.extractText('div[contenteditable="true"]');
      if (typeof statusBox === "string") {
        await this.browserEngine.type(status, 'div[contenteditable="true"]');
        await this.browserEngine.click('div[aria-label="Post"]');
      }

      return {
        success: true,
        message: "Status posted successfully"
      };
    } catch (error) {
      this.logger.error("Failed to post Facebook status", error);
      return {
        success: false,
        message: `Failed to post status: ${error}`
      };
    }
  }

  // E-commerce Skills
  async searchProduct(platform: string, query: string): Promise<SkillResult> {
    this.logger.info(`Searching for product on ${platform}: ${query}`);

    try {
      let url: string;
      switch (platform.toLowerCase()) {
        case "amazon":
          url = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
          break;
        case "ebay":
          url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
          break;
        case "walmart":
          url = `https://www.walmart.com/search?q=${encodeURIComponent(query)}`;
          break;
        default:
          url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      }

      await this.browserEngine.navigate(url);
      await this.browserEngine.waitForSelector("body");

      const results = await this.browserEngine.extractText("body");
      const title = await this.browserEngine.getTitle();

      return {
        success: true,
        message: `Found results for ${query} on ${platform}`,
        data: {
          title,
          content: typeof results === "string" ? results : results.join("\n")
        }
      };
    } catch (error) {
      this.logger.error(`Failed to search product on ${platform}`, error);
      return {
        success: false,
        message: `Failed to search product: ${error}`
      };
    }
  }

  async addToCart(platform: string, productUrl: string): Promise<SkillResult> {
    this.logger.info(`Adding to cart on ${platform}: ${productUrl}`);

    try {
      await this.browserEngine.navigate(productUrl);
      await this.browserEngine.waitForSelector('button[id="add-to-cart-button"]');

      await this.browserEngine.click('button[id="add-to-cart-button"]');

      return {
        success: true,
        message: "Product added to cart"
      };
    } catch (error) {
      this.logger.error(`Failed to add to cart on ${platform}`, error);
      return {
        success: false,
        message: `Failed to add to cart: ${error}`
      };
    }
  }

  // Generic form filling skill
  async fillForm(formData: Record<string, string>): Promise<SkillResult> {
    this.logger.info("Filling form");

    try {
      for (const [selector, value] of Object.entries(formData)) {
        await this.browserEngine.type(value, selector);
      }

      return {
        success: true,
        message: "Form filled successfully"
      };
    } catch (error) {
      this.logger.error("Failed to fill form", error);
      return {
        success: false,
        message: `Failed to fill form: ${error}`
      };
    }
  }

  // Generic button click skill
  async clickButton(selector: string): Promise<SkillResult> {
    this.logger.info(`Clicking button: ${selector}`);

    try {
      await this.browserEngine.click(selector);

      return {
        success: true,
        message: `Button clicked: ${selector}`
      };
    } catch (error) {
      this.logger.error(`Failed to click button: ${selector}`, error);
      return {
        success: false,
        message: `Failed to click button: ${error}`
      };
    }
  }
}
