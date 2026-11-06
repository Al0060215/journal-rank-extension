#!/usr/bin/env node
/**
 * 生成插件图标（16/32/48/128）。
 * 纯手写 PNG 编码，不依赖任何第三方库。
 * 设计：蓝紫渐变圆角方块 + 白色柱状图（表示"等级/排名"）。
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.join(import.meta.dirname, "..", "extension", "icons");

// ------------------------------------------------------------------ PNG

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ------------------------------------------------------------------ 绘制

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 圆角矩形内部判定 */
function insideRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function render(size) {
  const S = size * 4; // 4x 超采样
  const buf = new Float64Array(S * S * 4); // premultiplied? 先存直通，最后再处理

  const pad = S * 0.055;
  const boxX = pad, boxY = pad, boxW = S - pad * 2, boxH = S - pad * 2;
  const radius = S * 0.24;

  // 渐变端点
  const c1 = [37, 99, 235];   // #2563eb
  const c2 = [124, 58, 237];  // #7c3aed

  // 柱状图参数
  const barW = S * 0.115;
  const gap = S * 0.055;
  const totalW = barW * 3 + gap * 2;
  const startX = (S - totalW) / 2;
  const baseY = S * 0.755;
  const heights = [S * 0.20, S * 0.30, S * 0.41];
  const barR = S * 0.028;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;

      if (insideRoundRect(x, y, boxX, boxY, boxW, boxH, radius)) {
        const t = clamp01(((x - boxX) / boxW) * 0.45 + ((y - boxY) / boxH) * 0.55);
        r = lerp(c1[0], c2[0], t);
        g = lerp(c1[1], c2[1], t);
        b = lerp(c1[2], c2[2], t);
        a = 1;

        // 白色柱状图
        for (let k = 0; k < 3; k++) {
          const bx = startX + k * (barW + gap);
          const by = baseY - heights[k];
          if (insideRoundRect(x, y, bx, by, barW, heights[k], barR)) {
            r = 255; g = 255; b = 255; a = 1;
          }
        }
      }
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a * 255;
    }
  }

  // 降采样到目标尺寸（按 alpha 加权，避免边缘发黑）
  const out = Buffer.alloc(size * size * 4);
  const f = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const i = ((y * f + dy) * S + (x * f + dx)) * 4;
          const al = buf[i + 3] / 255;
          sr += buf[i] * al;
          sg += buf[i + 1] * al;
          sb += buf[i + 2] * al;
          sa += al;
        }
      }
      const n = f * f;
      const o = (y * size + x) * 4;
      if (sa > 0) {
        out[o] = Math.round(sr / sa);
        out[o + 1] = Math.round(sg / sa);
        out[o + 2] = Math.round(sb / sa);
      }
      out[o + 3] = Math.round((sa / n) * 255);
    }
  }
  return encodePNG(size, size, out);
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = render(size);
  fs.writeFileSync(path.join(OUT, `icon${size}.png`), png);
  console.log(`icon${size}.png  ${png.length} bytes`);
}
console.log("图标生成完成 ->", OUT);
