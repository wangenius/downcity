/**
 * Accounts 服务类型契约测试。
 */

import { City } from "@downcity/city";
import { accountsService } from "../../src/index.js";

const base = new City({ db: {} as never });

base.use(accountsService({ token_ttl: "7d" }));
