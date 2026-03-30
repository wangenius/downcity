/**
 * Memory Indexer（SQLite FTS）。
 *
 * 关键点（中文）
 * - 使用 SQLite + FTS5 做本地检索加速。
 * - Markdown 仍是事实源，索引可重建。
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  MemorySearchResultItem,
  MemorySourceType,
  MemorySourceStat,
} from "@services/memory/types/Memory.js";
import type { MemorySourceFile } from "./Store.js";
import { getDowncityMemoryIndexPath } from "@/main/env/Paths.js";

const INDEX_SCHEMA_VERSION = 1;
const SNIPPET_MAX_CHARS = 700;
const CHUNK_MAX_CHARS = 1600;
const CHUNK_OVERLAP_CHARS = 240;

type IndexedFileRow = {
  path: string;
  hash: string;
};

type MemoryChunk = {
  startLine: number;
  endLine: number;
  text: string;
  hash: string;
};

export type MemoryIndexSyncResult = {
  /**
   * 扫描文件总数。
   */
  totalFiles: number;
  /**
   * 重建文件数。
   */
  reindexedFiles: number;
  /**
   * 删除失效文件数。
   */
  removedFiles: number;
  /**
   * 重建写入 chunk 总数。
   */
  totalChunks: number;
};

export type MemoryIndexStatus = {
  /**
   * 当前文件数。
   */
  files: number;
  /**
   * 当前 chunk 数。
   */
  chunks: number;
  /**
   * 按来源统计。
   */
  sourceCounts: MemorySourceStat[];
};

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeText(input: string): string {
  return String(input || "").replace(/\r\n/g, "\n");
}

function quoteFtsToken(token: string): string {
  return `"${token.replace(/"/g, '""')}"`;
}

/**
 * 构建 FTS 查询表达式。
 */
export function buildFtsQuery(raw: string): string | null {
  const normalized = String(raw || "").trim();
  if (!normalized) return null;
  const tokens = normalized
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (tokens.length === 0) {
    return null;
  }
  return tokens.map((token) => `${quoteFtsToken(token)}*`).join(" ");
}

function bm25RankToScore(rank: number): number {
  if (!Number.isFinite(rank)) {
    return 0;
  }
  return 1 / (1 + Math.abs(rank));
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return value.slice(0, maxChars);
}

function chunkMarkdown(content: string): MemoryChunk[] {
  const lines = normalizeText(content).split("\n");
  if (lines.length === 0) {
    return [];
  }
  const out: MemoryChunk[] = [];
  let bucket: Array<{ line: string; lineNo: number }> = [];
  let chars = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    const startLine = bucket[0]?.lineNo ?? 1;
    const endLine = bucket[bucket.length - 1]?.lineNo ?? startLine;
    const text = bucket.map((item) => item.line).join("\n").trim();
    if (text) {
      out.push({
        startLine,
        endLine,
        text,
        hash: hashText(text),
      });
    }
  };

  const carryOverlap = () => {
    if (bucket.length === 0 || CHUNK_OVERLAP_CHARS <= 0) {
      bucket = [];
      chars = 0;
      return;
    }
    let acc = 0;
    const next: Array<{ line: string; lineNo: number }> = [];
    for (let i = bucket.length - 1; i >= 0; i -= 1) {
      const row = bucket[i];
      if (!row) continue;
      acc += row.line.length + 1;
      next.unshift(row);
      if (acc >= CHUNK_OVERLAP_CHARS) break;
    }
    bucket = next;
    chars = bucket.reduce((sum, item) => sum + item.line.length + 1, 0);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const rowSize = line.length + 1;
    if (bucket.length > 0 && chars + rowSize > CHUNK_MAX_CHARS) {
      flush();
      carryOverlap();
    }
    bucket.push({ line, lineNo: i + 1 });
    chars += rowSize;
  }
  flush();
  return out;
}

/**
 * MemoryIndexManager（单项目单实例）。
 */
export class MemoryIndexer {
  private readonly dbPath: string;
  private readonly db: Database.Database;

  constructor(private readonly rootPath: string) {
    this.dbPath = getDowncityMemoryIndexPath(rootPath);
    const dir = path.dirname(this.dbPath);
    // 同步创建目录，保证 sqlite 可打开。
    // 关键点（中文）：这里是启动路径，避免引入异步竞态。
    mkdirSync(dir, { recursive: true });
    this.db = new Database(this.dbPath);
    // 关键点（中文）：使用 WAL 改善并发读写稳定性，避免长事务阻塞查询。
    this.db.pragma("journal_mode = WAL");
    this.ensureSchema();
  }

  getRelativeDbPath(): string {
    return path.relative(this.rootPath, this.dbPath).replace(/\\/g, "/");
  }

