/**
 * Bureau 部署凭证生成模块。
 *
 * 凭证只在 Federation CLI 本地生成。Federation 接收并保存 hash，Bureau
 * 通过部署环境变量持有明文，二者之间没有在线签发流程。
 */

import { createHash, randomBytes } from "node:crypto";
import type { BureauDeploymentCredential } from "@/federation/types/FederationBureau.js";

/** 生成高熵 Bureau 部署凭证及其数据库 hash。 */
export function create_bureau_deployment_credential(): BureauDeploymentCredential {
  const token_id = `br_${randomBytes(12).toString("base64url")}`;
  const bureau_token = `fb_${token_id}.${randomBytes(32).toString("base64url")}`;
  const token_hash = createHash("sha256").update(bureau_token, "utf8").digest("base64url");
  return { token_id, bureau_token, token_hash };
}
