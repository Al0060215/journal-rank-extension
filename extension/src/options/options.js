/* 期刊等级助手 —— 设置页 */

const DEFAULTS = {
  enabled: true,
  show: { wos: true, cas: true, jcr: true, imp: true, ei: true, ccf: true, cn: true, warn: true },
  compact: false,
  debug: false,
  sites: {},
};

const GROUPS = [
  { key: "wos", label: "SCI / SSCI 收录" },
  { key: "cas", label: "中科院分区" },
  { key: "jcr", label: "JCR 分区" },
  { key: "imp", label: "影响因子" },
  { key: "ei", label: "EI 收录" },
  { key: "ccf", label: "CCF 等级" },
  { key: "cn", label: "中文核心（北大核心/CSSCI/CSCD…）" },
  { key: "warn", label: "国际期刊预警" },
];

const SITES = [
  { id: "cnki", label: "中国知网", host: "cnki.net" },
  { id: "scholar", label: "Google Scholar", host: "scholar.google.com" },
  { id: "baiduxueshu", label: "百度学术", host: "xueshu.baidu.com" },
  { id: "pubmed", label: "PubMed", host: "pubmed.ncbi.nlm.nih.gov" },
  { id: "wos", label: "Web of Science", host: "webofscience.com" },
  { id: "springer", label: "SpringerLink", host: "link.springer.com" },
  { id: "ieee", label: "IEEE Xplore", host: "ieeexplore.ieee.org" },
  { id: "acm", label: "ACM DL", host: "dl.acm.org" },
  { id: "dblp", label: "DBLP", host: "dblp.org" },
  { id: "wanfang", label: "万方数据", host: "wanfangdata.com.cn" },
  { id: "cqvip", label: "维普", host: "cqvip.com" },
  { id: "publisher", label: "出版商页面", host: "Elsevier/Wiley/Nature…" },
];

const WOS_NAME = { SCIE: "SCIE", SCI: "SCI", SSCI: "SSCI", AHCI: "AHCI", ESCI: "ESCI" };

let cfg = JSON.parse(JSON.stringify(DEFAULTS));
const $ = (id) => document.getElementById(id);

function save() {
  chrome.storage.sync.set(cfg);
}

function fmtIf(v) {
  if (v == null) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n >= 100) return n.toFixed(1).replace(/\.0$/, "");
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2).replace(/0$/, "");
}

function renderChips() {
  const box = $("chips");
  box.innerHTML = "";
  for (const g of GROUPS) {
    const chip = document.createElement("div");
    chip.className = "chip" + (cfg.show[g.key] ? " on" : "");
    chip.textContent = g.label;
    chip.addEventListener("click", () => {
      cfg.show[g.key] = !cfg.show[g.key];
      chip.classList.toggle("on", cfg.show[g.key]);
      save();
    });
    box.appendChild(chip);
  }
}

function renderSites() {
  const box = $("sites");
  box.innerHTML = "";
  for (const s of SITES) {
    const lab = document.createElement("label");
    lab.className = "site";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = cfg.sites[s.id] !== false;
    cb.addEventListener("change", () => {
      cfg.sites[s.id] = cb.checked;
      save();
    });
    const name = document.createElement("span");
    name.textContent = s.label;
    const host = document.createElement("span");
    host.className = "host";
    host.textContent = s.host;
    lab.append(cb, name, host);
    box.appendChild(lab);
  }
}

