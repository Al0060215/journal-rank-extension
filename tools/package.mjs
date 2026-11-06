#!/usr/bin/env node
/**
 * 打包成可发布的 zip：dist/journal-rank-extension-v<version>.zip
 * 解压后得到一个 extension/ 文件夹，直接在 chrome://extensions 里「加载已解压的扩展程序」即可。
 *
 * 用法：node tools/package.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.join(import.meta.dirname, "..");
const EXT = path.join(ROOT, "extension");
const DIST = path.join(ROOT, "dist");

const manifest = JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8"));
const name = `journal-rank-extension-v${manifest.version}`;
const out = path.join(DIST, `${name}.zip`);

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const res = spawnSync(
  "zip",
  ["-r", "-X", "-q", out, "extension", "-x", "*.DS_Store", "-x", "*/__MACOSX/*"],
  { cwd: ROOT, stdio: "inherit" }
);

if (res.error || res.status !== 0) {
  console.error("✗ 打包失败，请确认系统里有 zip 命令");
  process.exit(1);
}

const size = fs.statSync(out).size;
const files = spawnSync("unzip", ["-l", out], { encoding: "utf8" }).stdout?.trim().split("\n").length || 0;

console.log(`✓ ${path.relative(ROOT, out)}`);
console.log(`  版本 ${manifest.version}　${(size / 1048576).toFixed(2)} MB　${files - 2} 个文件`);
console.log("  解压后得到 extension/ 文件夹，直接加载即可。");
