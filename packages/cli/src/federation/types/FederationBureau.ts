/**
 * Federation CLI Bureau 管理类型。
 *
 * 这些类型只描述 CLI 本地生成的部署凭证和命令输入，不代表 Federation
 * 签发协议。
 */

/** CLI 本地生成的 Bureau 部署凭证。 */
export interface BureauDeploymentCredential {
  /** 用于 Federation 数据库查找注册记录的公开 ID。 */
  token_id: string;

  /** 只显示一次并配置到 Bureau 环境变量的完整明文。 */
  bureau_token: string;

  /** 提交给 Federation 保存的 SHA-256 Base64URL hash。 */
  token_hash: string;
}

/** `fed bureau add` 的标准化输入。 */
export interface AddFederationBureauInput {
  /** 便于运维识别 Bureau 部署用途的名称。 */
  name: string;

  /** Bureau 后端所属的 Federation City ID。 */
  city_id: string;
}
