#!/usr/bin/env node
// Grep-проверки вместо честного слова в документации. Запускается через
// `npm run check-rules` или как часть `npm run verify`.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCAN_DIRS = ["app", "src"];
const EXTENSIONS = [".ts", ".tsx"];

const PLACEHOLDER_ERRORS = [/__APP_NAME__/, /__SLUG__/, /__BUNDLE_ID__/, /__SCHEME__/];

const WARNING_PATTERNS = [
  { pattern: /console\.log\(/, message: "оставлен console.log" },
  { pattern: /\bTODO\b|\bFIXME\b/, message: "незакрытый TODO/FIXME" },
  { pattern: /\b(mock|fake|lorem ipsum)\b/i, message: "похоже на мок/заглушку вместо реальных данных" },
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, files);
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function checkPlaceholders(configFiles) {
  const errors = [];
  for (const file of configFiles) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, "utf8");
    for (const pattern of PLACEHOLDER_ERRORS) {
      if (pattern.test(content)) {
        errors.push(`${file}: остался плейсхолдер ${pattern} — запусти tools/rename-project.js`);
      }
    }
  }
  return errors;
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
  const errors = checkPlaceholders(["package.json", "app.json", ...files.map((f) => path.relative(ROOT, f))]);
  const warnings = [];

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, idx) => {
      for (const { pattern, message } of WARNING_PATTERNS) {
        if (pattern.test(line)) {
          warnings.push(`${rel}:${idx + 1} — ${message}`);
        }
      }
    });
  }

  if (fs.existsSync(path.join(ROOT, "src", "data", "items.example.ts"))) {
    warnings.push("src/data/items.example.ts всё ещё на месте — замени примером под реальную модель данных");
  }

  console.log(`Проверено файлов: ${files.length}`);

  if (warnings.length) {
    console.log(`\nПредупреждения (${warnings.length}):`);
    warnings.forEach((w) => console.log("  - " + w));
  }

  if (errors.length) {
    console.log(`\nОшибки (${errors.length}):`);
    errors.forEach((e) => console.log("  - " + e));
    process.exit(1);
  }

  console.log("\nЖёстких нарушений не найдено.");
}

main();
