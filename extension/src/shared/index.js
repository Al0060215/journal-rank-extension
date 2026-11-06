/**
 * 期刊索引：构建 + 查询。
 * 后台 Service Worker 和命令行测试脚本共用这一份实现，避免两边逻辑漂移。
 */

import { normalizeKey, normalizeLoose } from "./normalize.js";

/** 主名称最短长度 —— 中文刊名可能只有 2 个字，如《法学》 */
export const PRIMARY_MIN = 2;
/** 别名最短长度 —— 防止 CCF 缩写 "AI"、"CC" 之类造成误匹配 */
export const ALIAS_MIN = 4;
/** NLM 期刊缩写最短长度（"BMJ" 是 3 个字母） */
export const ABBR_MIN = 3;

export function buildIndex(data) {
  const byKey = new Map();
  const byLoose = new Map();
  const byIssn = new Map();

  const put = (map, key, entry, min) => {
    if (!key || key.length < min) return;
    if (!map.has(key)) map.set(key, entry);
  };

  for (const rec of data.intl || []) {
    const entry = { data: rec, type: "intl" };
    for (const issn of rec.i || []) {
      if (!byIssn.has(issn)) byIssn.set(issn, entry);
    }
    const names = [rec.n, ...(rec.al || [])];
    names.forEach((name, i) => {
      const min = i === 0 ? PRIMARY_MIN : ALIAS_MIN;
      put(byKey, normalizeKey(name), entry, min);
      put(byLoose, normalizeLoose(name), entry, min);
    });
  }

  for (const rec of data.cn || []) {
    const entry = { data: rec, type: "cn" };
    put(byKey, normalizeKey(rec.n), entry, PRIMARY_MIN);
    put(byLoose, normalizeLoose(rec.n), entry, PRIMARY_MIN);
  }

  // 第二轮：NLM 期刊缩写（PubMed 列表页只给缩写，如 "Nat Commun"）。
  // 放在第二轮是为了让真实刊名优先占位——缩写较短，不能盖掉同名期刊。
  for (const rec of data.intl || []) {
    if (!rec.ab || !rec.ab.length) continue;
    const entry = { data: rec, type: "intl" };
    for (const abbr of rec.ab) {
      put(byKey, normalizeKey(abbr), entry, ABBR_MIN);
      put(byLoose, normalizeLoose(abbr), entry, ABBR_MIN);
    }
  }

  return { meta: data.meta, byKey, byLoose, byIssn };
}

/** 去掉书名号、引号等装饰，压缩空白 */
export function cleanInput(raw) {
  return String(raw || "")
    .replace(/[《》〈〉「」『』“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 按刊名查询。
 * 先精确匹配，再退回「剥掉括号内容」的宽松匹配。
 * @returns {{found:boolean, type?:'intl'|'cn', via?:string, data?:object, query?:string}}
 */
export function lookup(index, rawName) {
  const name = cleanInput(rawName);
  if (!name) return { found: false, query: rawName };

  const key = normalizeKey(name);
  let hit = index.byKey.get(key) || null;
  let via = "exact";

  if (!hit) {
    // 注意：即使查询词本身没有括号，也要用宽松键再查一次 ——
    // 因为"记录那边"的刊名可能带括号后缀，例如
    // 记录「中国科学：数学（中国科学A辑：数学）」的宽松键是「中国科学数学」，
    // 而查询词「中国科学：数学」的宽松键也是「中国科学数学」，正好对上。
    const loose = normalizeLoose(name) || key;
    hit = index.byLoose.get(loose) || null;
    if (hit) via = "loose";
  }

  return hit
    ? { found: true, type: hit.type, via, data: hit.data }
    : { found: false, query: name };
}

/** 按 ISSN 查询 */
export function lookupIssn(index, rawIssn) {
  const issn = String(rawIssn || "").toUpperCase().replace(/[^0-9X]/g, "");
  if (issn.length !== 8) return { found: false };
  const hit = index.byIssn.get(issn);
  return hit
    ? { found: true, type: hit.type, via: "issn", data: hit.data }
    : { found: false };
}
