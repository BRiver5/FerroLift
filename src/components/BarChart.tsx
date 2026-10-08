import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming, Easing } from "react-native-reanimated";
import { useTheme } from "../theme";

export type BarDatum = { label: string; value: number };

// Свой useSharedValue на столбец — хуки не могут жить внутри .map() родителя.
// Растёт от 0 до целевой высоты с задержкой по индексу (стаггер), не статично.
function AnimatedBar({
  targetHeight,
  color,
  radius,
  delay,
}: {
  targetHeight: number;
  color: string;
  radius: number;
  delay: number;
}) {
  const height = useSharedValue(0);

  useEffect(() => {
    height.value = 0;
    height.value = withDelay(delay, withTiming(targetHeight, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [targetHeight, delay]);

  const style = useAnimatedStyle(() => ({ height: height.value }));

  return <Animated.View style={[{ width: "100%", backgroundColor: color, borderRadius: radius }, style]} />;
}

// Простой столбчатый чарт на чистых View — без SVG, для сравнения по дням/
// категориям. Для круговых долей используй DonutChart.
export function BarChart({ data, color, height = 120 }: { data: BarDatum[]; color: string; height?: number }) {
  const theme = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height, gap: theme.spacing.sm }}>
      {data.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center" }}>
          <AnimatedBar
            targetHeight={Math.max(4, (d.value / max) * (height - 20))}
            color={color}
            radius={theme.radius.sm}
            delay={Math.min(i, 8) * 60}
          />
          <Text style={{ fontSize: 10, color: theme.colors.inkFaint, marginTop: theme.spacing.xs }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}
