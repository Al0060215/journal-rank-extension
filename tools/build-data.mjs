#!/usr/bin/env node
/**
 * 把 tools/raw/ 下的原始数据表合并成插件用的 journals.json。
 *
 * 数据来源（均为公开数据，见 README 的「数据来源与版权」一节）：
 *   FQBJCR2025-UTF8.csv  —— 中科院文献情报中心《期刊分区表》升级版 2025（大类/小类分区、Top、OA、WoS 收录类型）
 *   JCR2025-UTF8.csv     —— Clarivate JCR 2025（影响因子、分区、学科排名）
 *   CCF2026-UTF8.csv     —— CCF 推荐国际学术刊物/会议目录 2026
 *   GJQKYJMD20xx.csv     —— 国际期刊预警名单 2023/2024/2025
 *   core_plugin_data.json—— 中文核心体系（北大核心 2023、CSSCI、CSCD、科技核心、AMI、国社科、RCCSE、高质量科技期刊）
 *   EI-readme.md         —— Ei Compendex 收录期刊目录
 *
 * 用法：node tools/build-data.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { normalizeKey, normalizeLoose, normalizeIssn, splitIssns } from "../extension/src/shared/normalize.js";

const HERE = import.meta.dirname;
const RAW = path.join(HERE, "raw");
const OUT_DIR = path.join(HERE, "..", "extension", "src", "data");
const OUT_FILE = path.join(OUT_DIR, "journals.json");

// ---------------------------------------------------------------- CSV

function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readCSV(name) {
  const file = path.join(RAW, name);
  if (!fs.existsSync(file)) {
    console.warn(`  ! 缺少 ${name}，跳过`);
    return null;
  }
  const rows = parseCSV(fs.readFileSync(file, "utf8"));
  const header = rows[0].map((h) => h.trim());
  return { header, rows: rows.slice(1) };
}

const col = (header, name) => header.indexOf(name);

// ---------------------------------------------------------------- 记录容器

const byUid = new Map();     // uid -> record
const byIssn = new Map();    // issn -> uid
const byName = new Map();    // normalizeKey(name) -> uid（仅精确 key）

function makeRecord(name) {
  return {
    _uid: "r" + byUid.size,
    n: String(name || "").trim(),
    al: [], i: [], w: [], ws: "",
    z: 0, t: 0, c: "", s: [],
    f: null, q: "", j: [],
    ei: 0, ccf: "", warn: "", ab: [],
  };
}

function ensureRecord(name, issns = []) {
  const clean = String(name || "").trim();
  if (!clean) return null;

  // 1) ISSN 优先
  for (const issn of issns) {
    const uid = byIssn.get(issn);
    if (uid) return byUid.get(uid);
  }
  // 2) 精确名称
  const key = normalizeKey(clean);
  if (key && byName.has(key)) return byUid.get(byName.get(key));

  // 新建
  const rec = makeRecord(clean);
  const uid = rec._uid;
  byUid.set(uid, rec);
  for (const issn of issns) { rec.i.push(issn); byIssn.set(issn, uid); }
  if (key) byName.set(key, uid);
  return rec;
}

/** 给已有记录补充别名 / ISSN */
function attachAlias(rec, name, issns = []) {
  const clean = String(name || "").trim();
  if (clean && normalizeKey(clean) !== normalizeKey(rec.n) && !rec.al.includes(clean)) rec.al.push(clean);
  for (const issn of issns) {
    if (!rec.i.includes(issn)) { rec.i.push(issn); if (!byIssn.has(issn)) byIssn.set(issn, rec._uid); }
  }
}

// ---------------------------------------------------------------- 1. 中科院分区

