#!/usr/bin/env node
// Генератор иконок без внешних зависимостей (только встроенный zlib).
// Рисует простой двухцветный кружковый знак — placeholder, который уже НЕ
// является дефолтным логотипом Expo, но перед реальной публикацией в Google
// Play рекомендуется заменить на настоящую иллюстрацию/лого.
//
// Перед запуском поменяй ACCENT/SECONDARY/BG под палитру конкретного
// приложения (см. src/theme/colors.ts) — так у каждого приложения будет
// собственный, а не переиспользованный знак.
//
// Запуск: node tools/generate-icons.js  (или npm run icons)

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ACCENT = { r: 0x2f, g: 0x5d, b: 0xff };
const SECONDARY = { r: 0x1a, g: 0x1a, b: 0x1a };
const BACKGROUND = { r: 0xff, g: 0xff, b: 0xff };

const ASSETS_DIR = path.join(__dirname, "..", "assets");

// ---- Минимальный PNG-энкодер (RGBA, 8 бит, без интерлейса) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([signature, chunk("IHDR", ihdrData), chunk("IDAT", idatData), chunk("IEND", Buffer.alloc(0))]);
}

// ---- Рисование знака ----

function drawMark(size, { transparentBg = false, singleColorWhite = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = size * 0.22;
  const innerCx = cx - size * 0.12;
  const innerCy = cy - size * 0.12;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dOuter = Math.hypot(x - cx, y - cy);
      const dInner = Math.hypot(x - innerCx, y - innerCy);

      let r, g, b, a;
      if (dInner <= innerR) {
        [r, g, b, a] = singleColorWhite
          ? [255, 255, 255, 255]
          : [SECONDARY.r, SECONDARY.g, SECONDARY.b, 255];
      } else if (dOuter <= outerR) {
        [r, g, b, a] = singleColorWhite
          ? [255, 255, 255, 255]
          : [ACCENT.r, ACCENT.g, ACCENT.b, 255];
      } else if (transparentBg || singleColorWhite) {
        [r, g, b, a] = [0, 0, 0, 0];
      } else {
        [r, g, b, a] = [BACKGROUND.r, BACKGROUND.g, BACKGROUND.b, 255];
      }
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
}

function solidFill(size, color) {
  const buf = Buffer.alloc(size * size * 4);
  for (let p = 0; p < size * size; p++) {
    buf[p * 4] = color.r;
    buf[p * 4 + 1] = color.g;
    buf[p * 4 + 2] = color.b;
    buf[p * 4 + 3] = 255;
  }
  return buf;
}

function write(name, size, rgba) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  const png = encodePNG(size, size, rgba);
  fs.writeFileSync(path.join(ASSETS_DIR, name), png);
  console.log(`  ${name} (${size}x${size})`);
}

console.log("Генерирую иконки в assets/...");
write("icon.png", 1024, drawMark(1024));
write("adaptive-icon-foreground.png", 1024, drawMark(1024, { transparentBg: true }));
write("adaptive-icon-background.png", 1024, solidFill(1024, BACKGROUND));
write("splash-icon.png", 1024, drawMark(1024, { transparentBg: true }));
write("favicon.png", 196, drawMark(196));
write("notification-icon.png", 96, drawMark(96, { singleColorWhite: true }));
console.log("Готово. Перед публикацией замени на собственную иллюстрацию/лого.");
