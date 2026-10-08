#!/usr/bin/env node
// Превращает копию шаблона в скелет конкретного приложения: заменяет
// технические плейсхолдеры и переносит doc-шаблоны в корень.
//
// Использование:
//   node tools/rename-project.js "App Name" appslug com.org.appslug [scheme]
//
// scheme необязателен — по умолчанию берётся slug в нижнем регистре.

const fs = require("fs");
const path = require("path");

const [, , appName, slug, bundleId, schemeArg] = process.argv;

if (!appName || !slug || !bundleId) {
  console.error("Использование: node tools/rename-project.js \"App Name\" appslug com.org.appslug [scheme]");
  process.exit(1);
}

const scheme = schemeArg || slug.toLowerCase().replace(/[^a-z0-9]/g, "");
const ROOT = path.join(__dirname, "..");

const REPLACEMENTS = [
  [/__APP_NAME__/g, appName],
  [/__SLUG__/g, slug],
  [/__BUNDLE_ID__/g, bundleId],
  [/__SCHEME__/g, scheme],
];

// tools/ намеренно исключён: скрипты в нём хранят __PLACEHOLDER__-строки как
// литералы для проверки/замены, а не как значения, которые нужно подставить.
const SKIP_DIRS = new Set(["node_modules", ".git", ".expo", "assets", "docs", "tools"]);
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".json", ".md"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), files);
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

let changed = 0;
for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, "utf8");
  let updated = original;
  for (const [pattern, value] of REPLACEMENTS) {
    updated = updated.replace(pattern, value);
  }
  if (updated !== original) {
    fs.writeFileSync(file, updated, "utf8");
    changed++;
  }
}
console.log(`Плейсхолдеры заменены в ${changed} файлах.`);

// Doc-шаблоны переносятся в корень как рабочие PLAN.md/README.md. Здесь
// заменяется только имя приложения — остальные {{...}}-токены (тэглайн,
// экраны, модель данных) заполняет Claude Code по ходу разработки.
for (const [templateName, outName] of [
  ["PLAN.template.md", "PLAN.md"],
  ["README.template.md", "README.md"],
]) {
  const src = path.join(ROOT, "docs", templateName);
  const dest = path.join(ROOT, outName);
  if (!fs.existsSync(src)) continue;
  let content = fs.readFileSync(src, "utf8").replace(/\{\{APP_NAME\}\}/g, appName);
  fs.writeFileSync(dest, content, "utf8");
  console.log(`Создан ${outName} из docs/${templateName}`);
}

console.log(`\nГотово: ${appName} / ${slug} / ${bundleId} / scheme=${scheme}`);
console.log("Дальше: npm install, npm run icons (после правки палитры), затем разработка по CLAUDE.md.");
