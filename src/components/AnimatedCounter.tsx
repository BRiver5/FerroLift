import { useEffect } from "react";
import { TextInput, type StyleProp, type TextStyle } from "react-native";
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from "react-native-reanimated";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// Число "накручивается" к новому значению вместо мгновенной смены — тот же
// приём, что и в Apexify: анимированный TextInput (editable=false) с text
// через useAnimatedProps, обновление на UI-потоке без ре-рендера React на
// каждый кадр. formatter — для префикса/суффикса ("12 days", "$42.00").
export function AnimatedCounter({
  value,
  duration = 650,
  formatter = (v: number) => {
    "worklet";
    return String(Math.round(v));
  },
  style,
}: {
  value: number;
  duration?: number;
  // ВАЖНО: formatter выполняется внутри useAnimatedProps на UI-потоке —
  // Reanimated воркletизирует только функции, переданные напрямую в свои
  // хуки, не функции, пришедшие через props. Без директивы "worklet" здесь
  // (и в каждом месте, где formatter переопределяют, например
  // `formatter={(v) => { "worklet"; return v.toFixed(1); }}`) на UI-потоке
  // окажется не функция, а плейсхолдер-объект — падение
  // "formatter is not a function" в Expo Go/дев-билде.
  formatter?: (value: number) => string;
  style?: StyleProp<TextStyle>;
}) {
  const animated = useSharedValue(value);

  useEffect(() => {
    animated.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value, duration]);

  const animatedProps = useAnimatedProps(() => {
    return { text: formatter(animated.value) };
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      caretHidden
      defaultValue={formatter(value)}
      // "text" — валидный нативный проп TextInput на обеих платформах, но
      // отсутствует в TS-типах TextInputProps (известное ограничение
      // useAnimatedProps на этот компонент) — cast нужен именно поэтому.
      animatedProps={animatedProps as any}
      style={style}
    />
  );
}