console.log("[1/6] 中科院分区表 2025 …");
{
  const csv = readCSV("FQBJCR2025-UTF8.csv");
  if (csv) {
    const { header, rows } = csv;
    const cName = col(header, "Journal"), cIssn = col(header, "ISSN/EISSN");
    const cWos = col(header, "Web of Science"), cMajor = col(header, "大类");
    const cZone = col(header, "大类分区"), cTop = col(header, "Top");
    const subNames = [], subZones = [];
    for (let i = 1; i <= 6; i++) {
      const a = col(header, `小类${i}`), b = col(header, `小类${i}分区`);
      if (a >= 0 && b >= 0) { subNames.push(a); subZones.push(b); }
    }
    let n = 0;
    for (const r of rows) {
      const name = (r[cName] || "").trim();
      if (!name) continue;
      const issns = splitIssns(r[cIssn]);
      const rec = ensureRecord(name, issns);
      if (!rec) continue;
      attachAlias(rec, name, issns);
      // 中科院表的期刊名大小写更规范，优先用它做展示名
      if (rec.n === rec.n.toUpperCase() && name !== name.toUpperCase()) {
        if (!rec.al.includes(rec.n)) rec.al.push(rec.n);
        rec.n = name;
      }

      rec.w = parseWos(r[cWos]);
      rec.ws = parseWosStatus(r[cWos]);
      rec.c = (r[cMajor] || "").trim();
      const [zone, rank] = parseZone(r[cZone]);
      rec.z = zone;
      rec.t = (r[cTop] || "").trim() === "是" ? 1 : 0;

      rec.s = [];
      for (let k = 0; k < subNames.length; k++) {
        const sub = (r[subNames[k]] || "").trim();
        if (!sub) continue;
        const [sz, sr] = parseZone(r[subZones[k]]);
        rec.s.push(`${sub.replace(/\|/g, "/")}|${sz || ""}|${sr || ""}`);
      }
      n++;
    }
    console.log(`      读入 ${n} 条`);
  }
}

function parseWos(raw) {
  let s = String(raw || "").trim().toUpperCase();
  if (!s) return [];
  for (const st of ["ONHOLD", "SUPPRESSED"]) s = s.split(st).join("");
  const ORDER = ["ESCI", "SCIE", "SSCI", "AHCI", "SCI"];
  const out = [];
  while (s.length) {
    const hit = ORDER.find((t) => s.startsWith(t));
    if (!hit) { s = s.slice(1); continue; }
    const norm = hit === "SCI" ? "SCIE" : hit; // 中科院表里 SCI 与 SCIE 同义
    if (!out.includes(norm)) out.push(norm);
    s = s.slice(hit.length);
  }
  return out;
}
function parseWosStatus(raw) {
  const s = String(raw || "").toUpperCase();
  if (s.includes("ONHOLD")) return "onhold";
  if (s.includes("SUPPRESSED")) return "suppressed";
  return "";
}
/** "3 [168/436]" -> [3, "168/436"] */
function parseZone(raw) {
  const m = String(raw || "").match(/([1-4])\s*\[([^\]]+)\]/);
  if (m) return [Number(m[1]), m[2].trim()];
  const m2 = String(raw || "").match(/^([1-4])$/);
  return [m2 ? Number(m2[1]) : 0, ""];
}

// ---------------------------------------------------------------- 2. JCR

console.log("[2/6] JCR 2025 …");
{
  const csv = readCSV("JCR2025-UTF8.csv");
  if (csv) {
    const { header, rows } = csv;
    const cName = col(header, "Journal"), cIssn = col(header, "ISSN"), cEissn = col(header, "EISSN");
    const cWos = col(header, "Web of Science"), cIf = col(header, "IF(2025)");
    const cats = [];
    for (let i = 1; i <= 6; i++) {
      const c1 = col(header, `Category_${i}`), c2 = col(header, `IF Quartile(2025)_${i}`), c3 = col(header, `IF Rank(2025)_${i}`);
      if (c1 >= 0) cats.push([c1, c2, c3]);
    }
    let n = 0;
    for (const r of rows) {
      const name = (r[cName] || "").trim();
      if (!name) continue;
      const issns = [normalizeIssn(r[cIssn]), normalizeIssn(r[cEissn])].filter(Boolean);
      const rec = ensureRecord(name, issns);
      if (!rec) continue;
      attachAlias(rec, name, issns);

      const ifv = parseFloat(String(r[cIf] || "").replace(/,/g, ""));
      if (Number.isFinite(ifv)) rec.f = ifv;
      if (!rec.w.length) rec.w = parseWos(r[cWos]);

      rec.j = [];
      let best = "";
      for (const [c1, c2, c3] of cats) {
        const cat = (r[c1] || "").trim();
        if (!cat) continue;
        const q = (r[c2] || "").trim().toUpperCase();
        const rank = (r[c3] || "").trim();
        rec.j.push(`${cat.replace(/\|/g, "/")}|${q}|${rank}`);
        if (/^Q[1-4]$/.test(q) && (!best || q < best)) best = q;
      }
      if (best) rec.q = best;
      n++;
    }
    console.log(`      读入 ${n} 条`);
  }
}

// ---------------------------------------------------------------- 2.5 NLM 期刊缩写（PubMed）

