#!/usr/bin/env node
/**
 * 下载并解压 Chrome for Testing 到 .cache/cft/。
 * 端到端测试需要它——正式版 Chrome 不允许 --load-extension。
 *
 * 用法：
 *   node tools/install-chrome.mjs             # 装最新稳定版
 *   node tools/install-chrome.mjs --version 157.0.8103.38
 *   node tools/install-chrome.mjs --force     # 已存在也重装
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { flavor, binaryIn } from "./lib/chrome.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, ".cache", "cft");
const VERSION_API = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json";

const argVersion = (() => {
  const i = process.argv.indexOf("--version");
  return i > -1 ? process.argv[i + 1] : null;
})();
const FORCE = process.argv.includes("--force");

const existing = binaryIn(OUT);
if (existing && !FORCE && !argVersion) {
  console.log("· 已存在：" + existing);
  console.log("  （要重装加 --force）");
  process.exit(0);
}

let version = argVersion;
if (!version) {
  process.stdout.write("· 查询最新稳定版 … ");
  const res = await fetch(VERSION_API);
  if (!res.ok) throw new Error("查询版本失败 HTTP " + res.status);
  const json = await res.json();
  version = json.channels?.Stable?.version;
  if (!version) throw new Error("返回里没找到 Stable 版本号");
  console.log(version);
}

const f = flavor();
const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/${f}/chrome-${f}.zip`;
const zip = path.join(OUT, "chrome.zip");

fs.mkdirSync(OUT, { recursive: true });

console.log(`· 下载 ${f} …`);
const res = await fetch(url);
if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}\n  URL: ${url}`);
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync(zip, buf);
console.log(`  已完成 ${(buf.length / 1048576).toFixed(1)} MB`);

console.log("· 解压 …");
const unzip = spawnSync("unzip", ["-q", "-o", zip, "-d", OUT], { stdio: "inherit" });
if (unzip.status !== 0) throw new Error("解压失败，请确认系统有 unzip 命令");
fs.rmSync(zip, { force: true });

const bin = binaryIn(OUT);
if (!bin) throw new Error("解压后没找到可执行文件，目录：" + OUT);
console.log("✓ 安装完成：" + bin);
console.log("  端到端测试会优先使用它（tools/test-e2e.mjs）。");
