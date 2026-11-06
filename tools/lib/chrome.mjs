/**
 * Chrome for Testing 的路径解析与查找。
 *
 * 为什么要用 Chrome for Testing：正式版 Google Chrome 从 137 起禁止了
 * `--load-extension`，无法加载未打包扩展做端到端测试；Chromium 构建（CfT）仍然支持。
 */

import fs from "node:fs";
import path from "node:path";

/** 当前平台对应的 CfT 压缩包代号 */
export function flavor() {
  if (process.platform === "darwin") return process.arch === "arm64" ? "mac-arm64" : "mac-x64";
  if (process.platform === "linux") return "linux64";
  if (process.platform === "win32") return "win64";
  throw new Error("不支持的平台：" + process.platform);
}

/** 解压后可执行文件的相对路径 */
export function binaryRelPath() {
  const f = flavor();
  if (f === "mac-arm64" || f === "mac-x64") {
    return path.join(`chrome-${f}`, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing");
  }
  if (f === "win64") return path.join("chrome-win64", "chrome.exe");
  return path.join("chrome-linux64", "chrome");
}

/** 在指定目录下找可执行文件 */
export function binaryIn(dir) {
  const p = path.join(dir, binaryRelPath());
  return fs.existsSync(p) ? p : null;
}

/** 从路径判断是不是 Chrome for Testing / Chromium 构建（只有它们支持 --load-extension） */
export function isCfTBinary(p) {
  return /Chrome for Testing|chrome-(linux64|win64|mac-arm64|mac-x64)/.test(String(p || ""));
}

/**
 * 查找可用的浏览器。
 *
 * 顺序有讲究：GitHub Actions 的 ubuntu 镜像默认设了 CHROME_BIN=/usr/bin/google-chrome，
 * 那是正式版 Chrome，禁止 --load-extension。所以只有确认是 CfT 构建时才采信 CHROME_BIN，
 * 否则优先用项目本地安装的那份。
 *
 * @param {string} root 项目根目录
 */
export function findChrome(root) {
  const envBin = process.env.CHROME_BIN;
  if (envBin && fs.existsSync(envBin) && isCfTBinary(envBin)) {
    return { path: envBin, isCfT: true, from: "CHROME_BIN" };
  }

  for (const dir of [path.join(root, ".cache", "cft"), "/tmp/cft"]) {
    const p = binaryIn(dir);
    if (p) return { path: p, isCfT: true, from: path.relative(root, p) || dir };
  }

  const system = [envBin, 
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean).find((p) => fs.existsSync(p));

  return system ? { path: system, isCfT: false, from: "系统 Chrome" } : null;
}