console.log("[2.5/6] NLM 期刊缩写表（PubMed 列表页用）…");
{
  const file = path.join(RAW, "J_Medline.txt");
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf8");
    const blocks = text.split(/^-{10,}$/m).map((b) => b.trim()).filter(Boolean);
    let total = 0;
    let matched = 0;
    for (const block of blocks) {
      const field = (key) => {
        const m = block.match(new RegExp("^" + key + ": *(.*)$", "m"));
        return m ? m[1].trim() : "";
      };
      const title = field("JournalTitle");
      if (!title) continue;
      total++;

      const issns = [normalizeIssn(field("ISSN \\(Print\\)")), normalizeIssn(field("ISSN \\(Online\\)"))].filter(Boolean);
      let rec = null;
      for (const issn of issns) {
        const uid = byIssn.get(issn);
        if (uid) { rec = byUid.get(uid); break; }
      }
      if (!rec) {
        const uid = byName.get(normalizeKey(title));
        if (uid) rec = byUid.get(uid);
      }
      if (!rec) continue;
      matched++;

      for (const abbr of [field("MedAbbr"), field("IsoAbbr")]) {
        if (!abbr) continue;
        if (normalizeKey(abbr) === normalizeKey(rec.n)) continue;
        if (!rec.ab.includes(abbr)) rec.ab.push(abbr);
      }
    }
    console.log(`      解析 ${total} 条，命中本地库 ${matched} 条`);
  } else {
    console.warn("  ! 缺少 J_Medline.txt，跳过");
  }
}

// ---------------------------------------------------------------- 3. EI

console.log("[3/6] Ei Compendex 收录目录 …");
{
  const file = path.join(RAW, "EI-readme.md");
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf8");
    const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
    const block = blocks.sort((a, b) => b.length - a.length)[0] || "";
    let n = 0;
    for (const line of block.split("\n")) {
      const name = line.replace(/\t+/g, " ").trim();
      if (!name || name.length < 2) continue;
      const rec = ensureRecord(name);
      if (!rec) continue;
      rec.ei = 1;
      n++;
    }
    console.log(`      读入 ${n} 条`);
  } else console.warn("  ! 缺少 EI-readme.md，跳过");
}

// ---------------------------------------------------------------- 4. CCF

console.log("[4/6] CCF 推荐目录 2026 …");
{
  const csv = readCSV("CCF2026-UTF8.csv");
  if (csv) {
    const { header, rows } = csv;
    const cAbbr = col(header, "刊物名称"), cFull = col(header, "Journal"), cLevel = col(header, "CCF推荐类型");
    let n = 0;
    for (const r of rows) {
      const full = (r[cFull] || "").trim();
      const abbr = (r[cAbbr] || "").trim();
      const name = full || abbr;
      if (!name) continue;
      const rec = ensureRecord(name);
      if (!rec) continue;
      if (abbr && abbr !== name) attachAlias(rec, abbr);
      const m = String(r[cLevel] || "").match(/([ABC])\s*类/);
      if (m) rec.ccf = m[1];
      n++;
    }
    console.log(`      读入 ${n} 条`);
  }
}

// ---------------------------------------------------------------- 5. 预警名单

console.log("[5/6] 国际期刊预警名单 …");
{
  let total = 0;
  for (const year of [2023, 2024, 2025]) {
    const csv = readCSV(`GJQKYJMD${year}.csv`);
    if (!csv) continue;
    const { header, rows } = csv;
    const cName = col(header, "Journal");
    const cReason = header.findIndex((h) => h.includes("预警原因"));
    for (const r of rows) {
      const name = (r[cName] || "").trim();
      if (!name) continue;
      const rec = ensureRecord(name);
      if (!rec) continue;
      const reason = (r[cReason] || "").trim();
      rec.warn = rec.warn ? `${rec.warn};${year}` : String(year);
      if (reason && !rec.warnReason) rec.warnReason = reason;
      total++;
    }
  }
  console.log(`      读入 ${total} 条`);
}

// ---------------------------------------------------------------- 6. 中文核心体系

