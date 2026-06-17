/**
 * Accounts 服务类型契约测试。
 */

import { CityBase } from "@downcity/city";
import { AccountsService } from "../../src/index.js";

const base = new CityBase({ db: {} as never });

base.use(new AccountsService({ token_ttl: "7d" }));
