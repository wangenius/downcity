/**
 * Federation CLI 项目配置、registry 与 Local deploy 生命周期测试。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/** 创建隔离临时目录。 */
function create_temp_dir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** 将模板文件写入测试项目。 */
function write_template_files(project_dir, files) {
  for (const file of files) {
    const file_path = path.join(project_dir, file.path);
    fs.mkdirSync(path.dirname(file_path), { recursive: true });
    fs.writeFileSync(file_path, file.content);
  }
}

/** 判断 PID 当前是否存活。 */
function is_process_alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("内置模板生成严格的新 Federation 配置", async () => {
  const project_dir = create_temp_dir("downcity-fed-template-");
  try {
    const template = await import("../bin/federation/create/templates/LocalNodeTemplate.js");
    const reader = await import("../bin/federation/deploy/config/FederationProjectConfigReader.js");
    write_template_files(project_dir, template.create_local_node_template_files({
      fed_id: "fed_template_test",
      name: "template-test",
    }));

    const config_file = reader.read_federation_project_config(project_dir);
    assert.equal(config_file.config.type, "federation");
    assert.equal(config_file.config.id, "fed_template_test");
    assert.equal(config_file.config.deployment.target, "local");
    assert.deepEqual(config_file.config.deployment.resources, {});
    assert.equal(fs.existsSync(path.join(project_dir, "src/index.ts")), true);
  } finally {
    fs.rmSync(project_dir, { recursive: true, force: true });
  }
});

test("Cloudflare 模板通过统一 deployment 配置生成 Wrangler binding", async () => {
  const project_dir = create_temp_dir("downcity-fed-cloudflare-");
  try {
    const template = await import("../bin/federation/create/templates/CloudflareWorkersTemplate.js");
    const reader = await import("../bin/federation/deploy/config/FederationProjectConfigReader.js");
    const writer = await import("../bin/federation/deploy/runtime/WranglerConfigWriter.js");
    write_template_files(project_dir, template.create_cloudflare_workers_template_files({
      fed_id: "fed_cloudflare_test",
      name: "cloudflare-test",
    }));

    const config_file = reader.read_federation_project_config(project_dir);
    assert.equal(config_file.config.deployment.target, "cloudflare-workers");
    assert.equal(config_file.config.deployment.resources.d1.name, "cloudflare-test-db");
    assert.equal(config_file.config.deployment.resources.queue.name, "cloudflare-test-queue");
    assert.equal(config_file.config.deployment.resources.storage.name, "cloudflare-test-storage");

    const result = writer.writeWranglerConfig(
      config_file,
      "00000000-0000-0000-0000-000000000001",
    );
    const wrangler = fs.readFileSync(result.config_path, "utf8");
    assert.match(wrangler, /binding = "DB"/u);
    assert.match(wrangler, /database_name = "cloudflare-test-db"/u);
    assert.match(wrangler, /queue = "cloudflare-test-queue"/u);
    assert.match(wrangler, /bucket_name = "cloudflare-test-storage"/u);
    fs.rmSync(path.dirname(result.config_path), { recursive: true, force: true });
  } finally {
    fs.rmSync(project_dir, { recursive: true, force: true });
  }
});

