/**
 * 期刊名归一化 —— 构建脚本与 Service Worker 共用同一份实现，
 * 保证"建库时写进去的 key"和"查询时算出来的 key"永远一致。
 */

/** 把各种花样的期刊名压成可用于精确比对的 key */
export function normalizeKey(input) {
  if (!input) return "";
  let s = String(input);

  // 全角 -> 半角、连字 -> 普通字母、兼容字符归一
  s = s.normalize("NFKC");
  s = s.toLowerCase();

  // & 与 and 等价
  s = s.replace(/&/g, " and ");
  // 去掉英文冠词 the（整词），避免 "The Lancet" / "Lancet" 对不上
  s = s.replace(/\bthe\b/g, " ");

  // 去掉所有非字母数字字符：空格、标点、括号、全角符号、中间点等
  // \p{L} 包含中日韩汉字，\p{N} 包含全角数字
  s = s.replace(/[^\p{L}\p{N}]+/gu, "");

  return s;
}

/**
 * 宽松 key：先剥掉括号内容再归一化。
 * "经济论文（經濟論文）（台湾）" -> "经济论文"
 * "北京大学学报(哲学社会科学版)" -> "北京大学学报"
 * 只作为精确匹配失败后的兜底，避免过度匹配。
 */
export function normalizeLoose(input) {
  if (!input) return "";
  let s = String(input).normalize("NFKC");
  s = s.replace(/[（(][^）)]*[）)]/g, " ");
  return normalizeKey(s);
}

/** ISSN 归一：只保留数字和 X，必须 8 位 */
export function normalizeIssn(input) {
  const s = String(input || "").toUpperCase().replace(/[^0-9X]/g, "");
  return s.length === 8 ? s : "";
}

/** 把 "2053-1583/2053-1583" 这类字段拆成 ISSN 数组 */
export function splitIssns(input) {
  return String(input || "")
    .split(/[\/,;、\s]+/)
    .map(normalizeIssn)
    .filter(Boolean);
}

/** 中文期刊名是否含汉字 */
export function hasCJK(input) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(input || ""));
}
