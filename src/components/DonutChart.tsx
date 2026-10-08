import { useEffect } from "react";
import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import Animated, { useAnimatedProps, useSharedValue, withDelay, withTiming, Easing } from "react-native-reanimated";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type DonutSegment = { value: number; color: string };

// Один сегмент — свой useSharedValue/useAnimatedProps (хуки не могут жить
// внутри .map() родителя), раскрывается с задержкой по индексу — тот же
// стаггер-паттерн, что и в BarChart.
function AnimatedArc({
  cx,
  cy,
  r,
  color,
  strokeWidth,
  dash,
  offset,
  circumference,
  delay,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  strokeWidth: number;
  dash: number;
  offset: number;
  circumference: number;
  delay: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [dash, offset, delay]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${dash * progress.value} ${circumference}`,
  }));

  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={r}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeDashoffset={offset}
      fill="none"
      strokeLinecap="butt"
      animatedProps={animatedProps}
    />
  );
}

// Донат-чарт на react-native-svg. Сегменты рисуются по кругу начиная с 12
// часов (через поворот группы на -90°), пропорционально их доле в сумме, и
// раскрываются по очереди — не статичная заливка.
export function DonutChart({
  segments,
  size = 140,
  strokeWidth = 18,
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let cumulative = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          {total > 0 ? (
            segments.map((seg, i) => {
              const fraction = seg.value / total;
              const dash = fraction * circumference;
              const offset = -cumulative * circumference;
              cumulative += fraction;
              return (
                <AnimatedArc
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  color={seg.color}
                  strokeWidth={strokeWidth}
                  dash={dash}
                  offset={offset}
                  circumference={circumference}
                  delay={i * 90}
                />
              );
            })
          ) : (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={segments[0]?.color ?? "#CCCCCC"}
              strokeWidth={strokeWidth}
              strokeOpacity={0.25}
              fill="none"
            />
          )}
        </G>
      </Svg>
    </View>
  );
}
