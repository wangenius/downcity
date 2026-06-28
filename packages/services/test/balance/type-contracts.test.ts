import { Federation } from "@downcity/city";
import { BalanceService } from "../../src/index.js";

async function verifyBalanceServiceContract(): Promise<void> {
  const base = new Federation({
    db: {} as never,
  });

  const balance = new BalanceService({
    init_credits: 100_000_000,
  });

  base.use(balance);

  await balance.read("user_1");
  await balance.require("user_1", 10_000);
  await balance.add("user_1", 20_000, {
    note: "bonus",
    ref: "bonus_1",
    meta: {
      source: "admin",
    },
  });
  await balance.sub("user_1", 5_000, {
    note: "chat",
    meta: {
      city_id: "city_downcity",
    },
  });
  await balance.createTopup("user_1", 50_000_000, {
    note: "manual",
  });
  const issued = await balance.createRedeemCode({
    credits: 30_000_000,
    note: "gift",
  });
  await balance.redeemCode("user_1", issued.code, {
    note: "campaign",
  });
  await balance.listRedeemCodes({
    status: "redeemed",
  });
  await balance.disableRedeemCode("rc_demo", {
    note: "expired",
  });
}

void verifyBalanceServiceContract;
