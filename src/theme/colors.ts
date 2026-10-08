// Палитра Forma. Единственный файл с цветовыми значениями — магические hex
// в JSX запрещены.
//
// Акцент #6D2603 ("окисленное железо", ржавчина на блине штанги) выбран
// количественным перебором сетки HSL с максимизацией минимальной
// Lab-дистанции до всех акцентов DESIGN_REGISTRY.md (вес 1.7 на последние
// десять, включая RateHop #A8229F). Тёмный глубокий ржаво-коричневый —
// оптимум своего сектора: ближайшие MarketBasket #A13327 (ΔE 19.4, светлее и
// краснее), PlantDoctor #62181D (20.0, винный, а не ржавый), RecipeCost
// #AB3F21 (21.0, терракота). Более светлые варианты того же оттенка
// проверены и отброшены — они въезжают в терракотовый кластер портфеля
// (ΔE 11-17).
//
// onAccent — белый: контраст 10.89:1.
//
// Фон #DEDFDC — "резиновое покрытие зала": заметно ТЕМНЕЕ всех недавних
// фонов портфеля (они в диапазоне L 92-96: RateHop #E8EDE9, Upkept #E9E7E1,
// BlockDay #E8EAF0, BatchWeek #F4F1F2). Отстройка не оттенком, а светлотой:
// белые карточки на таком фоне читаются как плитки без теней.

export const light = {
  background: "#DEDFDC",
  backgroundAlt: "#D2D4D0",
  surface: "#FFFFFF",
  surfaceAlt: "#F0F1EE",
  border: "#C9CBC6",
  ink: "#1B1A18",
  inkMuted: "#55534E",
  inkFaint: "#8A8882",
  onAccent: "#FFFFFF",
  accent: "#6D2603",
  accentSoft: "#F2E3DA",
  danger: "#B0302A",
  success: "#2D7A4A",
};

export const dark = {
  background: "#141413",
  backgroundAlt: "#1B1B19",
  surface: "#22221F",
  surfaceAlt: "#2B2B27",
  border: "#3A3A35",
  ink: "#EFEEEA",
  inkMuted: "#B2B0A8",
  inkFaint: "#7C7A73",
  onAccent: "#141413",
  accent: "#E08A5C",
  accentSoft: "#3A2418",
  danger: "#FF6B6F",
  success: "#4FBE86",
};

/**
 * Группы мышц. Шесть слотов, прогнаны валидатором (контраст к фону, попарная
 * Lab-дистанция, симуляции дейтеранопии/протанопии/тританопии) ИМЕННО В ЭТОМ
 * ПОРЯДКЕ: ALL CHECKS PASS, худшая пара под тританопией ΔE 15.9.
 *
 * Ржаво-оранжевый сектор (hue 0-40) исключён: это цвет акцента и шкалы
 * размера сессии. Первая попытка (мох + охра) слипалась под протанопией с
 * ΔE 2.6 — заменена.
 */
export const groupColors = {
  legs: "#3E7A2C",
  push: "#4A3FA8",
  pull: "#B03A62",
  hinge: "#2E5560",
  core: "#7A6436",
  arms: "#7E2F7E",
} as const;

export type MuscleGroup = keyof typeof groupColors;

export const groupOrder: MuscleGroup[] = ["legs", "push", "pull", "hinge", "core", "arms"];

export const groupLabels: Record<MuscleGroup, string> = {
  legs: "Legs",
  push: "Push",
  pull: "Pull",
  hinge: "Hinge",
  core: "Core",
  arms: "Arms",
};

/**
 * Размер сессии — ПОРЯДКОВАЯ шкала от песка к чугуну, а не категориальная.
 * Три ступени одного семейства, ALL CHECKS PASS на белом (ΔE соседей 29.1 и
 * 34.9, худшая пара под дальтонизмом 20.9). "Отдых" — без заливки, только
 * контур: отсутствие нагрузки не должно выглядеть как ещё один уровень.
 */
export const sizeColors = {
  light: "#B5805F",
  moderate: "#8A3E14",
  hard: "#3B1608",
} as const;

/**
 * Зоны отношения острой нагрузки к хронической (ACWR). Отдельная шкала,
 * ALL CHECKS PASS. Цвет никогда не единственный носитель смысла — рядом
 * всегда число и подпись зоны.
 */
export const zoneColors = {
  under: "#3F6A8A",
  sweet: "#2D7A4A",
  spike: "#B0302A",
} as const;

export type Zone = keyof typeof zoneColors;

/** Лестница heatmap — от поверхности к акценту. */
export const heatScale = ["#F0F1EE", "#E7CDBD", "#B5805F", "#6D2603"] as const;

export type Palette = typeof light;
