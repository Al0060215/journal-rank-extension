/**
 * 期刊等级助手 —— 内容脚本
 * 在受支持的学术站点上找到"期刊名"节点，向后台查询后注入徽章。
 * 同时支持通过右键菜单在任意页面手动查询选中文本。
 */
(() => {
  "use strict";

  if (window.__JR_LOADED__) {
    return; // 已经注入过（右键菜单可能二次注入）
  }
  window.__JR_LOADED__ = true;

  // ------------------------------------------------------------------ 配置

  const DEFAULTS = {
    enabled: true,
    show: { wos: true, cas: true, jcr: true, imp: true, ei: true, ccf: true, cn: true, warn: true },
    compact: false,
    debug: false,
    sites: {},
  };

  let cfg = JSON.parse(JSON.stringify(DEFAULTS));

  // ------------------------------------------------------------------ 工具

  const RAW_HOST = location.hostname;

  /**
   * 还原被 WebVPN 改写过的域名。
   * 国内高校普遍用深信服 SSL VPN，它把 "kns.cnki.net" 改写成
   * "kns-cnki-net-s.vpn.sjtu.edu.cn"（点换横线 + 加 -s.vpn.<学校> 后缀）。
   * 这里逆向还原，让站点识别逻辑在 VPN 下也能正常工作。
   */
  function unVpnHost(host) {
    const h = String(host || "");
    const m = h.match(/^(.+?)-s\.vpn\./i);
    if (m) return m[1].replace(/-/g, ".");
    return h;
  }

  const HOST = unVpnHost(RAW_HOST);

  function make(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function fmtIf(v) {
    if (v == null) return "";
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    if (n >= 100) return n.toFixed(1).replace(/\.0$/, "");
    if (n >= 10) return n.toFixed(1);
    return n.toFixed(2).replace(/0$/, "");
  }

  function log(...args) {
    if (cfg.debug) console.log("[期刊等级]", ...args);
  }

  // ------------------------------------------------------------------ 站点适配器
  // 每个适配器返回 [{ anchor: HTMLElement, name: string, place: 'after'|'before'|'append' }]
  // 选择器来自对多个开源同类插件的交叉验证。

  const SITES = [
    {
      id: "cnki",
      name: "中国知网",
      match: () => /(^|\.)cnki\.net$/.test(HOST),
      collect() {
        const out = [];
        // 检索结果列表：来源列
        document.querySelectorAll("td.source").forEach((td) => {
          const a = td.querySelector("a");
          const name = (a ? a.textContent : td.textContent).trim();
          if (!name) return;
          out.push({ anchor: a || td, name, place: "after" });
        });
        // 文献详情页顶部期刊链接
        document.querySelectorAll(".top-tip span a, .wx-tit a").forEach((a) => {
          const name = a.textContent.trim();
          if (name) out.push({ anchor: a, name, place: "after" });
        });
        // 期刊导航/期刊详情页标题
        const navTitle = document.querySelector(".journal-title, .qk-title h1");
        if (navTitle) {
          const name = navTitle.textContent.replace(/[《》]/g, "").trim();
          if (name) out.push({ anchor: navTitle, name, place: "after" });
        }
        return out;
      },
    },
    {
      id: "scholar",
      name: "Google Scholar",
      match: () => /^scholar\.google\.[a-z.]+$/.test(HOST),
      collect() {
        const out = [];
        // 搜索结果
        document.querySelectorAll("#gs_res_ccl_mid .gs_ri").forEach((ri) => {
          const gsA = ri.querySelector("div.gs_a");
          if (!gsA) return;
          const name = parseScholarVenue(gsA.textContent);
          if (name) out.push({ anchor: gsA, name, place: "append" });
        });
        // 学者主页的论文列表
        document.querySelectorAll("tr.gsc_a_tr").forEach((tr) => {
          const grays = tr.querySelectorAll("div.gs_gray");
          const titleLink = tr.querySelector("td.gsc_a_t > a");
          if (!titleLink || grays.length < 2) return;
          const name = parseScholarVenue(grays[1].textContent);
          if (name) out.push({ anchor: titleLink, name, place: "after" });
        });
        return out;
      },
    },
    {
      id: "baiduxueshu",
      name: "百度学术",
      match: () => /^(xueshu\.baidu\.com)$/.test(HOST),
      collect() {
        const out = [];
        document.querySelectorAll("div.result").forEach((row) => {
          const title = row.querySelector("h3.t a, h3 a");
          const info = row.querySelector("div.sc_info");
          if (!title || !info) return;
          // 期刊名通常在 sc_info 第 2 个 span 的 a[title] 里，形如《管理世界》
          let name = "";
          const links = info.querySelectorAll("span a[title], a[title]");
          for (const a of links) {
            const t = (a.getAttribute("title") || "").replace(/[《》]/g, "").trim();
            if (t) { name = t; break; }
          }
          if (!name) {
            const spans = info.querySelectorAll("span");
            if (spans[1]) name = spans[1].textContent.replace(/[《》]/g, "").trim();
          }
          if (name) out.push({ anchor: title, name, place: "after" });
        });
        return out;
      },
    },
    {
      id: "pubmed",
      name: "PubMed",
      match: () => /(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/.test(HOST),
      collect() {
        const out = [];
        // 摘要页：Highwire meta 里是完整刊名
        const meta = document.querySelector('meta[name="citation_journal_title"]');
        if (meta && meta.content) {
          const anchor =
            document.querySelector(".article-citation") ||
            document.querySelector("#full-view-heading .heading-title") ||
            document.querySelector("h1.heading-title");
          if (anchor) out.push({ anchor, name: meta.content.trim(), place: "after" });
        }
        // 检索结果列表：只有 NLM 缩写，如 "Nat Commun."
        document.querySelectorAll("article.full-docsum").forEach((art) => {
          const cit = art.querySelector("span.full-journal-citation");
          const title = art.querySelector("a.docsum-title");
          if (!cit || !title) return;
          const abbr = cit.textContent.split(".")[0].trim();
          if (abbr) out.push({ anchor: title, name: abbr, place: "after", abbr: true });
        });
        return out;
      },
    },
    {
      id: "wos",
      name: "Web of Science",
      match: () => /(^|\.)(webofscience|webofknowledge)\.com$/.test(HOST),
      collect() {
        const out = [];
        // 新版 WoS 的 JCR 悬浮层
        document.querySelectorAll("app-jcr-overlay").forEach((ov) => {
          let node = ov.querySelector("span[lang='en'], button[lang='en']");
          if (!node) return;
          const name = node.textContent.trim();
          if (name) out.push({ anchor: node, name, place: "after" });
        });
        // 检索结果里的来源
        document.querySelectorAll(".summary-source, .summary-source-title, span.summary-source").forEach((node) => {
          const name = node.textContent.trim();
          if (name && name.length < 200) out.push({ anchor: node, name, place: "after" });
        });
        // 旧版
        document.querySelectorAll("div.search-results-content").forEach((row) => {
          const v = row.querySelector("div div:nth-child(4) value, value");
          if (!v) return;
          const name = v.textContent.trim();
          if (name) out.push({ anchor: v, name, place: "after" });
        });
        return out;
      },
    },
    {
      id: "springer",
      name: "SpringerLink",
      match: () => /(^|\.)link\.springer\.com$/.test(HOST),
      collect() {
        const out = [];
        document.querySelectorAll("#results-list > li > p.meta > span.enumeration > a").forEach((a) => {
          const raw = (a.getAttribute("title") || a.textContent || "").trim();
          const name = raw.split(/\s+[-–]\s+/)[0].trim();
          if (name) out.push({ anchor: a, name, place: "after" });
        });
        // 文章详情页
        document.querySelectorAll("a[data-track-action='journal'], .app-article-masthead a, #journal-title").forEach((a) => {
          const name = a.textContent.trim();
          if (name) out.push({ anchor: a, name, place: "after" });
        });
        return out;
      },
    },
    {
      id: "ieee",
      name: "IEEE Xplore",
      match: () => /(^|\.)ieeexplore\.ieee\.org$/.test(HOST),
      collect() {
        const out = [];
        document.querySelectorAll(".description > a, .description > div:first-child > a").forEach((a) => {
          let name = a.textContent.trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
          if (name) out.push({ anchor: a, name, place: "after" });
        });
        const pub = document.querySelector(".publication-title, .document-title + .description a");
        if (pub) {
          const name = pub.textContent.trim();
          if (name) out.push({ anchor: pub, name, place: "after" });
        }
        return out;
      },
    },
    {
      id: "acm",
      name: "ACM DL",
      match: () => /(^|\.)dl\.acm\.org$/.test(HOST),
      collect() {
        const out = [];
        document.querySelectorAll(".issue-item__detail > a, .issue-item__citation a").forEach((a) => {
          let name = a.textContent.trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
          if (name) out.push({ anchor: a, name, place: "after" });
        });
        return out;
      },
    },
    {
      id: "ei",
      name: "Engineering Village",
      match: () => /(^|\.)(engineeringvillage|ei\.org)\.com?$/.test(HOST) || HOST.includes("engineeringvillage"),
      collect() {
        const out = [];
        document.querySelectorAll(".source-info").forEach((node) => {
          const name = node.textContent.trim();
          if (name) out.push({ anchor: node, name, place: "after" });
        });
        return out;
      },
    },
    {
      id: "dblp",
      name: "DBLP",
      match: () => /(^|\.)dblp\.(org|uni-trier\.de)$/.test(HOST),
      collect() {
        const out = [];
        document.querySelectorAll("li.entry > .venue, li.entry > .publ, .data > .venue, .data > .publ").forEach((node) => {
          const name = node.textContent.replace(/[.]$/, "").trim();
          if (name) out.push({ anchor: node, name, place: "after" });
        });
        return out;
      },
    },
    {
      id: "wanfang",
      name: "万方数据",
      match: () => /(^|\.)wanfangdata\.com\.cn$/.test(HOST),
      collect() {
        const out = [];
        // 新版检索结果
        document.querySelectorAll(".normal-list .item, .result-list .item, li.wf-result-item").forEach((row) => {
          const src = row.querySelector(".source, .journal, .periodical-name, [class*='source']");
          if (!src) return;
          const name = src.textContent.replace(/[《》]/g, "").trim();
          if (name) out.push({ anchor: src, name, place: "after" });
        });
        return out;
      },
    },
    {
      id: "cqvip",
      name: "维普",
      match: () => /(^|\.)(cqvip\.com)$/.test(HOST),
      collect() {
        const out = [];
        document.querySelectorAll(".search-results .item, .result-item, .list-item").forEach((row) => {
          const src = row.querySelector(".source, .journal-name, [class*='source'], [class*='journal']");
          if (!src) return;
          const name = src.textContent.replace(/[《》]/g, "").trim();
          if (name && name.length < 120) out.push({ anchor: src, name, place: "after" });
        });
        return out;
      },
    },
    {
      id: "publisher",
      name: "出版商页面",
      match: () =>
        /(^|\.)(sciencedirect|onlinelibrary\.wiley|tandfonline|journals\.sagepub|nature|mdpi|pubs\.acs|cell|academic\.oup|jstor)\.(com|org)$/.test(HOST),
      collect() {
        const out = [];
        const sels = [
          "#journalTitle a",
          "a.journal-title",
          "a[href*='/journal/']",
          ".publication-title a",
          ".article-header .journal-title",
          "a[data-track-action='journal']",
          ".core-container .journal-title",
        ];
        for (const sel of sels) {
          document.querySelectorAll(sel).forEach((a) => {
            const name = a.textContent.trim();
            if (name && name.length < 150) out.push({ anchor: a, name, place: "after" });
          });
        }
        return out;
      },
    },
  ];

  const SITE = SITES.find((s) => {
    try { return s.match(); } catch { return false; }
  }) || null;

  /**
   * 从 Google Scholar 的 gs_a 文本里抽刊名。
   * 形如："A Smith, B Jones - Nature, 2020 - nature.com"
   *      "A Smith - Nature communications, 2020, 11(1):1-10 - peerj.com"
   */
  function parseScholarVenue(text) {
    if (!text) return "";
    const t = text.replace(/\u2026/g, "…");
    // 取第一个 " - " 到后面紧跟的年份之间的内容
    const m = t.match(/[-–—]\s*(.+?)[,，]\s*(\d{4})/);
    let name = m ? m[1] : "";
    if (!name) {
      const parts = t.split(/\s+[-–—]\s+/);
      if (parts.length >= 2) name = parts[1].replace(/[,，]\s*\d{4}.*$/, "");
    }
    name = name.replace(/^\s*|[,，.。]\s*$/g, "").trim();
    // 含省略号说明 Google 把刊名截断了，匹配不可靠
    if (!name || name.length > 120 || /…/.test(name)) return "";
    return name;
  }

  /** 尽量从锚点所在的结果行里找出"论文标题"，用于导出 CSV */
  function findTitle(el) {
    const scope =
      (el.closest && el.closest("tr, article, li, .gs_ri, .result, .issue-item, .result-item, .description, .search-results-content, .full-docsum")) ||
      (el.parentElement || el);
    if (!scope || !scope.querySelector) return "";
    const cand = scope.querySelector(
      ".docsum-title, .gs_rt a, td.name a, .issue-item__title a, h3 a, h2 a, .title a, a.title"
    );
    if (cand) {
      const t = cand.textContent.replace(/\s+/g, " ").trim();
      if (t) return t;
    }
    // 兜底：知网有些视图的 td.name 里没有 <a>，直接取文本
    const plain = scope.querySelector("td.name, .docsum-title, .gs_rt");
    if (plain) return plain.textContent.replace(/\s+/g, " ").trim();
    return "";
  }

  // ------------------------------------------------------------------ 徽章渲染

  const WOS_LABEL = { SCIE: "SCI", SCI: "SCI", SSCI: "SSCI", AHCI: "AHCI", ESCI: "ESCI" };
  const WOS_TIP = { SCIE: "SCIE", SCI: "SCI", SSCI: "SSCI", AHCI: "AHCI", ESCI: "ESCI" };

  const CN_ORDER = [
    "北大核心", "CSSCI", "CSSCI扩展", "CSSCI集刊",
    "CSCD", "CSCD扩展", "科技核心",
    "AMI顶级", "AMI权威", "AMI核心", "AMI扩展", "AMI入库",
    "AMI核心集刊", "AMI入库集刊", "AMI核心国际刊", "AMI入库国际刊", "AMI职刊核心",
    "国社科", "RCCSE权威A+", "RCCSE核心A", "RCCSE核心A-", "RCCSEB+",
    "T1", "T2", "T3", "T4", "CACJ核心", "CACJ权威", "CACJ扩展",
  ];

  function cnRank(tag) {
    const i = CN_ORDER.indexOf(tag);
    return i === -1 ? 999 : i;
  }

  function badgeClass(tag) {
    if (tag.startsWith("CSSCI")) return "jr-b-cssci";
    if (tag.startsWith("北大核心")) return "jr-b-pku";
    if (tag.startsWith("CSCD")) return "jr-b-cscd";
    if (tag.startsWith("科技核心")) return "jr-b-zhongke";
    if (tag.startsWith("AMI")) return "jr-b-ami";
    if (tag.startsWith("国社科")) return "jr-b-nssf";
    if (tag.startsWith("RCCSE")) return "jr-b-rccse";
    if (/^T[1-4]$/.test(tag)) return "jr-b-t";
    if (tag.startsWith("CACJ")) return "jr-b-cacj";
    return "jr-b-cn";
  }

  function buildBadges(rec) {
    const out = [];
    const isCn = rec.__type === "cn";
    const show = cfg.show;

    if (show.wos && Array.isArray(rec.w)) {
      for (const w of rec.w) {
        out.push({ text: WOS_LABEL[w] || w, cls: "jr-b-wos jr-b-wos-" + w.toLowerCase(), tip: "Web of Science: " + (WOS_TIP[w] || w) });
      }
    }
    if (show.cas && rec.z) {
      out.push({ text: (cfg.compact ? "" : "中科院") + rec.z + "区", cls: "jr-b-cas jr-b-cas-" + rec.z, tip: "中科院分区（大类）: " + rec.z + "区" });
      if (rec.t) out.push({ text: "Top", cls: "jr-b-top", tip: "中科院 Top 期刊" });
    }
    if (show.jcr && rec.q) {
      out.push({ text: rec.q, cls: "jr-b-jcr jr-b-jcr-" + rec.q.toLowerCase(), tip: "JCR 分区: " + rec.q });
    }

    // 影响因子：英文刊紧跟 JCR，中文刊放到核心标签之后（读起来更顺）
    const ifBadge = show.imp && rec.f != null
      ? {
          text: (isCn ? "复合IF " : "IF ") + fmtIf(rec.f),
          cls: "jr-b-if",
          tip: isCn ? "复合影响因子" : "JCR 影响因子 2025",
        }
      : null;
    if (ifBadge && !isCn) out.push(ifBadge);

    if (show.ei && rec.ei) out.push({ text: "EI", cls: "jr-b-ei", tip: "Ei Compendex 收录" });
    if (show.ccf && rec.ccf) out.push({ text: "CCF " + rec.ccf, cls: "jr-b-ccf", tip: "CCF 推荐等级 " + rec.ccf + " 类" });

    if (show.cn && Array.isArray(rec.cn)) {
      for (const tag of [...rec.cn].sort((a, b) => cnRank(a) - cnRank(b))) {
        out.push({ text: tag, cls: badgeClass(tag), tip: "中文期刊评价: " + tag });
      }
    }

    if (ifBadge && isCn) out.push(ifBadge);

    if (show.warn && rec.warn) {
      out.push({ text: "⚠ 预警", cls: "jr-b-warn", tip: "国际期刊预警名单 " + rec.warn + (rec.warnReason ? "：" + rec.warnReason : "") });
    }
    return out;
  }

  function tooltipLines(rec) {
    const lines = [];
    lines.push({ bold: true, text: rec.n });
    if (rec.w && rec.w.length) lines.push({ text: "收录类型：" + rec.w.map((w) => WOS_TIP[w] || w).join(" / ") });
    if (rec.z) {
      const major = rec.c ? rec.c + " " : "";
      lines.push({ text: "中科院分区：" + major + rec.z + "区" + (rec.t ? "（Top）" : "") });
      if (Array.isArray(rec.s)) {
        for (const sub of rec.s.slice(0, 3)) {
          const [nm, z, rk] = sub.split("|");
          lines.push({ text: "   · " + nm + "  " + (z ? z + "区" : "") + (rk ? "  [" + rk + "]" : "") });
        }
      }
    }
    if (rec.f != null || rec.q) {
      const parts = [];
      if (rec.f != null) parts.push((rec.__type === "cn" ? "复合影响因子 " : "IF ") + fmtIf(rec.f));
      if (rec.q) parts.push("JCR " + rec.q);
      lines.push({ text: parts.join("　") });
      if (Array.isArray(rec.j)) {
        for (const cat of rec.j.slice(0, 3)) {
          const [nm, q, rk] = cat.split("|");
          lines.push({ text: "   · " + nm + "  " + q + (rk ? "  [" + rk + "]" : "") });
        }
      }
    }
    if (rec.ei) lines.push({ text: "Ei Compendex 收录" });
    if (rec.ccf) lines.push({ text: "CCF 推荐等级：" + rec.ccf + " 类" });
    if (Array.isArray(rec.cn) && rec.cn.length) {
      lines.push({ text: "中文核心：" + [...rec.cn].sort((a, b) => cnRank(a) - cnRank(b)).join(" / ") });
    }
    if (rec.warn) lines.push({ text: "⚠ 预警：" + rec.warn + (rec.warnReason ? " " + rec.warnReason : ""), warn: true });
    if (rec.i && rec.i.length) lines.push({ text: "ISSN：" + rec.i.join(" / ") });
    return lines;
  }

  // ------------------------------------------------------------------ 悬浮提示

  let tipEl = null;
  let tipTimer = null;

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = make("div", "jr-tip");
    tipEl.style.display = "none";
    document.documentElement.appendChild(tipEl);
    return tipEl;
  }

  function showTip(anchorEl, rec) {
    const tip = ensureTip();
    tip.innerHTML = "";
    for (const line of tooltipLines(rec)) {
      const div = make("div", "jr-tip-line" + (line.bold ? " jr-tip-title" : ""));
      div.textContent = line.text;
      if (line.warn) div.classList.add("jr-tip-warn");
      tip.appendChild(div);
    }
    tip.style.display = "block";
    const r = anchorEl.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = r.left + window.scrollX;
    let top = r.bottom + window.scrollY + 6;
    if (left + tw > window.scrollX + document.documentElement.clientWidth - 8) {
      left = window.scrollX + document.documentElement.clientWidth - tw - 8;
    }
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    if (r.bottom + th + 20 > document.documentElement.clientHeight) {
      top = r.top + window.scrollY - th - 6;
    }
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function hideTip() {
    if (tipEl) tipEl.style.display = "none";
  }

  // ------------------------------------------------------------------ 挂载

  let mounted = new WeakSet();

  /** 已标注的论文，用于导出 CSV：[{title, journal, rec}] */
  let exported = [];

  function mount(item, result) {
    const { anchor } = item;
    if (!anchor || !anchor.isConnected || mounted.has(anchor)) return;
    const rec = result.data;
    if (!rec) return;
    rec.__type = result.type;

    const specs = buildBadges(rec);
    if (!specs.length) return;

    const wrap = make("span", "jr-badges" + (cfg.compact ? " jr-compact" : ""));
    for (const spec of specs) {
      const b = make("span", "jr-badge " + spec.cls, spec.text);
      b.title = "";
      wrap.appendChild(b);
    }
    wrap.addEventListener("mouseenter", () => {
      clearTimeout(tipTimer);
      showTip(wrap, rec);
    });
    wrap.addEventListener("mouseleave", () => {
      tipTimer = setTimeout(hideTip, 120);
    });
    wrap.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTip(wrap, rec);
    });

    try {
      if (item.place === "append") anchor.appendChild(wrap);
      else if (item.place === "before") anchor.before(wrap);
      else anchor.after(wrap);
    } catch {
      return;
    }
    mounted.add(anchor);
    exported.push({
      title: item.title || findTitle(anchor),
      journal: rec.n || item.name,
      rec,
    });
  }

  // 记录已处理过的元素，避免重复消费
  let seen = new WeakSet();

  function siteEnabled() {
    if (!SITE) return false;
    const map = cfg.sites || {};
    return map[SITE.id] !== false;
  }

  async function scan() {
    if (!SITE || !cfg.enabled || !siteEnabled()) return;
    let items;
    try {
      items = SITE.collect();
    } catch (err) {
      log("采集失败", err);
      return;
    }
    const fresh = [];
    for (const it of items) {
      if (!it.anchor || !it.name) continue;
      if (seen.has(it.anchor)) continue;
      seen.add(it.anchor);
      fresh.push(it);
    }
    if (!fresh.length) return;
    log("发现", fresh.length, "条", fresh.slice(0, 3).map((f) => f.name));

    let results;
    try {
      results = await sendMessage({ type: "jr:lookupMany", names: fresh.map((f) => f.name) });
    } catch (err) {
      // 后台没起来，撤销标记以便下次重试
      fresh.forEach((f) => seen.delete(f.anchor));
      log("查询失败", err);
      return;
    }
    if (!Array.isArray(results)) return;
    fresh.forEach((it, i) => {
      const r = results[i];
      if (r && r.found) mount(it, r);
    });
  }

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // ------------------------------------------------------------------ 手动查询浮窗

  let lastMouse = { x: 40, y: 40 };

  function showManualCard(text, result, coords) {
    const old = document.getElementById("jr-manual-card");
    if (old) old.remove();
    const card = make("div", "jr-manual");
    card.id = "jr-manual-card";

    const head = make("div", "jr-manual-head");
    head.textContent = "「" + text + "」";
    const close = make("span", "jr-manual-close", "×");
    close.addEventListener("click", () => card.remove());
    head.appendChild(close);
    card.appendChild(head);

    if (!result || !result.found) {
      const empty = make("div", "jr-manual-empty", "未收录：本地库中没有这个期刊（可检查是否名称不完整）");
      card.appendChild(empty);
    } else {
      const rec = result.data;
      rec.__type = result.type;
      const badges = make("div", "jr-manual-badges");
      for (const spec of buildBadges(rec)) {
        const b = make("span", "jr-badge " + spec.cls, spec.text);
        badges.appendChild(b);
      }
      card.appendChild(badges);
      const body = make("div", "jr-manual-body");
      for (const line of tooltipLines(rec)) {
        const div = make("div", "jr-tip-line" + (line.bold ? " jr-tip-title" : ""));
        div.textContent = line.text;
        if (line.warn) div.classList.add("jr-tip-warn");
        body.appendChild(div);
      }
      card.appendChild(body);
    }
    document.documentElement.appendChild(card);

    const x = coords ? coords.x : lastMouse.x;
    const y = coords ? coords.y : lastMouse.y;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    card.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
    card.style.top = Math.max(8, Math.min(y + 12, window.innerHeight - h - 8)) + "px";

    setTimeout(() => {
      const off = (e) => {
        if (!card.contains(e.target)) {
          card.remove();
          document.removeEventListener("mousedown", off, true);
        }
      };
      document.addEventListener("mousedown", off, true);
    }, 0);
  }

  document.addEventListener("mousemove", (e) => {
    lastMouse = { x: e.clientX, y: e.clientY };
  }, { passive: true });

  // ------------------------------------------------------------------ 导出 CSV

  function csvCell(v) {
    const t = String(v == null ? "" : v);
    return '"' + t.replace(/"/g, '""') + '"';
  }

  function buildCSV() {
    const header = ["题名", "期刊", "收录类型", "中科院大类", "中科院分区", "Top", "JCR分区", "影响因子", "EI", "CCF", "中文核心", "预警"];
    const lines = [header.map(csvCell).join(",")];
    for (const row of exported) {
      const r = row.rec || {};
      lines.push(
        [
          row.title,
          row.journal,
          (r.w || []).join(" / "),
          r.c || "",
          r.z ? r.z + "区" : "",
          r.t ? "是" : "",
          r.q || "",
          r.f != null ? fmtIf(r.f) : "",
          r.ei ? "是" : "",
          r.ccf || "",
          (r.cn || []).join(" / "),
          r.warn || "",
        ]
          .map(csvCell)
          .join(",")
      );
    }
    return "\uFEFF" + lines.join("\r\n"); // BOM 让 Excel 正确识别 UTF-8
  }

  function downloadCSV() {
    const blob = new Blob([buildCSV()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const a = document.createElement("a");
    a.href = url;
    a.download =
      `期刊等级_${location.hostname}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ------------------------------------------------------------------ 消息入口

  function applySettings(next) {
    cfg = Object.assign({}, DEFAULTS, next || {});
    cfg.show = Object.assign({}, DEFAULTS.show, (next || {}).show || {});
    cfg.sites = Object.assign({}, (next || {}).sites || {});
  }

  /** 清掉已注入的徽章并重新扫描（用于设置变更后立即生效） */
  function reset() {
    hideTip();
    document.querySelectorAll(".jr-badges").forEach((el) => el.remove());
    seen = new WeakSet();
    mounted = new WeakSet();
    exported = [];
    if (cfg.enabled && siteEnabled()) scan();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "jr:diag") {
      const out = {
        ok: true,
        host: HOST,
        site: SITE ? SITE.id : null,
        siteName: SITE ? SITE.name : null,
        enabled: cfg.enabled,
        siteEnabled: SITE ? siteEnabled() : false,
        badges: document.querySelectorAll(".jr-badges").length,
        exportCount: exported.length,
        counts: {},
        samples: [],
      };
      const SELECTORS = [
        "td.source", "#gs_res_ccl_mid .gs_ri", "tr.gsc_a_tr", "article.full-docsum",
        "#results-list > li", "app-jcr-overlay", ".description > a", ".issue-item__detail > a",
        ".source-info", "div.result",
      ];
      for (const sel of SELECTORS) {
        try { out.counts[sel] = document.querySelectorAll(sel).length; } catch { /* 忽略非法选择器 */ }
      }
      if (SITE) {
        try {
          out.samples = SITE.collect().slice(0, 3).map((i) => i.name).filter(Boolean);
        } catch (e) {
          out.collectError = String(e);
        }
      }
      sendResponse(out);
      return false;
    }
    if (msg && msg.type === "jr:export") {
      const count = exported.length;
      if (msg.preview) {
        // 测试用：只返回 CSV 内容，不触发下载
        sendResponse({ ok: true, count, csv: count > 0 ? buildCSV() : "" });
      } else {
        if (count > 0) downloadCSV();
        sendResponse({ ok: true, count });
      }
      return false;
    }
    if (msg && msg.type === "jr:manual") {
      sendResponse({ ok: true });
      showManualCard(msg.text, msg.result);
      return false;
    }
    if (msg && msg.type === "jr:rescan") {
      reset();
      sendResponse({ ok: true });
      return false;
    }
    if (msg && msg.type === "jr:settings") {
      applySettings(msg.settings);
      reset();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  // 设置页/弹出面板改动后立即生效，不用刷新页面
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (!changes.enabled && !changes.show && !changes.compact && !changes.sites && !changes.debug) return;
      chrome.storage.sync.get(DEFAULTS, (res) => {
        applySettings(res);
        reset();
      });
    });
  } catch { /* 忽略 */ }

  // ------------------------------------------------------------------ 启动

  function startObserver() {
    let timer = null;
    const kick = () => {
      clearTimeout(timer);
      timer = setTimeout(scan, 250);
    };
    const mo = new MutationObserver(kick);
    mo.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("scroll", () => {
      clearTimeout(timer);
      timer = setTimeout(scan, 400);
    }, { passive: true });
    // 兜底：有些站点用 iframe/延迟渲染，定时补扫
    setInterval(scan, 3000);
  }

  function init() {
    // 在 <html> 上留个标记：在页面控制台执行
    //   document.documentElement.dataset.jrInjected
    // 就能一眼看出内容脚本到底有没有注入（返回 "cnki" 说明注入成功）。
    try {
      document.documentElement.dataset.jrInjected = SITE ? SITE.id : "none";
    } catch { /* 忽略 */ }

    // 这一行会出现在页面 Console 里，方便确认脚本到底有没有注入
    console.info(`[期刊等级] 内容脚本已注入 host=${HOST} site=${SITE ? SITE.id : "未识别"}`);
    try {
      chrome.storage.sync.get(DEFAULTS, (res) => {
        applySettings(res);
        if (cfg.enabled && SITE && siteEnabled()) {
          scan();
          startObserver();
        }
        log("已启用，站点：", SITE ? SITE.name : "未识别（仅右键查询可用）");
      });
    } catch {
      if (SITE) {
        scan();
        startObserver();
      }
    }
  }

  init();
})();
