import { useEffect } from "react";
import { View, type ViewStyle, type StyleProp } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from "react-native-reanimated";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Круговой gauge (стрик/прогресс к цели) — сигнатурный виджет в нескольких
// приложениях портфеля (Planti, Apexify), поэтому подписи children (число +
// подпись в центре) остаются на совести конкретного приложения, а не
// зашиваются здесь — иначе все ринги в портфеле будут выглядеть одинаково.
// Раскрывается один раз при изменении progress, не мгновенно.
export function AnimatedRing({
  progress,
  size = 120,
  strokeWidth = 14,
  color,
  trackColor,
  duration = 700,
  children,
  style,
}: {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor: string;
  duration?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animated = useSharedValue(0);
  const clamped = Math.min(1, Math.max(0, progress));

  useEffect(() => {
    animated.value = withTiming(clamped, { duration, easing: Easing.out(Easing.cubic) });
  }, [clamped, duration]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animated.value),
  }));

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeLinecap="round"
          fill="none"
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
          animatedProps={animatedProps}
        />
      </Svg>
      {children}
    </View>
  );
}
