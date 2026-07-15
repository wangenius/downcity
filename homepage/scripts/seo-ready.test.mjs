/**
 * Homepage SEO 构建产物回归测试。
 *
 * 该测试在完整 build 后执行，验证 sitemap、canonical、hreflang 与静态 404
 * 确实进入 Cloudflare Pages 发布目录，而不只是在源码层看起来正确。
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const build_root = new URL("../build/client/", import.meta.url);

/** 读取构建目录中的 UTF-8 文本文件。 */
async function read_build_file(relative_path) {
  return readFile(new URL(relative_path, build_root), "utf8");
}

test("sitemap 输出规范 XML 和公开 URL", async () => {
  const sitemap = await read_build_file("sitemap.xml");

  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset[^>]+xmlns:xhtml=/);
  assert.match(sitemap, /<loc>https:\/\/downcity\.ai\/</);
  assert.match(sitemap, /hreflang="zh-CN"/);
  assert.doesNotMatch(sitemap, /www\.downcity\.ai/);
  assert.doesNotMatch(sitemap, /\.mdx(?:<|&)/);
  assert.doesNotMatch(sitemap, /<html/i);
});

test("营销页与文档页输出 self canonical 和双向 hreflang", async () => {
  const cases = [
    ["index.html", "https://downcity.ai/", "https://downcity.ai/zh/"],
    ["zh/features/index.html", "https://downcity.ai/zh/features/", "https://downcity.ai/features/"],
    [
      "en/docs/agent/overview/index.html",
      "https://downcity.ai/en/docs/agent/overview/",
      "https://downcity.ai/zh/docs/agent/overview/",
    ],
  ];

  for (const [relative_path, canonical_url, alternate_url] of cases) {
    const html = await read_build_file(relative_path);
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical_url}"`));
    assert.ok(html.includes(`href="${alternate_url}"`));
    assert.match(html, /<meta name="robots" content="index, follow"/);
  }
});

test("静态 404 页面禁止索引", async () => {
  const html = await read_build_file("404.html");

  assert.match(html, /<title>Page not found - Downcity<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
});
