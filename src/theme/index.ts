import { light, dark, type Palette } from "./colors";
import { typography } from "./typography";
import { spacing, radius } from "./spacing";
import { duration, easing, spring } from "./motion";

export type Theme = {
  colors: Palette;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  motion: { duration: typeof duration; easing: typeof easing; spring: typeof spring };
  scheme: "light" | "dark";
};

// Дефолт — светлая тема, ВСЕГДА, независимо от системной темы устройства.
// Раньше здесь стоял useColorScheme(), и приложение молча становилось тёмным
// на любом телефоне с системным dark mode — ровно то, чего просили избегать
// ("преимущественно светлая, профессиональная"). Если приложению нужен ручной
// переключатель тем — храни выбор в src/data/settings.ts и передавай сюда
// явно через параметр scheme, по умолчанию оставляя "light".
export function useTheme(scheme: "light" | "dark" = "light"): Theme {
  return {
    colors: scheme === "dark" ? dark : light,
    typography,
    spacing,
    radius,
    motion: { duration, easing, spring },
    scheme,
  };
}
