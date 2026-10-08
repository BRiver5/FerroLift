#!/usr/bin/env node
// Единая точка входа для gate-проверок перед тем, как звать человека смотреть
// эмулятор. Запуск: npm run verify. Останавливает конвейер на первом же
// проваленном шаге и печатает, что именно не так.

const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const steps = [
  { name: "TypeScript (tsc --noEmit)", cmd: "npx tsc --noEmit" },
  { name: "Юнит-тесты (node --test)", cmd: "node --test" },
  { name: "Правила проекта (check-rules)", cmd: "node tools/check-rules.js" },
  { name: "Офлайн-сборка бандла (expo export)", cmd: "npx expo export --platform android --output-dir .verify-export" },
];

console.log("=== Верификация перед ручной проверкой ===\n");

const results = [];
for (const step of steps) {
  process.stdout.write(`→ ${step.name} ... `);
  try {
    execSync(step.cmd, { cwd: ROOT, stdio: "pipe" });
    console.log("OK");
    results.push({ ...step, ok: true });
  } catch (err) {
    console.log("FAIL");
    results.push({ ...step, ok: false, output: (err.stdout || err.message || "").toString() });
  }
}

console.log("\n=== Итог ===");
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.name}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log("\nПодробности первого провала:\n");
  console.log(failed[0].output.slice(0, 4000));
  console.log(
    "\nЕсли шаг упал из-за отсутствия node_modules — сначала `npm install`, затем запускай verify снова."
  );
  process.exit(1);
}

console.log("\nВсе статические проверки зелёные. Дальше — прогон на эмуляторе и скриншоты (см. AUTOMATION.md, раздел 4).");
