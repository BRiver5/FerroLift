import { useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useTheme } from "../theme";

/**
 * Маленькая линия e1RM по тренировкам с линией тренда. Тренд рисуется только
 * если интервал наклона по одну сторону от нуля — иначе линия была бы
 * обещанием прогресса, которого статистика не подтверждает.
 */
export function Sparkline({
  values,
  trend,
  color,
  height = 36,
}: {
  values: number[];
  /** Наклон в единицах на точку и пересечение — или null, если тренд не доказан. */
  trend: { slope: number; intercept: number } | null;
  color: string;
  height?: number;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const shape = useMemo(() => {
    if (width <= 0 || values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const x = (i: number) => 3 + (i / (values.length - 1)) * (width - 6);
    const y = (v: number) => 3 + (1 - (v - min) / span) * (height - 6);
    const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const last = { x: x(values.length - 1), y: y(values[values.length - 1]) };
    const line = trend
      ? { x1: x(0), y1: y(trend.intercept), x2: x(values.length - 1), y2: y(trend.intercept + trend.slope * (values.length - 1)) }
      : null;
    return { d, last, line };
  }, [width, values, height, trend]);

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {shape ? (
        <Svg width={width} height={height}>
          {shape.line ? (
            <Line {...shape.line} stroke={theme.colors.inkFaint} strokeWidth={1} strokeDasharray="3,3" />
          ) : null}
          <Path d={shape.d} stroke={color} strokeWidth={1.8} fill="none" />
          <Circle cx={shape.last.x} cy={shape.last.y} r={2.8} fill={color} />
        </Svg>
      ) : null}
    </View>
  );
}
