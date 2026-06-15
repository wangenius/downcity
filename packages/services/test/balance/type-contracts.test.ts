import { CityBase } from "@downcity/city";
import { balanceService } from "../../src/index.js";

async function verifyBalanceServiceContract(): Promise<void> {
  const base = new CityBase({
    db: {} as never,
  });

  const balance = balanceService({
    init: 100,
  });

  base.use(balance);

  await balance.read("user_1");
  await balance.require("user_1", 10);
  await balance.add("user_1", 20, {
    note: "bonus",
    ref: "bonus_1",
    meta: {
      source: "admin",
    },
  });
  await balance.sub("user_1", 5, {
    note: "chat",
    meta: {
      town_id: "town_downcity",
    },
  });
  await balance.createTopup("user_1", 50, {
    note: "manual",
  });
  const issued = await balance.createRedeemCode({
    amount: 30,
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
