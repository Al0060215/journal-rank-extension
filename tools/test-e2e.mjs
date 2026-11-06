#!/usr/bin/env node
/**
 * 端到端测试：真正启动 Chrome，加载插件，访问模拟页面，检查徽章注入。
 *
 * 为什么用 Chrome for Testing：
 *   正式版 Google Chrome 从 137 起禁止了 --load-extension，只能装商店扩展；
 *   Chrome for Testing（Chromium 构建）仍然允许加载未打包扩展。
 *
 * 测试手法：
 *   1. 复制 extension/ 到临时目录，把 content_scripts.matches 改成 http://*​/*（仅测试用）
 *   2. --host-resolver-rules 把 kns.cnki.net / scholar.google.com / link.springer.com
 *      都指向 127.0.0.1，这样内容脚本判断域名的分支仍然走真实逻辑
 *   3. 本地静态服务器提供 test/demo.html
 *   4. 每个站点用独立的 CDP target，读取 DOM 断言徽章内容
 *
 * 用法：node tools/test-e2e.mjs [--headful] [--keep]
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { findChrome } from "./lib/chrome.mjs";

const HERE = import.meta.dirname;
const ROOT = path.join(HERE, "..");
const EXT_SRC = path.join(ROOT, "extension");
const TEST_DIR = path.join(ROOT, "test");
const TMP = "/tmp/journal-rank-e2e";
const EXT = path.join(TMP, "ext");
const PROFILE = path.join(TMP, "profile");
const PORT = 8765;
const CDP_PORT = 9333;

const HEADFUL = process.argv.includes("--headful");
const KEEP = process.argv.includes("--keep");

const chromeInfo = findChrome(ROOT);
if (!chromeInfo) {
  console.error("✗ 没找到任何 Chrome。先运行：node tools/install-chrome.mjs");
  process.exit(2);
}
const CHROME = chromeInfo.path;

const cases = [
  {
    host: "kns.cnki.net",
    site: "知网",
    keepOpen: true,
    minGroups: 3,
    expectBadge: ["CSSCI", "北大核心", "AMI", "复合IF"],
    expectNames: ["中国社会科学", "管理世界", "物理学报"],
  },
  {
    host: "scholar.google.com",
    site: "Google Scholar",
    minGroups: 2,
    expectBadge: ["SCI", "IF"],
    expectNames: ["Nature", "Journal of the American Chemical Society"],
  },
  {
    host: "kns-cnki-net-s.vpn.sjtu.edu.cn",
    site: "知网（WebVPN）",
    minGroups: 3,
    expectBadge: ["CSSCI", "北大核心", "AMI"],
    expectNames: ["中国社会科学", "管理世界", "物理学报"],
  },
  {
    host: "pubmed.ncbi.nlm.nih.gov",
    site: "PubMed",
    minGroups: 2,
    expectBadge: ["SCI", "IF"],
    expectNames: ["Nat Commun", "J Biol Chem"],
  },
  {
    host: "link.springer.com",
    site: "SpringerLink",
    minGroups: 2,
    expectBadge: ["SCI", "IF"],
    expectNames: ["Nature Communications", "Advanced Materials"],
  },
];

// ---------------------------------------------------------------- 准备

const rmrf = (p) => fs.rmSync(p, { recursive: true, force: true });

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const REAL = process.argv.includes("--real");

console.log("· 准备临时扩展目录 …");
rmrf(TMP);
copyDir(EXT_SRC, EXT);
const manifestPath = path.join(EXT, "manifest.json");
if (REAL) {
  console.log("· 使用【真实 manifest】（不修改 matches），只在 VPN 域名上验证");
} else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.content_scripts[0].matches = ["http://*/*"];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(TEST_DIR, urlPath === "/" ? "demo.html" : urlPath);
  if (!file.startsWith(TEST_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

// ---------------------------------------------------------------- CDP 客户端

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", () => reject(new Error("WebSocket 连接失败")));
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error("CDP 超时: " + method)); }
      }, 20000);
    });
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = async (url) => (await fetch(url)).json();

// ---------------------------------------------------------------- 主流程

let chrome = null;
let exitCode = 1;

const watchdog = setTimeout(() => {
  console.error("\n✗ 测试整体超时（180s），强制退出");
  try { chrome?.kill("SIGKILL"); } catch { /* ignore */ }
  process.exit(3);
}, 180000);
watchdog.unref?.();

