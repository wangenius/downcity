import { promises as fs } from "fs";
import { dirname } from "path";

export interface PersistorOptions {
  filePath: string;
}

export class Persistor {
  private options: PersistorOptions;
  private saveInProgress = false;
  private pendingSave = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(options: PersistorOptions) {
    this.options = options;
  }

  public async save(data: any): Promise<void> {
    if (this.saveInProgress) {
      this.pendingSave = true;
      return;
    }

    this.saveInProgress = true;

    try {
      const dir = dirname(this.options.filePath);
      const tempPath = `${this.options.filePath}.tmp`;

      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
      }

      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
      await fs.rename(tempPath, this.options.filePath);
    } catch (error) {
      console.error("Failed to save data:", error);
      throw error;
    } finally {
      this.saveInProgress = false;
      if (this.pendingSave) {
        this.pendingSave = false;
        // To prevent rapid, repeated save calls, debounce the next save
        if (this.saveTimer) {
          clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
          this.save(data).catch(console.error);
        }, 100);
      }
    }
  }

  public async load(): Promise<any> {
    try {
      const data = await fs.readFile(this.options.filePath, "utf-8");

      if (!data.trim()) {
        console.warn("File is empty, skipping load.");
        return null;
      }

      const parsed = JSON.parse(data);

      if (!parsed || typeof parsed !== "object") {
        console.warn("Invalid file format, skipping load.");
        return null;
      }
      return parsed;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.log("File does not exist, will be created on next save.");
        return null;
      } else {
        console.error("Failed to load data:", error);
        throw error;
      }
    }
  }
}