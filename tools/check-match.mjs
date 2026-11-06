#!/usr/bin/env node
/**
 * 匹配回归测试：验证索引构建 + 查询逻辑对真实期刊名的命中率。
 * 不启动浏览器，秒级完成，适合每次改完归一化逻辑后跑一遍。
 *
 * 用法：node tools/check-match.mjs [--sample 500]
 */

import fs from "node:fs";
import path from "node:path";
import { buildIndex, lookup } from "../extension/src/shared/index.js";

const HERE = import.meta.dirname;
const DATA = path.join(HERE, "..", "extension", "src", "data", "journals.json");

const sampleArg = process.argv.indexOf("--sample");
const SAMPLE = sampleArg > -1 ? Number(process.argv[sampleArg + 1]) || 500 : 500;

if (!fs.existsSync(DATA)) {
  console.error("找不到 journals.json，先运行：node tools/build-data.mjs");
  process.exit(2);
}

const t0 = Date.now();
const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
const t1 = Date.now();
const index = buildIndex(data);
const t2 = Date.now();

console.log(`· 读取 JSON   ${(t1 - t0).toString().padStart(5)} ms`);
console.log(`· 构建索引    ${(t2 - t1).toString().padStart(5)} ms   （名称键 ${index.byKey.size}，ISSN ${index.byIssn.size}）`);

// ---------------------------------------------------------------- 自洽性

function sampleOf(list, n) {
  if (list.length <= n) return list.slice();
  const step = list.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.floor(i * step)]);
  return out;
}

function rate(list, label) {
  const picked = sampleOf(list, SAMPLE);
  const t = Date.now();
  let hit = 0;
  const misses = [];
  for (const rec of picked) {
    const r = lookup(index, rec.n);
    if (r.found) hit++;
    else if (misses.length < 8) misses.push(rec.n);
  }
  const ms = Date.now() - t;
  const pct = ((hit / picked.length) * 100).toFixed(1);
  console.log(`\n[${label}] 抽样 ${picked.length} 条，命中 ${hit} 条（${pct}%），${ms} ms，平均 ${(ms / picked.length).toFixed(2)} ms/次`);
  if (misses.length) console.log("  未命中示例：" + misses.join(" | "));
  return { hit, total: picked.length, pct: Number(pct) };
}

const intlRate = rate(data.intl, "国际期刊");
const cnRate = rate(data.cn, "中文期刊");

// ---------------------------------------------------------------- 边界用例

const CASES = [
  // [输入, 期望命中的规范名, 说明]
  ["Nature", "NATURE", "基本大小写"],
  ["nature", "NATURE", "全小写"],
  ["NATURE", "NATURE", "全大写"],
  ["The Lancet", "LANCET", "去掉冠词 the"],
  ["Lancet", "LANCET", "无冠词"],
  ["Journal of the American Chemical Society", "Journal of the American Chemical Society", "完整英文名"],
  ["JOURNAL OF THE AMERICAN CHEMICAL SOCIETY", "Journal of the American Chemical Society", "全大写英文名"],
  ["Journal of the American Chemical Society (JACS)", "Journal of the American Chemical Society", "带括号缩写"],
  ["Nature Communications", "Nature Communications", "常规英文"],
  ["Advanced Materials", "Advanced Materials", "常规英文"],
  ["中国社会科学", "中国社会科学", "中文全角"],
  ["《中国社会科学》", "中国社会科学", "书名号"],
  ["管理世界", "管理世界", "中文短名"],
  ["北京大学学报（哲学社会科学版）", "北京大学学报（哲学社会科学版）", "中文全角括号"],
  ["北京大学学报(哲学社会科学版)", "北京大学学报（哲学社会科学版）", "中文半角括号"],
  ["物理学报", "物理学报", "中文理工刊"],
  ["中国科学：数学", "中国科学：数学（中国科学A辑：数学）", "中文刊名带冒号和别名后缀"],
  ["中国社会科学 2024年第3期", null, "带杂质的字符串（预期不命中，靠调用方清洗）"],
];

console.log("\n================ 边界用例 ================");
let edgeFail = 0;
for (const [input, expect, note] of CASES) {
  const r = lookup(index, input);
  const got = r.found ? r.data.n : null;
  let status;
  if (expect === null) {
    status = got === null ? "OK  " : "WARN";
  } else {
    // 期望值是"规范名"，只要命中的记录名与它互相包含就算对（数据里有大小写差异或带后缀的写法）
    const a = (got || "").toLowerCase();
    const b = expect.toLowerCase();
    status = got && (a === b || a.startsWith(b) || b.startsWith(a)) ? "OK  " : "FAIL";
    if (status === "FAIL") edgeFail++;
  }
  console.log(`  ${status}  ${JSON.stringify(input).padEnd(58)} → ${got ?? "未命中"}${r.via === "loose" ? "（宽松）" : ""}    ${note}`);
}

// ---------------------------------------------------------------- 结论

const problems = [];
if (intlRate.pct < 99) problems.push(`国际期刊命中率 ${intlRate.pct}% < 99%`);
if (cnRate.pct < 99) problems.push(`中文期刊命中率 ${cnRate.pct}% < 99%`);
if (edgeFail > 0) problems.push(`${edgeFail} 个边界用例未通过`);

console.log("\n================ 结论 ================");
if (problems.length) {
  console.log("✗ FAIL：" + problems.join("；"));
  process.exitCode = 1;
} else {
  console.log("✓ PASS：抽样命中率与边界用例全部通过");
}
