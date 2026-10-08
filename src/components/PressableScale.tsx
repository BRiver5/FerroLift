import { Pressable, type GestureResponderEvent, type PressableProps, type ViewStyle, type StyleProp } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { spring } from "../theme/motion";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, "style"> & {
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

// Общий press-фидбек на всё приложение: масштаб вниз на нажатии, пружинный
// возврат на отпускании (см. motion.ts spring.snappy/gentle). PrimaryButton и
// SecondaryButton уже обёрнуты в него — используй его же для любых кастомных
// нажимаемых карточек/строк, чтобы физика нажатия не расходилась по экранам.
export function PressableScale({ scaleTo = 0.96, style, onPressIn, onPressOut, children, ...rest }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPressIn={(e: GestureResponderEvent) => {
        scale.value = withSpring(scaleTo, spring.snappy);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        scale.value = withSpring(1, spring.gentle);
        onPressOut?.(e);
      }}
      style={[animatedStyle, style]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
