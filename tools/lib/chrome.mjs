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

/**
 * 依次尝试：环境变量 CHROME_BIN → 项目 .cache/cft → /tmp/cft → 系统 Chrome
 * @param {string} root 项目根目录
 */
export function findChrome(root) {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) {
    return { path: process.env.CHROME_BIN, isCfT: true, from: "CHROME_BIN" };
  }
  for (const dir of [path.join(root, ".cache", "cft"), "/tmp/cft"]) {
    const p = binaryIn(dir);
    if (p) return { path: p, isCfT: true, from: dir };
  }
  const system = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((p) => fs.existsSync(p));
  return system ? { path: system, isCfT: false, from: "系统 Chrome" } : null;
}
