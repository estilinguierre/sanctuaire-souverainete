/**
 * SolidWorks COM connection via winax.
 * IMPORTANT: winax only works on Windows with SolidWorks installed.
 * Use MOCK_MODE=true on Linux/CI.
 */
import { config } from "../config";
import { logger } from "../utils/logger";

// winax is an optional dependency — only available on Windows
let winax: typeof import("winax") | null = null;
try {
  winax = require("winax");
} catch {
  logger.warn("winax not available — COM automation disabled");
}

export interface SWDocument {
  GetTitle(): string;
  GetPathName(): string;
  Save(): void;
}

export class SolidWorksConnection {
  private swApp: any = null;
  private connected = false;

  async connect(): Promise<void> {
    if (config.mockMode) {
      logger.info("MOCK_MODE: SolidWorks connection simulated");
      this.connected = true;
      return;
    }

    if (!winax) {
      throw new Error(
        "winax unavailable — run on Windows with SolidWorks installed, or set MOCK_MODE=true"
      );
    }

    let attempts = 0;
    const maxAttempts = 3;
    const delays = [2000, 4000, 8000];

    while (attempts < maxAttempts) {
      try {
        this.swApp = new winax.Object("SldWorks.Application");
        this.swApp.Visible = true;
        this.connected = true;
        const ver = this.swApp.RevisionNumber();
        logger.info(`SolidWorks connected — revision ${ver}`);
        return;
      } catch (err) {
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`Cannot connect to SolidWorks after ${maxAttempts} attempts: ${err}`);
        }
        logger.warn(`SW connect attempt ${attempts} failed, retrying in ${delays[attempts - 1]}ms`);
        await new Promise((r) => setTimeout(r, delays[attempts - 1]));
      }
    }
  }

  async isConnected(): Promise<boolean> {
    if (config.mockMode) return true;
    if (!this.connected || !this.swApp) return false;
    try {
      // Ping SW — if it crashed this throws
      void this.swApp.RevisionNumber();
      return true;
    } catch {
      this.connected = false;
      this.swApp = null;
      return false;
    }
  }

  getApp(): any {
    if (config.mockMode) return null;
    if (!this.connected) throw new Error("Not connected to SolidWorks");
    return this.swApp;
  }

  getActiveDoc(): SWDocument | null {
    if (config.mockMode) return null;
    return this.swApp?.ActiveDoc ?? null;
  }

  async openDocument(filePath: string, docType: number = 1): Promise<SWDocument> {
    if (config.mockMode) {
      return { GetTitle: () => "MOCK", GetPathName: () => filePath, Save: () => {} };
    }
    const errors: number[] = [0];
    const doc = this.swApp.OpenDoc6(filePath, docType, 0, "", errors, []);
    if (!doc) throw new Error(`Cannot open document: ${filePath}`);
    return doc;
  }
}

export const swConnection = new SolidWorksConnection();