try {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  console.log(`· 静态服务器 :${PORT}`);

  if (chromeInfo.isCfT) {
    console.log(`· 使用 Chrome for Testing（${chromeInfo.from}）`);
  } else {
    console.warn("⚠ 没找到 Chrome for Testing，退回系统 Chrome —— 正式版禁止 --load-extension，测试会失败");
    console.warn("  先运行：node tools/install-chrome.mjs");
  }

  const args = [
    HEADFUL ? "" : "--headless=new",
    "--no-sandbox",
    "--no-proxy-server",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-crash-reporter",
    "--disable-breakpad",
    `--crash-dumps-dir=${path.join(TMP, "crash")}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate",
    `--user-data-dir=${PROFILE}`,
    `--load-extension=${EXT}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "--host-resolver-rules=MAP kns.cnki.net 127.0.0.1, MAP scholar.google.com 127.0.0.1, MAP link.springer.com 127.0.0.1, MAP kns-cnki-net-s.vpn.sjtu.edu.cn 127.0.0.1, MAP pubmed.ncbi.nlm.nih.gov 127.0.0.1",
    "about:blank",
  ].filter(Boolean);

  console.log("· 启动浏览器 …");
  chrome = spawn(CHROME, args, { stdio: ["ignore", "pipe", "pipe"] });
  const NOISE = /crashpad|GetVSync|dbus|Fontconfig|gpu_init|Metal|IMKClient|CVDisplayLink|SharedImageManager|allocator multiple|disk_cache|GpuProcessHost|DevTools listening/i;
  chrome.stderr.on("data", (d) => {
    for (const line of d.toString().split("\n")) {
      if (!line.trim() || NOISE.test(line)) continue;
      if (/ERROR/.test(line)) process.stderr.write("  [chrome] " + line.slice(0, 180) + "\n");
    }
  });

  let version = null;
  for (let i = 0; i < 80; i++) {
    try { version = await getJSON(`http://127.0.0.1:${CDP_PORT}/json/version`); break; } catch { await sleep(250); }
  }
  if (!version) throw new Error("CDP 未就绪");
  console.log(`· ${version.Browser}`);

  const browser = new CDP(version.webSocketDebuggerUrl);
  await browser.ready;

  const results = [];
  const activeCases = REAL ? cases.filter((c) => c.host.includes("vpn")) : cases;

  for (const c of activeCases) {
    const url = `http://${c.host}:${PORT}/demo.html`;
    console.log(`\n── ${c.site}  ${url}`);

    let sessionId = null;
    let targetId = null;
    let snapshot = null;

    try {
      ({ targetId } = await browser.send("Target.createTarget", { url }));
      ({ sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true }));
      await browser.send("Runtime.enable", {}, sessionId);

      for (let i = 0; i < 50; i++) {
        await sleep(400);
        try {
          const r = await browser.send("Runtime.evaluate", {
            expression: `(() => {
              const groups = [...document.querySelectorAll('.jr-badges')];
              return {
                href: location.href.slice(0, 60),
                injected: document.documentElement.dataset.jrInjected || null,
                count: groups.length,
                items: groups.map(g => ({
                  badges: [...g.querySelectorAll('.jr-badge')].map(b => b.textContent),
                  ctx: (g.parentElement ? g.parentElement.textContent : '').replace(/\\s+/g, ' ').slice(0, 70)
                }))
              };
            })()`,
            returnByValue: true,
          }, sessionId);
          snapshot = r.result?.value || null;
          if (snapshot && snapshot.count >= c.minGroups) break;
        } catch { /* 页面还在加载 */ }
      }
    } catch (err) {
      console.log("   ✗ 打开页面失败：" + err.message);
    } finally {
      if (targetId && !c.keepOpen) { try { await browser.send("Target.closeTarget", { targetId }); } catch { /* ignore */ } }
    }

    if (!snapshot) { console.log("   ✗ 没拿到 DOM 快照"); results.push({ c, snapshot: null, ok: false }); continue; }

    console.log(`   页面：${snapshot.href}`);
    console.log(`   注入标记：${snapshot.injected ?? "无（内容脚本未注入）"}`);
    console.log(`   徽章组：${snapshot.count}（期望 ≥ ${c.minGroups}）`);
    for (const it of snapshot.items) console.log(`   · [${it.badges.join(" ")}]  ${it.ctx}`);

    const ok = snapshot.count >= c.minGroups;
    results.push({ c, snapshot, ok });
  }

  // 扩展是否真的被加载：找我们的 service worker target
  let extId = null;
  try {
    const { targetInfos } = await browser.send("Target.getTargets");
    const sw = targetInfos.find((t) => t.url.includes("/src/background/service-worker.js"));
    if (sw) extId = new URL(sw.url).hostname;
  } catch { /* ignore */ }

  // ---- 扩展页面冒烟测试（设置页 / 弹窗）----
  const pageChecks = [];
  if (extId) {
    console.log(`\n── 扩展页面（id=${extId}）`);
    const openPage = async (url) => {
      const { targetId } = await browser.send("Target.createTarget", { url });
      const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
      await browser.send("Runtime.enable", {}, sessionId);
      return { targetId, sessionId };
    };
    const evalIn = async (sessionId, expression) => {
      const r = await browser.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
      return r.result?.value;
    };

    // 设置页：标签数量 + 数据统计
    try {
      const { targetId, sessionId } = await openPage(`chrome-extension://${extId}/src/options/options.html`);
      let stats = null;
      for (let i = 0; i < 25; i++) {
        await sleep(300);
        stats = await evalIn(sessionId, `({
          chips: document.querySelectorAll('#chips .chip').length,
          sites: document.querySelectorAll('#sites input').length,
          stats: document.querySelectorAll('#stats .stat').length,
          firstStat: document.querySelector('#stats .stat .num')?.textContent || ''
        })`);
        if (stats && stats.stats >= 3) break;
      }
      const ok = stats && stats.chips >= 8 && stats.sites >= 10 && stats.stats >= 3;
      console.log(`   ${ok ? "✓" : "✗"} 设置页：选项 ${stats?.chips} 个 / 站点 ${stats?.sites} 个 / 数据卡片 ${stats?.stats} 个（首项 ${stats?.firstStat}）`);
      pageChecks.push({ name: "设置页", ok });
      await browser.send("Target.closeTarget", { targetId });
    } catch (e) {
      console.log("   ✗ 设置页打开失败：" + e.message);
      pageChecks.push({ name: "设置页", ok: false });
    }

    // 弹窗：渲染 + 快速查询走通后台
    try {
      const { targetId, sessionId } = await openPage(`chrome-extension://${extId}/src/popup/popup.html`);
      let r = null;
      for (let i = 0; i < 25; i++) {
        await sleep(300);
        r = await evalIn(sessionId, `({
          chips: document.querySelectorAll('#chips .chip').length,
          stats: document.getElementById('stats')?.textContent || ''
        })`);
        if (r && r.stats && !r.stats.includes("加载中")) break;
      }
      // 触发一次快速查询
      await evalIn(sessionId, `(() => {
        const q = document.getElementById('q');
        q.value = 'Nature';
        document.getElementById('go').click();
        return true;
      })()`);
      let found = "";
      for (let i = 0; i < 25; i++) {
        await sleep(300);
        found = (await evalIn(sessionId, `document.querySelector('#result .rname')?.textContent || ''`)) || "";
        if (found) break;
      }
      const ok = r && r.chips >= 8 && found.includes("NATURE");
      console.log(`   ${ok ? "✓" : "✗"} 弹窗：标签 ${r?.chips} 个 / 统计「${r?.stats}」/ 查询 Nature → 「${found}」`);
      // 导出 CSV：向还开着的知网页签发 preview 请求
      const csvRes = await evalIn(sessionId, `new Promise((resolve) => {
        chrome.tabs.query({}, (tabs) => {
          let pending = tabs.length;
          let found = null;
          if (!pending) return resolve({ err: "没有标签页" });
          tabs.forEach((t) => {
            chrome.tabs.sendMessage(t.id, { type: "jr:export", preview: true }, (r) => {
              if (!chrome.runtime.lastError && r && r.count > 0) found = r;
              if (--pending === 0) resolve(found || { err: "没有内容脚本响应" });
            });
          });
        });
      })`);
      const csvOk =
        csvRes && csvRes.count >= 2 && typeof csvRes.csv === "string" &&
        csvRes.csv.includes("题名") && csvRes.csv.includes("期刊") && csvRes.csv.includes("中科院分区");
      console.log(
        `   ${csvOk ? "✓" : "✗"} 导出 CSV：${csvRes?.count ?? 0} 行` +
          (csvOk ? `，首行「${csvRes.csv.split("\r\n")[1].slice(0, 60)}…」` : `　${csvRes?.err || "内容不符"}`)
      );
      pageChecks.push({ name: "导出CSV", ok: !!csvOk });

      pageChecks.push({ name: "弹窗", ok });
      await browser.send("Target.closeTarget", { targetId });
    } catch (e) {
      console.log("   ✗ 弹窗打开失败：" + e.message);
      pageChecks.push({ name: "弹窗", ok: false });
    }
  } else {
    console.log("\n⚠ 未找到扩展的 service worker，跳过扩展页面测试");
  }

  console.log("\n================ 测试结果 ================");
  let pass = true;
  for (const { c, snapshot, ok } of results) {
    const badges = (snapshot?.items || []).flatMap((i) => i.badges);
    const ctx = (snapshot?.items || []).map((i) => i.ctx).join(" | ");
    const missingBadge = c.expectBadge.filter((b) => !badges.some((x) => x.includes(b)));
    const missingName = c.expectNames.filter((n) => !ctx.includes(n));
    const status = ok && missingBadge.length === 0 && missingName.length === 0 ? "PASS" : "FAIL";
    if (status === "FAIL") pass = false;
    console.log(
      `${status}  ${c.site.padEnd(16)} 组=${snapshot?.count ?? 0}  ` +
      `缺徽章=${missingBadge.join(",") || "无"}  缺期刊=${missingName.join(",") || "无"}`
    );
  }
  for (const p of pageChecks) {
    if (!p.ok) pass = false;
    console.log(`${p.ok ? "PASS" : "FAIL"}  ${p.name}`);
  }
  console.log(`${extId ? "PASS" : "WARN"}  扩展后台  ${extId ? "chrome-extension://" + extId : "未发现 service worker"}`);

  exitCode = pass ? 0 : 1;
  browser.close();
} catch (err) {
  console.error("\n✗ 测试出错：" + err.message);
  exitCode = 2;
} finally {
  clearTimeout(watchdog);
  try { server.close(); } catch { /* ignore */ }
  try { chrome?.kill("SIGKILL"); } catch { /* ignore */ }
  if (!KEEP) setTimeout(() => { try { rmrf(TMP); } catch { /* ignore */ } }, 500);
  process.exitCode = exitCode;
}
