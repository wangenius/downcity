/**
 * 可安装服务桥接模块。
 *
 * 提供 `InstallableService` 基类，把带 `install(ctx)` 生命周期的服务
 * 统一桥接到 `Service.action()` 体系。
 */

import { Service, type Context, type EnvRequirement } from "./service.ts";
import { Hook } from "./hook.ts";
import { TableApi } from "../store/table-api.ts";
import type { CityTableApi } from "../store/table-api.ts";
import type { CreateUserTokenInput, UserTokenIssueResult, RuntimeUser } from "../core/auth/types.ts";
import type { InstructionDefinition } from "./instruction.ts";

// ===========================================================================
// ServiceInstallContext
// ===========================================================================

export interface ServiceInstallContext {
  table<TRow extends Record<string, unknown> = Record<string, unknown>>(name: string): CityTableApi<TRow>;

  route(config: {
    method: "GET" | "POST";
    path: string;
    auth?: Array<"user" | "admin">;
    handler: (ctx: ServiceRouteContext) => Promise<Response> | Response;
  }): void;

  hook: {
    before(fn: (ctx: Context) => Promise<void> | void): void;
    after(fn: (ctx: Context) => Promise<void> | void): void;
    onError(fn: (ctx: Context) => Promise<void> | void): void;
  };

  createUserToken(input: CreateUserTokenInput): Promise<UserTokenIssueResult>;
  env(key: string): string | undefined;
}

export interface ServiceRouteContext {
  /** 当前 user_token 解析出的用户；免登录或 admin 请求时可能为空 */
  user?: RuntimeUser;
  /** 当前 user_token 对应的 town；免登录或 admin 请求时可能为空 */
  town?: { town_id: string; status: string };
  /** 原始 HTTP 请求 */
  request: Request;
  /** 读取已解析 JSON 请求体 */
  json<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<T>;
  /** 读取原始文本请求体 */
  text(): Promise<string>;
  /** 快速返回 JSON Response */
  jsonResponse(body: unknown, status?: number): Response;
}

// ===========================================================================
// InstallableService 基类
// ===========================================================================

export abstract class InstallableService extends Service {
  readonly schema?: Record<string, any>;
  /**
   * 服务级全局 hook。
   *
   * 通过 ServiceInstallContext.hook 注册，City 会在所有 Service Action
   * 执行时统一触发。服务自己的路由仍然通过 Service.action() 暴露。
   */
  readonly globalHook = new Hook();

  constructor(env?: EnvRequirement[]) {
    super({ id: "service", env });
  }

  abstract install(ctx: ServiceInstallContext): void;

  async _onInit(): Promise<void> {
    if (this.schema && !this.tables) {
      (this as any).tables = this.schema;
    }

    const self = this;
    const ctx: ServiceInstallContext = {
      table<TRow extends Record<string, unknown> = Record<string, unknown>>(name: string): CityTableApi<TRow> {
        if (!self._db) throw new Error("InstallableService database is not ready");
        const table = self.tables?.[name];
        if (!table) throw new Error(`Unknown table: ${name}`);
        return new TableApi(self._db, table) as unknown as CityTableApi<TRow>;
      },

      route(config): void {
        // 去掉前导 /，与 client ServiceClient.action() 的 normalizeName 对齐
        const actionId = config.path.replace(/^\/+/, "");
        self.action(actionId, async (svcCtx: Context) => {
          return await config.handler({
            user: svcCtx.user,
            town: svcCtx.town,
            request: svcCtx.request ?? new Request("http://local"),
            json: async <T extends Record<string, unknown> = Record<string, unknown>>() => svcCtx.input as T,
            text: async () => svcCtx.raw_body ?? JSON.stringify(svcCtx.input),
            jsonResponse: (body, status) => new Response(JSON.stringify(body), {
              status, headers: { "content-type": "application/json" },
            }),
          });
        }, { method: config.method as "GET" | "POST", auth: config.auth });
      },

      hook: {
        before(fn) { self.globalHook.before(fn); },
        after(fn) { self.globalHook.after(fn); },
        onError(fn) { self.globalHook.onError(fn); },
      },

      async createUserToken(input) {
        if (!self._authenticator) throw new Error("Authenticator not ready");
        return self._authenticator.createToken(input);
      },

      env(key) {
        return self._env?.get(key);
      },
    };

    this.install(ctx);
  }
}

export type ServiceDefinition = {
  id: string;
  name?: string;
  version?: string;
  schema?: Record<string, unknown>;
  /**
   * 服务依赖的运行时环境变量声明。
   *
   * 关键说明（中文）
   * - 这些 key 会出现在 `/v1/services` 中，供 manager / admin UI 展示
   * - City 会把这些 key 自动注册到自己的 env requirement 目录中
   */
  env?: EnvRequirement[];
  instruction?: InstructionDefinition;
  install(ctx: ServiceInstallContext): void;
};

export function asInstallableService(bp: ServiceDefinition): InstallableService {
  return new (class extends InstallableService {
    constructor() {
      super(bp.env);
      (this as any).id = bp.id;
      if (bp.name) (this as any).name = bp.name;
      if (bp.schema) (this as any).tables = bp.schema;
      if (bp.instruction) this.instruction = bp.instruction;
    }
    install(ctx: ServiceInstallContext): void {
      bp.install(ctx);
    }
  })();
}
