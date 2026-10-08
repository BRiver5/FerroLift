import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Check } from "lucide-react-native";
import { useTheme } from "../theme";

// Момент завершения ключевого действия (сохранил запись, закрыл задачу,
// полил растение) заслуживает свой анимированный "payoff", а не просто toast —
// см. Standy CheckmarkBurst / DreamLog SaveSuccess / Planti WaterButton ripple.
// Декларативный: смонтируй/размонтируй по условию (visible), onDone вызовется
// один раз, когда бейдж закончит анимацию — используй его, чтобы скрыть сам
// компонент или перейти дальше.
export function SuccessBurst({ visible, onDone, size = 64 }: { visible: boolean; onDone?: () => void; size?: number }) {
  const theme = useTheme();
  const scale = useSharedValue(0);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    scale.value = withSequence(
      withTiming(1.15, { duration: 280, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 160 }, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      })
    );
    ringScale.value = withTiming(1.6, { duration: 520, easing: Easing.out(Easing.quad) });
    ringOpacity.value = withSequence(withTiming(0.35, { duration: 1 }), withDelay(80, withTiming(0, { duration: 440 })));
  }, [visible]);

  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }], opacity: ringOpacity.value }));

  if (!visible) return null;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          {
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: theme.colors.accent,
          },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: size * 0.6,
            height: size * 0.6,
            borderRadius: size * 0.3,
            backgroundColor: theme.colors.accent,
            alignItems: "center",
            justifyContent: "center",
          },
          badgeStyle,
        ]}
      >
        <Check size={size * 0.32} color={theme.colors.onAccent} strokeWidth={3} />
      </Animated.View>
    </View>
  );
}
