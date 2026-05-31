/**
 * Accounts 服务类型契约测试。
 */

import { CityBase } from "@downcity/city";
import { accountsService } from "../../src/index.js";

const base = new CityBase({ db: {} as never });

base.use(accountsService({ token_ttl: "7d" }));
