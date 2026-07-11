/**
 * 旧 Chat Authorization JSON 到 Chat Access SQLite 的一次性迁移。
 *
 * 关键点（中文）
 * - 迁移只读取旧文件，不在运行时保留双读或双写。
 * - 旧 Role 名称不参与判定，只根据 chat.dm.use/chat.group.use 生成准入 Grant。
 * - 每个渠道必须提供明确 issuer，无法确定时保留旧文件等待后续迁移。
 */

import fs from "fs-extra";
import path from "node:path";
import type { ChatAccessStore } from "@/chat/access/ChatAccessStore.js";
import type {
  ChatAccessScope,
  LegacyChatAuthorizationConfig,
  LegacyChatAuthorizationState,
  LegacyChatAuthorizationUser,
} from "@/chat/types/ChatAccess.js";
import type { ChatDispatchChannel } from "@/chat/types/ChatDispatcher.js";

const CHANNELS: ChatDispatchChannel[] = ["telegram", "feishu", "qq"];

function normalize_text(value: unknown): string {
  return String(value || "").trim();
}

function to_iso(value: unknown, fallback: string): string {
  const numeric_value = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric_value) && numeric_value > 0) {
    return new Date(numeric_value).toISOString();
  }
  const text = normalize_text(value);
  if (text && Number.isFinite(Date.parse(text))) return new Date(text).toISOString();
  return fallback;
}

function read_json_file<T>(file_path: string): T | null {
  if (!fs.existsSync(file_path)) return null;
  try {
    return fs.readJsonSync(file_path) as T;
  } catch {
    return null;
  }
}

function resolve_scopes_for_role(
  config: LegacyChatAuthorizationConfig | null,
  role_id: string,
): ChatAccessScope[] {
  const permissions = config?.roles?.[role_id]?.permissions;
  if (!Array.isArray(permissions)) return [];
  const permission_set = new Set(permissions.map((item) => normalize_text(item)));
  const scopes: ChatAccessScope[] = [];
  if (permission_set.has("chat.dm.use")) scopes.push("direct");
  if (permission_set.has("chat.group.use")) scopes.push("group");
  return scopes;
}

function resolve_scope_from_chat_type(
  channel: ChatDispatchChannel,
  chat_type: unknown,
): ChatAccessScope {
  const type = normalize_text(chat_type).toLowerCase();
  if (!type) return "direct";
  if (channel === "telegram") return type === "private" ? "direct" : "group";
  if (channel === "feishu") return type === "p2p" ? "direct" : "group";
  return type === "private" || type === "c2c" ? "direct" : "group";
}

function users_for_channel(
  state: LegacyChatAuthorizationState | null,
  channel: ChatDispatchChannel,
): Map<string, LegacyChatAuthorizationUser> {
  const users = new Map<string, LegacyChatAuthorizationUser>();
  const raw_users = state?.usersByKey;
  if (!raw_users || typeof raw_users !== "object") return users;
  for (const value of Object.values(raw_users)) {
    if (!value || typeof value !== "object") continue;
    if (normalize_text(value.channel) !== channel) continue;
    const user_id = normalize_text(value.userId);
    if (!user_id) continue;
    users.set(user_id, value);
  }
  return users;
}

function channels_with_legacy_data(
  config: LegacyChatAuthorizationConfig | null,
  state: LegacyChatAuthorizationState | null,
): ChatDispatchChannel[] {
  return CHANNELS.filter((channel) => {
    const bindings = config?.channels?.[channel]?.userRoles;
    if (bindings && Object.keys(bindings).length > 0) return true;
    return users_for_channel(state, channel).size > 0;
  });
}

function backup_legacy_files(project_root: string, files: string[]): void {
  const backup_dir = path.join(
    project_root,
    ".downcity",
    "chat",
    "migration-backup",
    "authorization",
  );
  fs.ensureDirSync(backup_dir);
  for (const file_path of files) {
    if (!fs.existsSync(file_path)) continue;
    const target_path = path.join(backup_dir, path.basename(file_path));
    fs.moveSync(file_path, target_path, { overwrite: true });
  }
}

/**
 * 执行旧 Chat Authorization 数据迁移。
 */
export function migrate_legacy_chat_access(input: {
  project_root: string;
  issuer_by_channel: Partial<Record<ChatDispatchChannel, string>>;
  store: ChatAccessStore;
}): void {
  const project_root = path.resolve(input.project_root);
  const legacy_dir = path.join(project_root, ".downcity", "chat", "authorization");
  const config_path = path.join(legacy_dir, "config.json");
  const state_path = path.join(legacy_dir, "state.json");
  const config = read_json_file<LegacyChatAuthorizationConfig>(config_path);
  const state = read_json_file<LegacyChatAuthorizationState>(state_path);
  if (!config && !state) return;

  const migration_started_key = "legacy_migration_started";
  const migration_skipped_key = "legacy_migration_skipped_existing_data";
  if (input.store.get_meta(migration_skipped_key) === "1") return;
  if (input.store.get_meta(migration_started_key) !== "1") {
    // 关键点（中文）：只允许空的新库启动旧数据迁移，避免把旧权限意外合并进已启用的 Access Store。
    if (input.store.has_access_data()) {
      input.store.set_meta(migration_skipped_key, "1");
      return;
    }
    input.store.set_meta(migration_started_key, "1");
  }

  const relevant_channels = channels_with_legacy_data(config, state);
  for (const channel of relevant_channels) {
    const issuer = normalize_text(input.issuer_by_channel[channel]);
    if (!issuer) continue;
    const migration_key = `legacy_migrated:${channel}:${issuer}`;
    if (input.store.get_meta(migration_key) === "1") continue;

    input.store.transaction(() => {
      const observed_users = users_for_channel(state, channel);
      const bindings = config?.channels?.[channel]?.userRoles || {};
      const user_ids = new Set<string>([
        ...observed_users.keys(),
        ...Object.keys(bindings).map((item) => normalize_text(item)).filter(Boolean),
      ]);
      const current_time = new Date().toISOString();

      for (const user_id of user_ids) {
        const observed = observed_users.get(user_id);
        const principal = input.store.upsert_principal({
          channel,
          issuer,
          subject_id: user_id,
          display_name: normalize_text(observed?.username) || undefined,
          chat_id: normalize_text(observed?.lastChatId) || undefined,
          chat_type: normalize_text(observed?.lastChatType) || undefined,
          first_seen_at: to_iso(observed?.firstSeenAt, current_time),
          last_seen_at: to_iso(observed?.lastSeenAt, current_time),
        });
        const role_id = normalize_text(bindings[user_id]);
        const scopes = resolve_scopes_for_role(config, role_id);
        for (const scope of scopes) {
          input.store.upsert_grant({
            principal_id: principal.principal_id,
            scope,
            effect: "allow",
            operator: "legacy-migration",
          });
        }
        if (scopes.length === 0 && observed?.lastChatId) {
          input.store.create_or_touch_request({
            principal_id: principal.principal_id,
            scope: resolve_scope_from_chat_type(channel, observed.lastChatType),
            chat_id: normalize_text(observed.lastChatId),
            chat_type: normalize_text(observed.lastChatType),
          });
        }
      }
      input.store.set_meta(migration_key, "1");
    });
  }

  const all_migrated = relevant_channels.every((channel) => {
    const issuer = normalize_text(input.issuer_by_channel[channel]);
    return !!issuer && input.store.get_meta(`legacy_migrated:${channel}:${issuer}`) === "1";
  });
  if (all_migrated) {
    backup_legacy_files(project_root, [config_path, state_path]);
  }
}