console.log("[6/6] 中文核心体系（北大核心/CSSCI/CSCD/科技核心/AMI…）…");
const cnRecords = [];
{
  const file = path.join(RAW, "core_plugin_data.json");
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const seen = new Set();
    for (const [name, meta] of Object.entries(data.index || {})) {
      // c = 四库简写（北大核心/CSSCI/AMI/国社科），准确但不全
      // t = 完整标签串（多出 CSCD/科技核心/RCCSE/高质量科技期刊），但部分条目缺四库标签
      // 两者取并集，覆盖率最高
      const raw = [meta.c, meta.t].filter(Boolean).join(",");
      const flags = raw.split(",").map(mapCnTag).filter(Boolean);
      if (!flags.length) continue;
      const uniq = [...new Set(flags)];
      const rec = { n: name.trim(), cn: uniq };
      const ifv = parseFloat(meta.i);
      if (Number.isFinite(ifv) && ifv > 0) rec.f = ifv;
      const key = normalizeKey(rec.n);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      cnRecords.push(rec);
    }
    console.log(`      读入 ${cnRecords.length} 条（源文件 ${data.total} 条）`);
  } else console.warn("  ! 缺少 core_plugin_data.json，跳过");
}

function mapCnTag(raw) {
  const c = String(raw || "").trim();
  if (!c) return "";
  if (c.startsWith("CSSCI")) {
    if (c.includes("扩展")) return "CSSCI扩展";
    if (c.includes("集刊")) return "CSSCI集刊";
    return "CSSCI";
  }
  if (c.startsWith("北大核心")) return "北大核心";
  if (c.startsWith("国家社科基金")) return "国社科";
  if (c.startsWith("CSCD核心")) return "CSCD";
  if (c.startsWith("CSCD扩展")) return "CSCD扩展";
  if (c.startsWith("科技核心")) return "科技核心";
  // AMI顶级 / AMI权威 / AMI核心 / AMI扩展 / AMI入库 / AMI核心集刊 / AMI入库国际刊 …
  if (c.startsWith("AMI")) return c.split(/[（(]/)[0].trim();
  if (c.startsWith("RCCSE")) {
    const m = c.match(/RCCSE\(([^)]+)\)/);
    return m ? `RCCSE${m[1].replace(/^中文/, "").replace(/^高专/, "高专")}` : "RCCSE";
  }
  if (c.startsWith("高质量科技期刊")) {
    const m = c.match(/T(\d)/);
    return m ? `T${m[1]}` : "";
  }
  if (c.startsWith("CACJ")) {
    const m = c.match(/CACJ-(核心|权威|扩展)/);
    return m ? `CACJ${m[1]}` : "CACJ";
  }
  return "";
}

// ---------------------------------------------------------------- 7/8. CSCD + 科技核心
//
// 这两份名单里的刊名写法常和已有数据不同（"中国科学. 数学" vs "中国科学：数学（中国科学A辑：数学）"），
// 所以除了精确匹配，还要用"剥掉括号"的宽松键兜底。宽松键可能一对多（如各种"北京大学学报（xx版）"），
// 一旦出现歧义就标记为 ambiguous 并放弃该键，绝不做模糊猜测。

const cnByName = new Map();
const cnByLoose = new Map();
const cnLooseAmbiguous = new Set();

for (const r of cnRecords) {
  cnByName.set(normalizeKey(r.n), r);
  const lk = normalizeLoose(r.n);
  if (!lk) continue;
  if (cnByLoose.has(lk)) cnLooseAmbiguous.add(lk);
  else cnByLoose.set(lk, r);
}

/** 找中文刊记录；找不到就新建一条 */
function resolveCnRecord(name) {
  const ek = normalizeKey(name);
  const exact = cnByName.get(ek);
  if (exact) return { rec: exact, isNew: false };

  const lk = normalizeLoose(name);
  if (lk && !cnLooseAmbiguous.has(lk)) {
    const loose = cnByLoose.get(lk);
    if (loose) return { rec: loose, isNew: false };
  }

  const rec = { n: String(name).trim(), cn: [] };
  cnRecords.push(rec);
  cnByName.set(ek, rec);
  if (lk && !cnLooseAmbiguous.has(lk)) cnByLoose.set(lk, rec);
  return { rec, isNew: true };
}

/** 英文刊先按名字命中国际库，否则落到中文库 */
function resolveRecord(name, issn) {
  if (issn) {
    const uid = byIssn.get(normalizeIssn(issn));
    if (uid) return { rec: byUid.get(uid), isNew: false, isCn: false };
  }
  const uid = byName.get(normalizeKey(name));
  if (uid) return { rec: byUid.get(uid), isNew: false, isCn: false };
  const { rec, isNew } = resolveCnRecord(name);
  return { rec, isNew, isCn: true };
}

