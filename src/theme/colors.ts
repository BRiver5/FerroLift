// Палитра приложения. Это единственный файл, где должны жить цветовые значения —
// компоненты и экраны берут цвета только отсюда, магические hex-коды в JSX запрещены.
//
// ВАЖНО: при старте нового приложения из шаблона поменяй accent (и, если нужно,
// background/surface) на свои — дизайн не должен повторяться от приложения к приложению,
// даже если тема совпадает.

export const light = {
  background: "#FFFFFF",
  backgroundAlt: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceAlt: "#F2F2F2",
  border: "#E5E5E5",
  ink: "#1A1A1A",
  inkMuted: "#6B6B6B",
  inkFaint: "#A3A3A3",
  onAccent: "#FFFFFF",
  accent: "#2F5DFF",
  danger: "#E5484D",
  success: "#2E9E5B",
};

export const dark = {
  background: "#0E0E10",
  backgroundAlt: "#141416",
  surface: "#1B1B1E",
  surfaceAlt: "#232326",
  border: "#2C2C30",
  ink: "#F2F2F2",
  inkMuted: "#A3A3A9",
  inkFaint: "#6B6B72",
  onAccent: "#FFFFFF",
  accent: "#5B7CFF",
  danger: "#FF6B6F",
  success: "#3FBE79",
};

export type Palette = typeof light;
