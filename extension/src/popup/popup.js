/* 期刊等级助手 —— 弹出面板 */

const DEFAULTS = {
  enabled: true,
  show: { wos: true, cas: true, jcr: true, imp: true, ei: true, ccf: true, cn: true, warn: true },
  compact: false,
  debug: false,
};

const GROUPS = [
  { key: "wos", label: "SCI/SSCI" },
  { key: "cas", label: "中科院分区" },
  { key: "jcr", label: "JCR 分区" },
  { key: "imp", label: "影响因子" },
  { key: "ei", label: "EI" },
  { key: "ccf", label: "CCF" },
  { key: "cn", label: "中文核心" },
  { key: "warn", label: "预警" },
];

const WOS_NAME = { SCIE: "SCIE", SCI: "SCI", SSCI: "SSCI", AHCI: "AHCI", ESCI: "ESCI" };

let cfg = JSON.parse(JSON.stringify(DEFAULTS));

let activeTabId = null;
const $ = (id) => document.getElementById(id);

function save() {
  chrome.storage.sync.set(cfg);
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

function fmtIf(v) {
  if (v == null) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n >= 100) return n.toFixed(1).replace(/\.0$/, "");
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2).replace(/0$/, "");
}

function renderResult(res) {
  const box = $("result");
  box.innerHTML = "";
  if (!res || !res.found) {
    const d = document.createElement("div");
    d.className = "empty";
    d.textContent = "本地库未收录这个刊名，试试完整全称。";
    box.appendChild(d);
    return;
  }
  const rec = res.data;
  const name = document.createElement("div");
  name.className = "rname";
  name.textContent = rec.n;
  box.appendChild(name);

  const lines = [];
  if (rec.w && rec.w.length) lines.push("收录：" + rec.w.map((w) => WOS_NAME[w] || w).join(" / "));
  if (rec.z) lines.push("中科院：" + (rec.c ? rec.c + " " : "") + rec.z + "区" + (rec.t ? "（Top）" : ""));
  if (rec.q) lines.push("JCR：" + rec.q);
  if (rec.f != null) lines.push((res.type === "cn" ? "复合影响因子：" : "影响因子：") + fmtIf(rec.f));
  if (rec.ei) lines.push("EI 收录");
  if (rec.ccf) lines.push("CCF：" + rec.ccf + " 类");
  if (rec.cn && rec.cn.length) lines.push("中文核心：" + rec.cn.join(" / "));
  if (rec.warn) lines.push("⚠ 预警：" + rec.warn);
  if (rec.i && rec.i.length) lines.push("ISSN：" + rec.i.join(" / "));

  for (const t of lines) {
    const d = document.createElement("div");
    d.className = "line";
    d.textContent = t;
    box.appendChild(d);
  }
}

async function doLookup() {
  const q = $("q").value.trim();
  if (!q) return;
  const box = $("result");
  box.innerHTML = '<div class="empty">查询中…</div>';
  chrome.runtime.sendMessage({ type: "jr:lookup", name: q }, (res) => {
    if (chrome.runtime.lastError) {
      box.innerHTML = '<div class="empty">查询失败：' + chrome.runtime.lastError.message + "</div>";
      return;
    }
    renderResult(res);
  });
}

function loadStats() {
  chrome.runtime.sendMessage({ type: "jr:stats" }, (res) => {
    if (chrome.runtime.lastError || !res || !res.ok) {
      $("stats").textContent = "数据未就绪";
      return;
    }
    const c = res.meta.counts;
    $("stats").textContent =
      `内置 ${c.intl.toLocaleString()} 国际刊 · ${c.cn.toLocaleString()} 中文刊`;
  });
}

// ---------------------------------------------------------------- 当前页面自检

function setStatus(level, main, sub) {
  const el = $("status");
  el.className = "status status-" + level;
  el.innerHTML = "";
  const m = document.createElement("span");
  m.className = "st-main";
  m.textContent = main;
  el.appendChild(m);
  if (sub) {
    const s = document.createElement("span");
    s.className = "st-sub";
    s.textContent = sub;
    el.appendChild(s);
  }
}

