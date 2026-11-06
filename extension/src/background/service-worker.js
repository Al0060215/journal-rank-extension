/**
 * 期刊等级助手 —— 后台 Service Worker
 * 职责：
 *  1. 懒加载本地期刊库（约 5.8MB JSON），建立名称 / ISSN 索引
 *  2. 响应内容脚本的批量查询
 *  3. 提供右键菜单的手动查询（可注入到任意页面）
 *
 * 索引构建与查询逻辑在 src/shared/index.js，与命令行测试脚本共用。
 */

import { buildIndex, lookup, lookupIssn, cleanInput } from "../shared/index.js";

const DATA_PATH = "src/data/journals.json";

let store = null;
let loadingPromise = null;
const cache = new Map();

// ------------------------------------------------------------------ 加载

function loadStore() {
  if (store) return Promise.resolve(store);
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const url = chrome.runtime.getURL(DATA_PATH);
    const res = await fetch(url);
    if (!res.ok) throw new Error("期刊库加载失败 HTTP " + res.status);
    const data = await res.json();
    store = buildIndex(data);
    console.log(
      `[期刊等级] 已加载 ${store.meta?.counts?.intl ?? "?"} 条国际期刊、` +
        `${store.meta?.counts?.cn ?? "?"} 条中文期刊`
    );
    return store;
  })().catch((err) => {
    loadingPromise = null; // 允许下次重试
    throw err;
  });

  return loadingPromise;
}

// 启动时预热，用户第一次查询就不用等
loadStore().catch((e) => console.warn("[期刊等级] 预热失败", e));

// ------------------------------------------------------------------ 查询

/** 带缓存的单条查询 */
function query(rawName) {
  const key = cleanInput(rawName);
  if (!key) return { found: false, query: rawName };
  if (cache.has(key)) return cache.get(key);
  const out = lookup(store, key);
  cache.set(key, out);
  return out;
}

async function handleLookupMany(names) {
  await loadStore();
  return (names || []).map((n) => query(n));
}

// ------------------------------------------------------------------ 消息

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;

  if (msg.type === "jr:lookupMany") {
    handleLookupMany(msg.names)
      .then(sendResponse)
      .catch((err) => {
        console.error("[期刊等级] 查询失败", err);
        sendResponse(null);
      });
    return true; // 异步响应
  }

  if (msg.type === "jr:lookup") {
    handleLookupMany([msg.name])
      .then((r) => sendResponse(r[0]))
      .catch(() => sendResponse({ found: false }));
    return true;
  }

  if (msg.type === "jr:issn") {
    loadStore()
      .then(() => sendResponse(lookupIssn(store, msg.issn)))
      .catch(() => sendResponse({ found: false }));
    return true;
  }

  if (msg.type === "jr:stats") {
    loadStore()
      .then((s) =>
        sendResponse({
          ok: true,
          meta: s.meta,
          index: { names: s.byKey.size, issns: s.byIssn.size },
        })
      )
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});

// ------------------------------------------------------------------ 右键菜单

const MENU_ID = "jr-lookup-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "查询「%s」的期刊等级",
      contexts: ["selection"],
    });
  });
  loadStore().catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || tab.id == null) return;
  const text = (info.selectionText || "").trim();
  if (!text || text.length > 120) return;

  try {
    await loadStore();
    const result = query(text);

    // 把渲染器注入当前页面（已注入过会自动跳过）
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["src/content/content.css"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/content/content.js"] });
    await chrome.tabs.sendMessage(tab.id, { type: "jr:manual", text, result });
  } catch (err) {
    console.warn("[期刊等级] 无法在当前页面显示结果：", err);
  }
});