function renderResult(res) {
  const box = $("result");
  box.innerHTML = "";
  if (!res || !res.found) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "未匹配到。可能是刊名不完整，或这个刊不在当前数据集中。";
    box.appendChild(d);
    return;
  }
  const rec = res.data;
  const name = document.createElement("div");
  name.className = "rname";
  name.textContent = rec.n + (rec.i && rec.i.length ? "　（ISSN " + rec.i.join(", ") + "）" : "");
  box.appendChild(name);

  const lines = [];
  if (rec.w && rec.w.length) lines.push("Web of Science 收录：" + rec.w.map((w) => WOS_NAME[w] || w).join(" / "));
  if (rec.z) {
    lines.push("中科院分区：" + (rec.c ? rec.c + " · " : "") + rec.z + "区" + (rec.t ? "　Top 期刊" : ""));
    if (Array.isArray(rec.s)) {
      for (const sub of rec.s) {
        const [nm, z, rk] = sub.split("|");
        lines.push("　　· " + nm + "　" + (z ? z + "区" : "") + (rk ? "　[" + rk + "]" : ""));
      }
    }
  }
  if (rec.f != null) lines.push((res.type === "cn" ? "复合影响因子：" : "影响因子（2025）：") + fmtIf(rec.f));
  if (rec.q) lines.push("JCR 分区：" + rec.q);
  if (Array.isArray(rec.j)) {
    for (const cat of rec.j) {
      const [nm, q, rk] = cat.split("|");
      lines.push("　　· " + nm + "　" + q + (rk ? "　[" + rk + "]" : ""));
    }
  }
  if (rec.ei) lines.push("Ei Compendex 收录");
  if (rec.ccf) lines.push("CCF 推荐等级：" + rec.ccf + " 类");
  if (rec.cn && rec.cn.length) lines.push("中文核心：" + rec.cn.join(" / "));
  if (rec.warn) lines.push("⚠ 国际期刊预警：" + rec.warn + (rec.warnReason ? "　" + rec.warnReason : ""));

  for (const t of lines) {
    const d = document.createElement("div");
    d.className = "line2";
    d.textContent = t;
    box.appendChild(d);
  }

  const ok = document.createElement("div");
  ok.className = "ok";
  ok.textContent = "✓ 匹配成功（" + (res.via === "loose" ? "宽松匹配" : "精确匹配") + "）";
  box.appendChild(ok);
}

function doLookup() {
  const q = $("q").value.trim();
  if (!q) return;
  $("result").innerHTML = '<div class="empty">查询中…</div>';
  chrome.runtime.sendMessage({ type: "jr:lookup", name: q }, (res) => {
    if (chrome.runtime.lastError) {
      $("result").innerHTML = '<div class="empty">查询失败：' + chrome.runtime.lastError.message + "</div>";
      return;
    }
    renderResult(res);
  });
}

function loadStats() {
  chrome.runtime.sendMessage({ type: "jr:stats" }, (res) => {
    const box = $("stats");
    if (chrome.runtime.lastError || !res || !res.ok) {
      box.textContent = "数据未就绪：" + (res && res.error ? res.error : "");
      return;
    }
    const c = res.meta.counts;
    box.innerHTML = "";
    const add = (num, lab) => {
      const d = document.createElement("div");
      d.className = "stat";
      d.innerHTML = '<div class="num">' + num + '</div><div class="lab">' + lab + "</div>";
      box.appendChild(d);
    };
    add(c.intl.toLocaleString(), "国际期刊");
    add(c.cn.toLocaleString(), "中文期刊");
    add(res.index.issns.toLocaleString(), "ISSN 索引");
    add(res.meta.built, "数据版本");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(DEFAULTS, (res) => {
    cfg = Object.assign({}, DEFAULTS, res || {});
    cfg.show = Object.assign({}, DEFAULTS.show, (res || {}).show || {});
    cfg.sites = Object.assign({}, (res || {}).sites || {});
    $("enabled").checked = !!cfg.enabled;
    $("compact").checked = !!cfg.compact;
    $("debug").checked = !!cfg.debug;
    renderChips();
    renderSites();
  });

  for (const [id, key] of [["enabled", "enabled"], ["compact", "compact"], ["debug", "debug"]]) {
    $(id).addEventListener("change", (e) => {
      cfg[key] = e.target.checked;
      save();
    });
  }

  $("go").addEventListener("click", doLookup);
  $("q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLookup();
  });
  $("version").textContent = "v" + chrome.runtime.getManifest().version;

  loadStats();
});
