/**
 * InteractiveServer：交互式 Web UI 网关。
 *
 * 关键职责（中文）
 * - 提供独立 UI 静态资源。
 * - 将 `/api/*`、`/health`、`/webhook/*` 代理到主 Agent API。
 * - 作为前端开发与运维观察入口，不承载核心业务状态。
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import http from 'node:http';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 交互式服务上下文。
 */
export interface InteractiveServerContext {
  agentApiUrl: string; // 主 API 服务器的地址
}

export interface InteractiveStartOptions {
  port: number;
  host: string;
}

/**
 * 交互式 Web 服务器
 * 在独立端口上提供 Web UI，通过代理调用主 API 服务器
 */
/**
 * InteractiveServer。
 */
export class WebUIClient {
  private app: Hono;
  private context: InteractiveServerContext;
  private server: ReturnType<typeof http.createServer> | null = null;
  private publicDir: string;
  private version: string = 'unknown';

  constructor(context: InteractiveServerContext) {
    this.context = context;
    // 关键点（中文）：src/console/ui 与 bin/console/ui 都统一回到 packages/downcity/public。
    this.publicDir = path.join(__dirname, "../../../public");
    this.app = new Hono();

    try {
      const pkg = fs.readJsonSync(path.join(__dirname, "../../../package.json")) as {
        version?: string;
      };
      if (pkg && typeof pkg.version === 'string') this.version = pkg.version;
    } catch {
      // ignore
    }

    // 中间件
    this.app.use('*', logger());
    this.app.use('*', cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }));

    // 设置路由
    this.setupRoutes();
  }

  /**
   * 注册交互式路由。
   *
   * 关键点（中文）
   * - UI 资源本地提供，API 与 webhook 走反向代理。
   * - 代理时过滤 Host/Content-Length 等头，避免上游校验冲突。
   */
  private setupRoutes(): void {
    // 静态文件服务 - 主页
    this.app.get('/', async (c) => {
      const indexPath = path.join(this.publicDir, 'index.html');
      if (await fs.pathExists(indexPath)) {
        const content = await fs.readFile(indexPath, 'utf-8');
        return c.body(content, 200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
      }
      return c.text('Downcity Interactive Web UI', 200);
    });

    // 静态文件服务 - CSS
    this.app.get('/styles.css', async (c) => {
      const cssPath = path.join(this.publicDir, 'styles.css');
      if (await fs.pathExists(cssPath)) {
        const content = await fs.readFile(cssPath, 'utf-8');
        return c.body(content, 200, {
          'Content-Type': 'text/css; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
      }
      return c.text('Not Found', 404);
    });

    // 静态文件服务 - JS
    this.app.get('/app.js', async (c) => {
      const jsPath = path.join(this.publicDir, 'app.js');
      if (await fs.pathExists(jsPath)) {
        const content = await fs.readFile(jsPath, 'utf-8');
        return c.body(content, 200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
      }
      return c.text('Not Found', 404);
    });

    // API 代理 - 将所有 /api/* 请求代理到主 API 服务器
    // 算法说明（中文）：保留请求方法与主体，头部做最小必要过滤后透传。
    this.app.all('/api/*', async (c) => {
      try {
        const reqUrl = new URL(c.req.url);
        const upstreamUrl = new URL(reqUrl.pathname + reqUrl.search, this.context.agentApiUrl).toString();
        const method = c.req.method;

        const headers = new Headers();
        for (const [k, v] of c.req.raw.headers.entries()) {
          const key = k.toLowerCase();
          if (key === 'host' || key === 'content-length') continue;
          headers.set(k, v);
        }

        const body =
          method === 'GET' || method === 'HEAD'
            ? undefined
            : Buffer.from(await c.req.raw.arrayBuffer());

        const response = await fetch(upstreamUrl, {
          method,
          headers,
          body,
        });

        const buf = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        return new Response(buf, {
          status: response.status,
          headers: { 'Content-Type': contentType },
        });
      } catch (error) {
        return c.json({
          success: false,
          message: `代理请求失败: ${String(error)}`
        }, { status: 500 });
      }
    });

    // API 代理 - /health
    this.app.get('/health', async (c) => {
      try {
        const upstreamUrl = new URL('/health', this.context.agentApiUrl).toString();
        const response = await fetch(upstreamUrl);
        const buf = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';
        return new Response(buf, {
          status: response.status,
          headers: { 'Content-Type': contentType },
        });
      } catch (error) {
        return c.json({
          status: 'error',
          message: String(error)
        }, { status: 500 });
      }
    });

    // Webhook 代理
    this.app.post('/webhook/:type', async (c) => {
      try {
        const upstreamUrl = new URL(`/webhook/${c.req.param('type')}`, this.context.agentApiUrl).toString();
        const headers = new Headers();
        for (const [k, v] of c.req.raw.headers.entries()) {
          const key = k.toLowerCase();
          if (key === 'host' || key === 'content-length') continue;
          headers.set(k, v);
        }
        if (!headers.get('content-type')) {
          headers.set('Content-Type', 'application/json');
        }

        const body = Buffer.from(await c.req.raw.arrayBuffer());
        const response = await fetch(upstreamUrl, { method: 'POST', headers, body });
        const buf = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';
        return new Response(buf, {
          status: response.status,
          headers: { 'Content-Type': contentType },
        });
      } catch (error) {
        return c.json({
          success: false,
          message: String(error)
        }, { status: 500 });
      }
    });

    // 根路径提示
    this.app.get('/info', (c) => {
      return c.json({
        name: 'Downcity Interactive Web UI',
        version: this.version,
        agentApiUrl: this.context.agentApiUrl,
      });
    });
  }

  /**
   * 启动交互式 Web 服务。
   */
  async start(options: InteractiveStartOptions): Promise<void> {
    const { port, host } = options;

    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url || '/', `http://${host}:${port}`);
          const method = req.method || 'GET';

          // 收集 body
          const bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
            let chunks: Buffer[] = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks)));
            req.on('error', reject);
          });

          // 创建请求适配
          const request = new Request(url.toString(), {
            method,
            headers: new Headers(req.headers as Record<string, string>),
            body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
          });

          const response = await this.app.fetch(request);

          // 转换 Response 为 HTTP 响应
          res.statusCode = response.status;
          for (const [key, value] of response.headers.entries()) {
            res.setHeader(key, value);
          }
          const body = await response.text();
          res.end(body);
        } catch (error) {
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      });

      this.server = server;
      server.listen(port, host, () => {
        console.log(`\n🌐 交互式 Web 界面已启动: http://${host}:${port}`);
        console.log('📌 可用功能:');
        console.log('   - 多 Context 消息历史');
        console.log('   - Services 运行状态');
        console.log('   - Tasks 执行过程与产物');
        console.log('   - 实时日志查看');
        console.log('');
        resolve();
      });
    });
  }

  /**
   * 停止交互式 Web 服务。
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      console.log('🌐 交互式 Web 服务器已停止');
    }
  }

  getApp(): Hono {
    return this.app;
  }
}

export function createWebUIClient(context: InteractiveServerContext): WebUIClient {
  return new WebUIClient(context);
}