function applySource(label, file, flagOf) {
  console.log(label);
  if (!fs.existsSync(file)) {
    console.warn("  ! 缺少 " + path.basename(file) + "，跳过");
    return;
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let toIntl = 0, toCn = 0, created = 0;

  for (const j of data.journals || []) {
    const flag = flagOf(j);
    if (!flag) continue;
    const { rec, isNew, isCn } = resolveRecord(j.name, j.issn);
    if (isNew) created++;
    if (isCn) toCn++; else toIntl++;
    if (!rec.cn) rec.cn = [];
    if (!rec.cn.includes(flag)) rec.cn.push(flag);
  }
  console.log(`      共 ${(data.journals || []).length} 条：关联国际刊 ${toIntl}、中文刊 ${toCn}、新建 ${created}`);
}

applySource(
  "[7/8] CSCD 中国科学引文数据库 2025-2026 …",
  path.join(RAW, "cscd_2025_2026.json"),
  (j) => (j.level === "扩展库" ? "CSCD扩展" : "CSCD")
);

applySource(
  "[8/8] 中国科技核心期刊目录（2024）…",
  path.join(RAW, "kejihexin_2024.json"),
  () => "科技核心"
);

// ---------------------------------------------------------------- 输出

const intl = [];
for (const rec of byUid.values()) {
  if (!rec.n) continue;
  const o = { n: rec.n };
  if (rec.al.length) o.al = rec.al;
  if (rec.i.length) o.i = rec.i;
  if (rec.w.length) o.w = rec.w;
  if (rec.ws) o.ws = rec.ws;
  if (rec.z) o.z = rec.z;
  if (rec.t) o.t = 1;
  if (rec.c) o.c = rec.c;
  if (rec.s.length) o.s = rec.s;
  if (rec.f != null) o.f = rec.f;
  if (rec.q) o.q = rec.q;
  if (rec.j.length) o.j = rec.j;
  if (rec.ei) o.ei = 1;
  if (rec.ccf) o.ccf = rec.ccf;
  if (rec.warn) o.warn = rec.warn;
  if (rec.ab && rec.ab.length) o.ab = rec.ab;
  if (rec.cn && rec.cn.length) o.cn = rec.cn;
  if (rec.warnReason) o.warnReason = rec.warnReason;
  intl.push(o);
}

const payload = {
  meta: {
    built: new Date().toISOString().slice(0, 10),
    schema: 1,
    counts: { intl: intl.length, cn: cnRecords.length },
    sources: [
      "中科院分区表 2025（升级版）",
      "JCR 2025",
      "CCF 2026",
      "国际期刊预警名单 2023-2025",
      "Ei Compendex 收录目录",
      "中文核心体系（北大核心 2023 / CSSCI 2025-2026 / 科技核心 2025 / AMI 2022 / 国社科 2025 / RCCSE / 高质量科技期刊）",
      "CSCD 中国科学引文数据库来源期刊 2025-2026（官方 PDF，核心库 1120 + 扩展库 384）",
      "NLM J_Medline 期刊缩写表（PubMed）",
      "中国科技核心期刊目录 2024（自然科学卷 2218 + 社会科学卷 414）",
    ],
  },
  intl,
  cn: cnRecords,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
const size = fs.statSync(OUT_FILE).size;

// 冲突统计
const keyCount = new Map();
for (const rec of intl) {
  for (const name of [rec.n, ...(rec.al || [])]) {
    const k = normalizeKey(name);
    if (!k) continue;
    keyCount.set(k, (keyCount.get(k) || 0) + 1);
  }
}
const collisions = [...keyCount.entries()].filter(([, v]) => v > 1);

console.log("\n================ 构建完成 ================");
console.log(`输出      ${OUT_FILE}`);
console.log(`大小      ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`国际期刊  ${intl.length}`);
console.log(`中文期刊  ${cnRecords.length}`);
console.log(`含影响因子 ${intl.filter((r) => r.f != null).length}`);
console.log(`含中科院分区 ${intl.filter((r) => r.z).length}`);
console.log(`含 JCR 分区 ${intl.filter((r) => r.q).length}`);
console.log(`EI 收录   ${intl.filter((r) => r.ei).length}`);
console.log(`CCF 收录  ${intl.filter((r) => r.ccf).length}`);
console.log(`预警期刊  ${intl.filter((r) => r.warn).length}`);
console.log(`同名冲突  ${collisions.length}${collisions.length ? "（前 5：" + collisions.slice(0, 5).map(([k, v]) => `${k}×${v}`).join(", ") + "）" : ""}`);
