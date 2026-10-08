import { Pressable, View } from "react-native";
import { useTheme } from "../theme";

export type HeatmapCell = { key: string; intensity: number }; // intensity 0..1

// GitHub-style сетка активности — сигнатурный виджет Standy/Planti в портфеле.
// colorForIntensity намеренно вынесен наружу (не захардкожен) — приложения
// используют разные цветовые шкалы (Standy: серая, Planti: зелёная), чтобы
// визуал не совпадал между приложениями с одним и тем же виджетом.
export function Heatmap({
  cells,
  colorForIntensity,
  cellSize = 13,
  gap = 3,
  onCellPress,
}: {
  cells: HeatmapCell[];
  colorForIntensity: (intensity: number) => string;
  cellSize?: number;
  gap?: number;
  onCellPress?: (cell: HeatmapCell) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
      {cells.map((cell) => (
        <Pressable
          key={cell.key}
          disabled={!onCellPress}
          onPress={() => onCellPress?.(cell)}
          style={{
            width: cellSize,
            height: cellSize,
            borderRadius: theme.radius.sm / 2,
            backgroundColor: colorForIntensity(cell.intensity),
          }}
        />
      ))}
    </View>
  );
}