function renderDiag(res, manual) {
  if (!res.site) {
    setStatus("warn", "这个网站不在支持列表里", `${res.host} —— 可以选中期刊名后右键查询`);
    return;
  }
  if (!res.enabled) {
    setStatus("warn", "扩展总开关已关闭", "打开上方的开关即可");
    return;
  }
  if (!res.siteEnabled) {
    setStatus("warn", `${res.siteName} 已被单独关闭`, "到「完整设置 → 生效网站」里重新打开");
    return;
  }

  const cand = Object.entries(res.counts || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k} ×${v}`)
    .slice(0, 2)
    .join("，");
  const prefix = manual ? "（手动注入）" : "";
  const btn = $("exportBtn");
  if (btn) {
    if (res.badges > 0) {
      btn.hidden = false;
      btn.disabled = false;
      btn.textContent = `导出本页 ${res.badges} 条（CSV）`;
    } else {
      btn.hidden = true;
    }
  }

  if (res.badges > 0) {
    setStatus(
      "ok",
      `已生效：${res.siteName}${prefix}`,
      `本页已标注 ${res.badges} 条` + (res.samples.length ? "，例如：" + res.samples.slice(0, 2).join(" / ") : "")
    );
  } else if (res.samples && res.samples.length) {
    setStatus("warn", `识别到期刊名，但没有匹配上${prefix}`, "读到的刊名：" + res.samples.slice(0, 3).join(" / "));
  } else if (cand) {
    setStatus("warn", `${res.siteName} 已启用，但没提取到期刊名${prefix}`, "页面候选元素：" + cand);
  } else {
    setStatus("warn", `${res.siteName} 已启用，本页没找到结果列表${prefix}`, "等页面加载完再点一次，或刷新重试");
  }
}

/** 粗略判断这个网址是否属于我们支持的站点，避免往无关页面乱注入 */
const SUPPORTED_HINT = /(^|\.)(cnki\.net|cnki\.com\.cn|wanfangdata\.com\.cn|cqvip\.com|webofscience\.com|webofknowledge\.com|springer\.com|ieeexplore\.ieee\.org|dl\.acm\.org|dblp\.org|dblp\.uni-trier\.de|sciencedirect\.com|wiley\.com|tandfonline\.com|sagepub\.com|nature\.com|mdpi\.com|acs\.org|cell\.com|oup\.com|jstor\.org|pubmed\.ncbi\.nlm\.nih\.gov)$/i;

function looksSupported(url) {
  try {
    const host = new URL(url).hostname;
    return (
      host.includes(".vpn.") ||
      host.startsWith("scholar.google.") ||
      host.endsWith("baidu.com") ||
      SUPPORTED_HINT.test(host)
    );
  } catch {
    return false;
  }
}

/** 用 activeTab 权限强行把内容脚本注入当前页（不依赖 manifest 匹配） */
function forceInject(tabId, cb) {
  chrome.scripting.insertCSS({ target: { tabId }, files: ["src/content/content.css"] }, () => {
    chrome.scripting.executeScript({ target: { tabId }, files: ["src/content/content.js"] }, () => {
      cb(chrome.runtime.lastError || null);
    });
  });
}

function checkStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) {
      setStatus("warn", "无法获取当前标签页");
      return;
    }
    activeTabId = tab.id;
    const pageUrl = tab.url || tab.pendingUrl || "";
    let shortUrl = pageUrl;
    try {
      const u = new URL(pageUrl);
      shortUrl = u.hostname + (u.pathname.length > 1 ? u.pathname.slice(0, 24) + "…" : "");
    } catch { /* 保持原样 */ }

    chrome.tabs.sendMessage(tab.id, { type: "jr:diag" }, (res) => {
      if (!chrome.runtime.lastError && res) {
        renderDiag(res, false);
        return;
      }

      // 没响应 —— 先判断是否属于支持的站点，再决定要不要强制注入
      if (!looksSupported(pageUrl)) {
        setStatus("warn", "当前页面不在支持范围", `${shortUrl} —— 可以选中期刊名后右键查询`);
        return;
      }

      // 尝试用 activeTab 强制注入，并如实报告结果
      forceInject(tab.id, (err) => {
        if (err) {
          setStatus("err", "无法注入本页", `原因：${err.message}　网址：${shortUrl}`);
          return;
        }
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { type: "jr:diag" }, (res2) => {
            if (chrome.runtime.lastError || !res2) {
              setStatus("err", "已注入但无响应", `网址：${shortUrl}`);
            } else {
              renderDiag(res2, true);
            }
          });
        }, 700);
      });
    });
  });
}


document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(DEFAULTS, (res) => {
    cfg = Object.assign({}, DEFAULTS, res || {});
    cfg.show = Object.assign({}, DEFAULTS.show, (res || {}).show || {});
    $("enabled").checked = !!cfg.enabled;
    $("compact").checked = !!cfg.compact;
    renderChips();
  });

  $("enabled").addEventListener("change", (e) => {
    cfg.enabled = e.target.checked;
    save();
  });
  $("compact").addEventListener("change", (e) => {
    cfg.compact = e.target.checked;
    save();
  });
  $("exportBtn").addEventListener("click", () => {
    if (activeTabId == null) return;
    const btn = $("exportBtn");
    chrome.tabs.sendMessage(activeTabId, { type: "jr:export" }, (r) => {
      if (chrome.runtime.lastError || !r || !r.ok) {
        btn.textContent = "导出失败，请刷新页面重试";
      } else {
        btn.textContent = `已导出 ${r.count} 条 ✓`;
      }
      setTimeout(() => checkStatus(), 1800);
    });
  });
  $("go").addEventListener("click", doLookup);
  $("q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLookup();
  });
  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  loadStats();
  checkStatus();
  $("q").focus();
});
