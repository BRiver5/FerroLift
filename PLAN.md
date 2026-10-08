# FerroLift — plan

A strength-training log that plans the week. You log sets as one line of
text, the app learns an estimated max for every lift, tracks training load
with a fitness–fatigue model, and builds the week — which day light, which
hard, which rest — then turns each training day into concrete weights.

Fully local (`expo-sqlite`). No account, no network.

Built to the raised complexity bar of 05.10.2026 (`AUTOMATION.md`).

## The chain (`src/lib/*.ts`, pure functions, 73 unit tests)

1. **`parse.ts`** — the console grammar: `squat 100x5x3 @8`,
   `bench 80 x 8, 8, 7`, ladders `dl 140x3 150x2 160x1`, per-set effort,
   `pullup bw+10 x6x3`, pounds, `session 7 60min`. Lift names are matched
   fuzzily (exact alias → prefix → Damerau–Levenshtein ≤ 2); an ambiguous
   name is an error with choices, never a silent guess.
2. **`strength.ts`** — the model that lives in time: one accumulating
   estimated max per lift (Epley with reps-in-reserve from RPE — `100×5 @6`
   and `100×5 @10` are different people), adaptive EWMA with a 0.25 floor,
   jumps over 25% clipped to 12% so a slipped zero can't rewrite a squat,
   confidence decaying over weeks without training. The inverse formula
   prescribes working weights, rounded down to the lift's step.
3. **`load.ts`** — Foster session load (effort × minutes, estimated from sets
   when missing and labelled so), Banister fitness (42-day) and fatigue
   (7-day) as exponential averages with form = fitness − fatigue, EWMA
   acute:chronic ratio, Foster monotony.
4. **`planner.ts`** — **exact enumeration** of all 4⁷ = 16,384 week shapes
   with branch pruning (ramp above the ceiling, two hard days in a row,
   unavailable days, too few sessions, too much fitness lost before a peak).
   Greedy "as hard as the ceiling allows" is provably not better (tested) and
   usually worse: the optimum often puts a light day *before* a hard one.
   The ramp ceiling only switches on after 21 days of history — before that
   the 28-day average hasn't formed and a beginner's second session would read
   as a 3.6× spike (caught by a test, not by a user). The score is returned as
   named terms for the explanation screen.
5. **`program.ts`** — planner says "Thursday hard", the strength model knows
   "squat ~142", together they give "squat 125 × 3 × 4 @8.5". A/B rotation
   continues from the last logged session.
6. **`advice.ts`** — ranked fixes, each **measured** by re-running the
   planner: raise the ceiling, allow back-to-back, unpin a day, add training
   days (pairs are tried together when one isn't enough), fewer sessions,
   move or deepen a peak. Every fix carries its cost. The "worth it"
   threshold is a share of what the week can gain over a rest week, not of
   the absolute score (the first version silently dropped useful fixes).
7. **`whatif.ts`** — two weeks side by side, verdict lists what got worse
   even when the score rose.
8. **`stats.ts`** — "am I actually getting stronger?" is a question about a
   slope, so the honest tool is the **OLS slope with a 95% t-interval** — a
   direction is claimed only when the whole interval is on one side of zero.

## Screens (6)

1. **Console** (`app/index.tsx`) — layout archetype **Chat/Log Console**:
   the training log reads bottom-up like a chat with sticky date dividers;
   a pinned input line at the bottom with a live parse preview (what lift,
   what sets, current e1RM) and an explicit send button; preset chips above
   it from today's plan and "same as last time"; swipe to delete, long-press
   menu, tap to open the lift. Session effort and minutes via a sheet.
2. **This week** (`app/plan.tsx`) — FormCurve, RampGauge, the gestural
   WeekStrip, build/peak target, and the prescribed session for every day.
3. **Lift detail** (`app/lift/[id].tsx`) — master-detail: estimate and trust,
   trend with its interval, reps × effort weight grid, full session history.
4. **Why this week** (`app/explain.tsx`) — how many weeks were walked and what
   cut them, score terms, pinned-vs-free comparison, measured fixes with
   costs, one-day what-if sandbox.
5. **Progress** (`app/stats.tsx`) — seven sections; tapping a muscle group in
   the donut narrows trends and records to it.
6. **Settings** (`app/settings.tsx`) — training days, guard rails,
   bodyweight, program lifts with search, custom lifts, model rebuild/reset.

## Custom widgets

- `FormCurve` (signature) — fitness, fatigue and form on one time axis, past
  solid and the planned week dashed, target-day marker.
- `WeekStrip` (**gestural**) — drag a day's bar up or down through
  rest/light/moderate/hard, tap to cycle, hold to unpin; the rest of the
  week re-plans around pinned days. Nothing is written during the drag.
- `RampGauge` — acute:chronic ratio with zones and the user's ceiling; shows
  "building a baseline" instead of a scary number for the first 3 weeks.
- `Sparkline` — e1RM per session with a trend line drawn only when the
  slope's interval excludes zero.

## Data model

`lifts` (catalog seeded from presets on first run — reference data, not demo
records) · `sessions` · `sets` · `lift_model` (accumulating) ·
`plan_overrides` (pinned days) · `settings`.

## Permissions

Nothing unlocked. No notifications, no network — vibration only.
