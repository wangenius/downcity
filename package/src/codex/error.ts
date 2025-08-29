/**
 * 错误域枚举
 */
export enum ErrorDomain {
  STORAGE = 'STORAGE',
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
}

/**
 * 错误类别枚举
 */
export enum ErrorCategory {
  USER = 'USER',
  THIRD_PARTY = 'THIRD_PARTY',
  SYSTEM = 'SYSTEM',
  NETWORK = 'NETWORK',
}

/**
 * 错误详情接口
 */
export interface ErrorDetails {
  id: string;
  domain: ErrorDomain;
  category: ErrorCategory;
  text?: string;
  details?: Record<string, any>;
}

/**
 * Codex自定义错误类
 */
export class CodexError extends Error {
  public readonly id: string;
  public readonly domain: ErrorDomain;
  public readonly category: ErrorCategory;
  public readonly details?: Record<string, any>;
  public readonly originalError?: Error;

  /**
   * 创建一个新的CodexError实例
   * @param errorDetails - 错误详情
   * @param originalError - 原始错误对象
   */
  constructor(errorDetails: ErrorDetails, originalError?: Error) {
    const message = errorDetails.text || errorDetails.id;
    super(message);
    
    this.name = 'CodexError';
    this.id = errorDetails.id;
    this.domain = errorDetails.domain;
    this.category = errorDetails.category;
    this.details = errorDetails.details;
    this.originalError = originalError;

    // 保持错误堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CodexError);
    }
  }

  /**
   * 获取完整的错误信息
   * @returns 格式化的错误信息
   */
  getFullMessage(): string {
    let message = `[${this.domain}:${this.category}] ${this.id}: ${this.message}`;
    
    if (this.details) {
      message += ` | Details: ${JSON.stringify(this.details)}`;
    }
    
    if (this.originalError) {
      message += ` | Original: ${this.originalError.message}`;
    }
    
    return message;
  }

  /**
   * 转换为JSON格式
   * @returns JSON表示的错误对象
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      id: this.id,
      domain: this.domain,
      category: this.category,
      message: this.message,
      details: this.details,
      originalError: this.originalError?.message,
      stack: this.stack,
    };
  }
}

/**
 * 预定义的错误ID常量
 */
export const ERROR_IDS = {
  // Codex相关错误
  CODEX_CREATE_FAILED: 'CODEX_CREATE_FAILED',
  CODEX_CONNECTION_FAILED: 'CODEX_CONNECTION_FAILED',
  CODEX_NOT_INITIALIZED: 'CODEX_NOT_INITIALIZED',
  
  // Volume相关错误
  VOLUME_CREATE_FAILED: 'VOLUME_CREATE_FAILED',
  VOLUME_EMBEDDING_FAILED: 'VOLUME_EMBEDDING_FAILED',
  VOLUME_SEARCH_FAILED: 'VOLUME_SEARCH_FAILED',
  VOLUME_BATCH_FAILED: 'VOLUME_BATCH_FAILED',
  VOLUME_UPSERT_FAILED: 'VOLUME_UPSERT_FAILED',
  
  // 表管理错误
  TABLE_CREATE_FAILED: 'TABLE_CREATE_FAILED',
  TABLE_DELETE_FAILED: 'TABLE_DELETE_FAILED',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  TABLE_SCHEMA_FAILED: 'TABLE_SCHEMA_FAILED',
  
  // 索引管理错误
  INDEX_CREATE_FAILED: 'INDEX_CREATE_FAILED',
  INDEX_DELETE_FAILED: 'INDEX_DELETE_FAILED',
  INDEX_LIST_FAILED: 'INDEX_LIST_FAILED',
  INDEX_STATS_FAILED: 'INDEX_STATS_FAILED',
  INDEX_NOT_FOUND: 'INDEX_NOT_FOUND',
  INDEX_DESCRIBE_FAILED: 'INDEX_DESCRIBE_FAILED',
  
  // 参数验证错误
  INVALID_ARGS: 'INVALID_ARGS',
  MISSING_REQUIRED_PARAM: 'MISSING_REQUIRED_PARAM',
} as const;