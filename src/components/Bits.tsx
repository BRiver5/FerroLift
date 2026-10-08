import { useEffect, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withTiming, runOnJS } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { X } from "lucide-react-native";
import { useTheme } from "../theme";
import { PressableScale } from "./PressableScale";
import { haptics } from "../services/haptics";

/** Заголовок секции, прилипающий в скролле (sticky header у списков). */
export function SectionTitle({
  title,
  trailing,
  sticky = false,
}: {
  title: string;
  trailing?: ReactNode;
  sticky?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: sticky ? theme.spacing.lg : 0,
        backgroundColor: sticky ? theme.colors.background : "transparent",
      }}
    >
      <Text
        style={{
          ...theme.typography.label,
          color: theme.colors.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {title}
      </Text>
      {trailing}
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  tone,
  compact = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  const background = selected ? (tone ?? theme.colors.accent) : theme.colors.surface;
  const color = selected ? theme.colors.onAccent : theme.colors.ink;
  const body = (
    <View
      style={{
        paddingVertical: compact ? 4 : theme.spacing.sm,
        paddingHorizontal: compact ? theme.spacing.sm : theme.spacing.md,
        borderRadius: theme.radius.pill,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: selected ? background : theme.colors.border,
      }}
    >
      <Text style={{ ...theme.typography.caption, fontWeight: selected ? "600" : "400", color }}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale
      scaleTo={0.94}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
    >
      {body}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  tone,
}: {
  icon: ReactNode;
  onPress: () => void;
  label?: string;
  tone?: string;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      scaleTo={0.9}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: label ? theme.spacing.md : theme.spacing.sm,
        borderRadius: theme.radius.pill,
        backgroundColor: tone ?? theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {icon}
      {label ? <Text style={{ ...theme.typography.caption, color: theme.colors.ink }}>{label}</Text> : null}
    </PressableScale>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
  style,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          flex: 1,
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>{label}</Text>
      <View style={{ marginTop: 2 }}>
        {typeof value === "string" ? (
          <Text style={{ ...theme.typography.subtitle, color: tone ?? theme.colors.ink }}>{value}</Text>
        ) : (
          value
        )}
      </View>
      {hint ? (
        <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint, marginTop: 2 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function KeyValue({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
      <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, flexShrink: 1, paddingRight: theme.spacing.sm }}>
        {label}
      </Text>
      <Text style={{ ...theme.typography.caption, fontWeight: "600", color: tone ?? theme.colors.ink }}>{value}</Text>
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.sm }} />;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad" | "numeric";
  hint?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: theme.spacing.md }}>
      <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.inkFaint}
        keyboardType={keyboardType}
        style={{
          ...theme.typography.body,
          color: theme.colors.ink,
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
        }}
      />
      {hint ? (
        <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint, marginTop: 3 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Модалка добавления записи — всегда по явному триггеру, не тихая инлайн-форма. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(16,18,17,0.45)", justifyContent: "flex-end" }}>
        <Animated.View
          entering={FadeIn.duration(theme.motion.duration.base)}
          style={{
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing.xl,
            maxHeight: "92%",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.md }}>
            <Text style={{ ...theme.typography.subtitle, color: theme.colors.ink }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={22} color={theme.colors.inkMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer ? <View style={{ marginTop: theme.spacing.md }}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Строка со свайп-действиями. Порог срабатывания — 96 px: ниже этого палец
 * задевает действие на обычном вертикальном скролле (проверено на эмуляторе
 * в прошлых приложениях), поэтому жест ещё и фильтруется по оси
 * (activeOffsetX/failOffsetY).
 */
export function SwipeableRow({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel,
  rightLabel,
  leftTone,
  rightTone,
}: {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftLabel?: string;
  rightLabel?: string;
  leftTone?: string;
  rightTone?: string;
}) {
  const theme = useTheme();
  const offset = useSharedValue(0);
  const THRESHOLD = 96;

  const fire = (direction: "left" | "right") => {
    haptics.press();
    if (direction === "left") onSwipeLeft?.();
    else onSwipeRight?.();
  };

  const gesture = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      const allowedLeft = onSwipeLeft ? -140 : 0;
      const allowedRight = onSwipeRight ? 140 : 0;
      offset.value = Math.min(allowedRight, Math.max(allowedLeft, event.translationX));
    })
    .onEnd(() => {
      if (offset.value <= -THRESHOLD && onSwipeLeft) runOnJS(fire)("left");
      else if (offset.value >= THRESHOLD && onSwipeRight) runOnJS(fire)("right");
      offset.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const leftStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, -offset.value / THRESHOLD)) }));
  const rightStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, offset.value / THRESHOLD)) }));

  return (
    <View style={{ overflow: "hidden", borderRadius: theme.radius.md }}>
      {rightLabel ? (
        <Animated.View
          style={[
            { position: "absolute", left: theme.spacing.md, top: 0, bottom: 0, justifyContent: "center" },
            rightStyle,
          ]}
        >
          <Text style={{ ...theme.typography.label, color: rightTone ?? theme.colors.success }}>{rightLabel}</Text>
        </Animated.View>
      ) : null}
      {leftLabel ? (
        <Animated.View
          style={[
            { position: "absolute", right: theme.spacing.md, top: 0, bottom: 0, justifyContent: "center" },
            leftStyle,
          ]}
        >
          <Text style={{ ...theme.typography.label, color: leftTone ?? theme.colors.danger }}>{leftLabel}</Text>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={gesture}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

/** Сегментированный выбор из коротких вариантов — вместо выпадающих списков. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: theme.colors.surfaceAlt,
        borderRadius: theme.radius.pill,
        padding: 3,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => {
              haptics.tap();
              onChange(option.value);
            }}
            style={{
              flex: 1,
              paddingVertical: theme.spacing.sm,
              alignItems: "center",
              borderRadius: theme.radius.pill,
              backgroundColor: selected ? theme.colors.accent : "transparent",
            }}
          >
            <Text
              style={{
                ...theme.typography.caption,
                fontWeight: selected ? "600" : "400",
                color: selected ? theme.colors.onAccent : theme.colors.inkMuted,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Полоска-предупреждение движка: конфликт, противоречие, нечего предложить. */
export function Notice({
  icon,
  title,
  body,
  tone,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  tone?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const content = (
    <View
      style={{
        flexDirection: "row",
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        borderLeftWidth: 3,
        borderLeftColor: tone ?? theme.colors.accent,
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ paddingTop: 2 }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...theme.typography.label, color: theme.colors.ink }}>{title}</Text>
        {body ? (
          <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, marginTop: 2 }}>{body}</Text>
        ) : null}
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <PressableScale scaleTo={0.985} onPress={onPress}>
      {content}
    </PressableScale>
  );
}

/** Плавное появление блока — общий энтранс для секций экранов. */
export function Appear({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  const theme = useTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: theme.motion.duration.slow, easing: theme.motion.easing.enter })
    );
  }, [delay]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * Непрозрачная полоса под системный статус-бар. Контент скроллится под часы
 * и иконки (прозрачный статус-бар — поведение Android по умолчанию), и на
 * эмуляторе заголовок секции наезжал прямо на время. Скрим рисуется поверх
 * скролла, но не ловит касания.
 */
export function TopScrim({ height }: { height: number }) {
  const theme = useTheme();
  if (height <= 0) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, height, backgroundColor: theme.colors.background }}
    />
  );
}
