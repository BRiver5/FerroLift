// Единственный источник длительностей/easing для анимаций (react-native-reanimated).
// Магические числа (300, Easing.out(...)) в компонентах запрещены — берём отсюда,
// чтобы все анимации в приложении читались как одна система.
//
// Решение "timing или spring" принимается один раз для всего приложения и не
// смешивается: если начал с withTiming — вся навигация и микро-интеракции на timing.

import { Easing } from "react-native-reanimated";

export const duration = {
  fast: 120,
  base: 220,
  slow: 320,
};

export const easing = {
  standard: Easing.out(Easing.cubic),
  enter: Easing.out(Easing.quad),
  exit: Easing.in(Easing.quad),
};

export const spring = {
  snappy: { damping: 16, stiffness: 220, mass: 0.6 },
  gentle: { damping: 20, stiffness: 140, mass: 0.8 },
};

// Задержка для стаггер-энтранса карточек/строк списка:
// <Animated.View entering={FadeInDown.delay(staggerDelay(index)).duration(400)}>
// cap ограничивает задержку на длинных списках, чтобы 20-й элемент не ждал
// секунду — после cap-го индекса все входят с одинаковой (максимальной) паузой.
export function staggerDelay(index: number, step = 70, cap = 8): number {
  return Math.min(index, cap) * step;
}
