import { test } from "node:test";
import assert from "node:assert/strict";
import { step, ZERO_STATE, type LoadState } from "./load.ts";
import { DEFAULT_CONSTRAINTS, evaluatePlan, searchPlans, SIZE_FACTOR, type PlanRequest } from "./planner.ts";
import type { SessionSize } from "./model.ts";

/** Состояние человека, который месяц тренировался ~3 раза в неделю по 350. */
function trained(): LoadState {
  let state = ZERO_STATE;
  for (let i = 0; i < 60; i++) state = step(state, i % 7 === 0 || i % 7 === 2 || i % 7 === 4 ? 350 : 0);
  return state;
}

function request(over: Partial<PlanRequest> = {}): PlanRequest {
  return {
    start: "2026-10-12", // понедельник
    days: 7,
    startState: trained(),
    historyDays: 60,
    base: 350,
    target: { kind: "build" },
    constraints: DEFAULT_CONSTRAINTS,
    ...over,
  };
}

test("перебор находит неделю и отчитывается, сколько оценил", () => {
  const search = searchPlans(request());
  assert.ok(search.best);
  assert.ok(search.evaluated > 100);
  assert.equal(search.best!.days.length, 7);
  assert.ok(search.alternatives.length > 0);
  assert.ok(search.alternatives.every((alt) => alt.score <= search.best!.score));
});

test("лучшая неделя не нарушает ни одного ограничения", () => {
  const best = searchPlans(request()).best!;
  assert.deepEqual(best.violations, []);
  for (let i = 1; i < best.sizes.length; i++) {
    assert.ok(!(best.sizes[i] === "hard" && best.sizes[i - 1] === "hard"), "два тяжёлых подряд");
  }
  for (const day of best.days) {
    if (day.size !== "rest" && day.acwr !== null) assert.ok(day.acwr <= 1.3 + 1e-9, `ACWR ${day.acwr}`);
  }
});

test("недоступные дни остаются отдыхом", () => {
  const constraints = { ...DEFAULT_CONSTRAINTS, availableWeekdays: [0, 2, 4] };
  const best = searchPlans(request({ constraints })).best!;
  best.days.forEach((day, index) => {
    if (![0, 2, 4].includes(index)) assert.equal(day.size, "rest", `${day.date}`);
  });
});

test("перебор не хуже жадного 'каждый день самое тяжёлое, что пускает потолок'", () => {
  const req = request();
  // Жадный вариант строится тем же правилом допустимости.
  let state = req.startState;
  const greedy: SessionSize[] = [];
  for (let i = 0; i < 7; i++) {
    let chosen: SessionSize = "rest";
    for (const size of ["hard", "moderate", "light"] as SessionSize[]) {
      if (size === "hard" && greedy[i - 1] === "hard") continue;
      const next = step(state, req.base * SIZE_FACTOR[size]);
      const acwr = next.chronic < 1 ? null : next.acute / next.chronic;
      if (acwr === null || acwr <= 1.3) {
        chosen = size;
        break;
      }
    }
    greedy.push(chosen);
    state = step(state, req.base * SIZE_FACTOR[chosen]);
  }
  const greedyPlan = evaluatePlan(req, greedy);
  const best = searchPlans(req).best!;
  assert.ok(best.score >= greedyPlan.score - 1e-9, `${best.score} против жадного ${greedyPlan.score}`);
});

test("зафиксированный день соблюдается даже вопреки ограничениям", () => {
  const constraints = { ...DEFAULT_CONSTRAINTS, locked: { "2026-10-14": "hard" as SessionSize, "2026-10-15": "hard" as SessionSize } };
  const best = searchPlans(request({ constraints })).best!;
  assert.equal(best.days[2].size, "hard");
  assert.equal(best.days[3].size, "hard");
  assert.ok(best.days[2].locked && best.days[3].locked);
  assert.ok(best.violations.some((v) => v.kind === "back-to-back"), "нарушение честно названо");
});

test("режим пика ставит отдых перед целевым днём", () => {
  const req = request({ target: { kind: "peak", date: "2026-10-17" } }); // суббота
  const best = searchPlans(req).best!;
  assert.ok(best.targetForm !== null);
  const dayBefore = best.days[4];
  assert.notEqual(dayBefore.size, "hard", "накануне пика тяжёлого быть не должно");
  // Форма в целевой день лучше, чем в режиме роста на тот же день.
  const build = searchPlans(request()).best!;
  assert.ok(best.targetForm! > build.days[5].form);
});

test("пик за горизонтом — неделя строится как рост, и это помечено", () => {
  const search = searchPlans(request({ target: { kind: "peak", date: "2026-11-30" } }));
  assert.equal(search.targetOutOfRange, true);
  assert.equal(search.best!.targetForm, null);
});

test("новичок без истории: потолок ACWR не режет неделю, пока нет трёх недель", () => {
  // Без этого правила первая же тренировка давала ACWR ~3.6, и вторая
  // тренировка в неделю становилась "скачком" — новичку было нечего планировать.
  const search = searchPlans(request({ startState: ZERO_STATE, historyDays: 0 }));
  assert.ok(search.best);
  assert.equal(search.pruned.ramp, 0);
  assert.ok(search.best!.trainingDays >= 2);
});

test("с трёх недель истории потолок ACWR включается", () => {
  const fresh = searchPlans(request({ historyDays: 0 }));
  const seasoned = searchPlans(request({ historyDays: 60 }));
  assert.equal(fresh.pruned.ramp, 0);
  assert.ok(seasoned.pruned.ramp > 0);
});

test("невыполнимая неделя возвращает null и причину отсечения", () => {
  const constraints = { ...DEFAULT_CONSTRAINTS, availableWeekdays: [0], minTrainingDays: 3 };
  const search = searchPlans(request({ constraints }));
  assert.equal(search.best, null);
  assert.ok(search.pruned.tooFewDays > 0);
});

test("оценка ручной недели перечисляет нарушения и слагаемые цели", () => {
  const plan = evaluatePlan(request(), ["hard", "hard", "hard", "hard", "rest", "rest", "rest"]);
  assert.ok(plan.violations.some((v) => v.kind === "back-to-back"));
  assert.ok(plan.violations.some((v) => v.kind === "ramp"));
  assert.ok(plan.terms.length >= 3);
  const sum = plan.terms.reduce((acc, term) => acc + term.value, 0);
  assert.ok(Math.abs(sum - plan.score) < 1e-9, "балл — ровно сумма слагаемых");
});
