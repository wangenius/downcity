/**
 * Accounts 服务类型契约测试。
 */

import { InfraRuntime } from "@downcity/infra";
import { accountsService } from "../../src/index.js";

const base = new InfraRuntime({ db: {} as never });

base.use(accountsService({ token_ttl: "7d" }));