  close(): void {
    this.db.close();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        hash TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        size INTEGER NOT NULL
      );
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        source TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        text TEXT NOT NULL,
        hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
    `);
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text,
        id UNINDEXED,
        path UNINDEXED,
        source UNINDEXED,
        start_line UNINDEXED,
        end_line UNINDEXED
      );
    `);
    const schemaVersion = this.db
      .prepare(`SELECT value FROM meta WHERE key = ?`)
      .get("schema_version") as { value?: string } | undefined;
    if (schemaVersion?.value !== String(INDEX_SCHEMA_VERSION)) {
      this.db
        .prepare(
          `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run("schema_version", String(INDEX_SCHEMA_VERSION));
    }
  }

  private listIndexedFiles(): IndexedFileRow[] {
    return this.db
      .prepare(`SELECT path, hash FROM files`)
      .all() as IndexedFileRow[];
  }

  private deleteFileIndex(relPath: string): void {
    this.db.prepare(`DELETE FROM chunks_fts WHERE path = ?`).run(relPath);
    this.db.prepare(`DELETE FROM chunks WHERE path = ?`).run(relPath);
    this.db.prepare(`DELETE FROM files WHERE path = ?`).run(relPath);
  }

  private writeFileChunks(file: MemorySourceFile, chunks: MemoryChunk[]): void {
    const now = Date.now();
    const insertChunk = this.db.prepare(
      `INSERT INTO chunks (id, path, source, start_line, end_line, text, hash, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertFts = this.db.prepare(
      `INSERT INTO chunks_fts (text, id, path, source, start_line, end_line)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const chunk of chunks) {
      const id = hashText(
        `${file.relPath}:${file.source}:${chunk.startLine}:${chunk.endLine}:${chunk.hash}`,
      );
      insertChunk.run(
        id,
        file.relPath,
        file.source,
        chunk.startLine,
        chunk.endLine,
        chunk.text,
        chunk.hash,
        now,
      );
      insertFts.run(
        chunk.text,
        id,
        file.relPath,
        file.source,
        chunk.startLine,
        chunk.endLine,
      );
    }
  }

  async sync(
    files: MemorySourceFile[],
    options?: { force?: boolean },
  ): Promise<MemoryIndexSyncResult> {
    const totalFiles = files.length;
    const force = options?.force === true;
    const existing = new Map(
      this.listIndexedFiles().map((item) => [item.path, item.hash]),
    );
    const activePaths = new Set(files.map((item) => item.relPath));
    let reindexedFiles = 0;
    let removedFiles = 0;
    let totalChunks = 0;

    this.db.exec("BEGIN");
    try {
      for (const file of files) {
        const stat = await fs.stat(file.absPath);
        const content = normalizeText(await fs.readFile(file.absPath, "utf-8"));
        const hash = hashText(content);
        const prevHash = existing.get(file.relPath);
        if (!force && prevHash === hash) {
          continue;
        }
        this.deleteFileIndex(file.relPath);
        const chunks = chunkMarkdown(content);
        this.writeFileChunks(file, chunks);
        this.db
          .prepare(
            `INSERT INTO files (path, source, hash, mtime, size)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(path) DO UPDATE SET
               source = excluded.source,
               hash = excluded.hash,
               mtime = excluded.mtime,
               size = excluded.size`,
          )
          .run(file.relPath, file.source, hash, stat.mtimeMs, stat.size);
        reindexedFiles += 1;
        totalChunks += chunks.length;
      }

      for (const stale of existing.keys()) {
        if (activePaths.has(stale)) continue;
        this.deleteFileIndex(stale);
        removedFiles += 1;
      }

      this.db
        .prepare(
          `INSERT INTO meta (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run("last_indexed_at", String(Date.now()));

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      totalFiles,
      reindexedFiles,
      removedFiles,
      totalChunks,
    };
  }

  search(params: {
    query: string;
    maxResults: number;
    minScore: number;
    maxInjectedChars: number;
  }): MemorySearchResultItem[] {
    const ftsQuery = buildFtsQuery(params.query);
    if (!ftsQuery) {
      return [];
    }
    const rows = this.db
      .prepare(
        `SELECT path, source, start_line, end_line, text, bm25(chunks_fts) AS rank
         FROM chunks_fts
         WHERE chunks_fts MATCH ?
         ORDER BY rank ASC
         LIMIT ?`,
      )
      .all(ftsQuery, Math.max(1, params.maxResults * 3)) as Array<{
      path: string;
      source: MemorySourceType;
      start_line: number;
      end_line: number;
      text: string;
      rank: number;
    }>;
    const mapped: MemorySearchResultItem[] = rows
      .map((row) => {
        const score = bm25RankToScore(row.rank);
        const citation =
          row.start_line === row.end_line
            ? `${row.path}#L${row.start_line}`
            : `${row.path}#L${row.start_line}-L${row.end_line}`;
        return {
          path: row.path,
          source: row.source,
          startLine: row.start_line,
          endLine: row.end_line,
          score,
          snippet: truncateText(row.text, SNIPPET_MAX_CHARS),
          citation,
        };
      })
      .filter((item) => item.score >= params.minScore)
      .slice(0, params.maxResults);

    let remain = Math.max(0, params.maxInjectedChars);
    const clamped: MemorySearchResultItem[] = [];
    for (const item of mapped) {
      if (remain <= 0) break;
      if (item.snippet.length <= remain) {
        clamped.push(item);
        remain -= item.snippet.length;
        continue;
      }
      clamped.push({
        ...item,
        snippet: item.snippet.slice(0, remain),
      });
      break;
    }
    return clamped;
  }

  status(): MemoryIndexStatus {
    const filesRow = this.db
      .prepare(`SELECT COUNT(*) as c FROM files`)
      .get() as { c: number } | undefined;
    const chunksRow = this.db
      .prepare(`SELECT COUNT(*) as c FROM chunks`)
      .get() as { c: number } | undefined;
    const sourceRows = this.db
      .prepare(
        `SELECT source, COUNT(*) as files,
           (SELECT COUNT(*) FROM chunks c WHERE c.source = f.source) AS chunks
         FROM files f
         GROUP BY source`,
      )
      .all() as Array<{ source: MemorySourceType; files: number; chunks: number }>;
    const orderedSources: MemorySourceType[] = ["longterm", "daily", "working"];
    const sourceCounts: MemorySourceStat[] = orderedSources.map((source) => {
        const found = sourceRows.find((item) => item.source === source);
        return {
          source,
          files: found?.files ?? 0,
          chunks: found?.chunks ?? 0,
        };
      });
    return {
      files: filesRow?.c ?? 0,
      chunks: chunksRow?.c ?? 0,
      sourceCounts,
    };
  }
}
