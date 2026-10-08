# FerroLift

Offline strength-training log and week planner for Android (Expo / React Native).

Log a set the way you'd scribble it in a notebook — `squat 100x5x3 @8` — and
FerroLift keeps an estimated max for every lift, tracks how much training
load you're carrying with a fitness–fatigue model, and plans the week: which
days rest, light, moderate or hard, with the actual weights for each. Drag a
day to pin it yourself and the rest of the week re-plans around it.

No account, no backend, no network — everything lives in a local SQLite
database on the device.

## Running

```bash
npm install
npx expo start      # then open in Expo Go
npm run verify      # tsc + unit tests + project rules + offline bundle export
```

## Layout

```
app/            expo-router screens: index (console), plan, lift/[id], explain, stats, settings
src/lib/        the chain — parse → strength → load → planner → program → advice / whatif / stats (73 tests)
src/components/ FormCurve, WeekStrip, RampGauge, Sparkline, sheets and bits
src/data/       SQLite repository and settings
src/store/      zustand app store
src/theme/      palette, typography, spacing, motion
```

## Notes

- Effort after `@` is how hard the set felt out of 10; without it FerroLift
  assumes two reps left in the tank rather than a max effort.
- The ramp limit (this week vs your usual) only applies after three weeks of
  history — before that there is no "usual" to compare against.
- A lift is called "going up" only when the whole 95% interval of its trend
  is above zero; otherwise the app says there's no clear direction yet.