test("默认 Local 模板自动注入可用的 admin key", async () => {
  const platform_root = create_temp_dir("downcity-fed-admin-state-");
  const project_dir = create_temp_dir("downcity-fed-admin-project-");
  process.env.DC_PLATFORM_ROOT = platform_root;
  const template = await import("../bin/federation/create/templates/LocalNodeTemplate.js");
  const reader = await import("../bin/federation/deploy/config/FederationProjectConfigReader.js");
  const deployer = await import("../bin/federation/deploy/runtime/LocalFederationDeployer.js");
  const session = await import("../bin/federation/core/session.js");
  write_template_files(project_dir, template.create_local_node_template_files({
    fed_id: "fed_admin_injection_test",
    name: "admin-injection-test",
  }));
  fs.symlinkSync(
    fileURLToPath(new URL("../../../templates/node/node_modules", import.meta.url)),
    path.join(project_dir, "node_modules"),
    "dir",
  );

  let server;
  try {
    const config_file = reader.read_federation_project_config(project_dir);
    await deployer.deploy_local_federation(config_file, {
      source: project_dir,
      dry_run: false,
      verify_only: false,
      verify: true,
      skip_build: true,
      skip_typecheck: true,
    });
    server = session.read_server_by_fed_id(config_file.config.id, "local");
    assert.ok(server);
    assert.match(server.admin_secret_key, /^admin_[0-9a-f]{64}$/u);

    const unauthorized = await fetch(`${server.base_url}/v1/federation/instruction`);
    assert.equal(unauthorized.status, 401);
    const authorized = await fetch(`${server.base_url}/v1/federation/instruction`, {
      headers: { authorization: `Bearer ${server.admin_secret_key}` },
    });
    assert.equal(authorized.status, 200);
  } finally {
    if (server) await deployer.stop_managed_local_server(server);
    fs.rmSync(platform_root, { recursive: true, force: true });
    fs.rmSync(project_dir, { recursive: true, force: true });
    delete process.env.DC_PLATFORM_ROOT;
  }
});

test("Local deploy 登记全局状态并替换同一 Fed 的旧实例", async () => {
  const platform_root = create_temp_dir("downcity-fed-state-");
  const project_dir = create_temp_dir("downcity-fed-project-");
  process.env.DC_PLATFORM_ROOT = platform_root;

  const config = {
    schema: 1,
    type: "federation",
    id: "fed_lifecycle_test",
    name: "lifecycle-test",
    entry: "server.mjs",
    deployment: {
      target: "local",
      scripts: {
        deploy: "node server.mjs",
      },
    },
  };
  fs.writeFileSync(path.join(project_dir, "federation.json"), `${JSON.stringify(config, null, 2)}\n`);
  fs.writeFileSync(path.join(project_dir, "server.mjs"), `
import http from "node:http";
const port = Number(process.env.PORT);
http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, port }));
    return;
  }
  response.writeHead(404);
  response.end();
}).listen(port, process.env.HOST);
`);

  const reader = await import("../bin/federation/deploy/config/FederationProjectConfigReader.js");
  const deployer = await import("../bin/federation/deploy/runtime/LocalFederationDeployer.js");
  const session = await import("../bin/federation/core/session.js");
  const options = {
    source: project_dir,
    dry_run: false,
    verify_only: false,
    verify: true,
    skip_build: true,
    skip_typecheck: true,
  };

  let latest_server;
  try {
    const config_file = reader.read_federation_project_config(project_dir);
    await deployer.deploy_local_federation(config_file, options);
    const first_server = session.read_server_by_fed_id(config.id, "local");
    assert.ok(first_server);
    assert.equal(first_server.status, "running");
    assert.match(first_server.admin_secret_key, /^admin_[0-9a-f]{64}$/u);
    assert.ok(first_server.port >= 12314);
    assert.ok(is_process_alive(first_server.pid));

    const outside_dir = create_temp_dir("downcity-fed-outside-");
    const previous_cwd = process.cwd();
    process.chdir(outside_dir);
    try {
      assert.equal(session.readActiveServer().fed_id, config.id);
    } finally {
      process.chdir(previous_cwd);
      fs.rmSync(outside_dir, { recursive: true, force: true });
    }

    await deployer.deploy_local_federation(config_file, options);
    latest_server = session.read_server_by_fed_id(config.id, "local");
    assert.ok(latest_server);
    assert.notEqual(latest_server.pid, first_server.pid);
    assert.equal(latest_server.port, first_server.port);
    assert.equal(latest_server.admin_secret_key, first_server.admin_secret_key);
    assert.equal(is_process_alive(first_server.pid), false);
    assert.equal((await fetch(`${latest_server.base_url}/health`)).status, 200);
  } finally {
    if (latest_server) await deployer.stop_managed_local_server(latest_server);
    fs.rmSync(platform_root, { recursive: true, force: true });
    fs.rmSync(project_dir, { recursive: true, force: true });
    delete process.env.DC_PLATFORM_ROOT;
  }
});
