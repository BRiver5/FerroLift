import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { Lock } from "lucide-react-native";
import { useTheme } from "../theme";
import { sizeColors, zoneColors } from "../theme/colors";
import { spring } from "../theme/motion";
import { weekdayShort } from "../lib/dates.ts";
import { SIZE_LABELS, type SessionSize } from "../lib/model.ts";
import { zoneOf } from "../lib/load.ts";
import type { PlanDay } from "../lib/planner.ts";
import { haptics } from "../services/haptics";

const LEVELS: SessionSize[] = ["rest", "light", "moderate", "hard"];
const LEVEL_HEIGHT = [0.08, 0.42, 0.7, 1];
const COLUMN_HEIGHT = 112;
/** Сколько пикселей вертикального жеста на одну ступень. */
const STEP_PX = 26;

/**
 * WeekStrip — жестовый виджет недели. Каждый день — столбик высотой в размер
 * тренировки. Потянуть столбик вверх или вниз — сменить размер дня (ступенями,
 * с щелчком вибрации на каждой), отпустить — день фиксируется, и планировщик
 * пересобирает ОСТАЛЬНЫЕ дни вокруг него. Тап — следующий размер по кругу.
 * Долгое нажатие — снять фиксацию и вернуть день планировщику.
 *
 * Во время жеста ничего не пишется в базу и не пересчитывается неделя: только
 * превью столбика. Фиксация — один раз, на отпускании (урок BlockDay, где
 * редактор писал в SQLite на каждом кадре).
 */
export function WeekStrip({
  days,
  onCommit,
  onUnlock,
}: {
  days: PlanDay[];
  onCommit: (date: string, size: SessionSize) => void;
  onUnlock: (date: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
      {days.map((day) => (
        <DayColumn key={day.date} day={day} onCommit={onCommit} onUnlock={onUnlock} />
      ))}
    </View>
  );
}

function DayColumn({
  day,
  onCommit,
  onUnlock,
}: {
  day: PlanDay;
  onCommit: (date: string, size: SessionSize) => void;
  onUnlock: (date: string) => void;
}) {
  const theme = useTheme();
  const startLevel = LEVELS.indexOf(day.size);
  const [preview, setPreview] = useState(startLevel);
  const level = useSharedValue(startLevel);
  const origin = useSharedValue(startLevel);
  const height = useSharedValue(LEVEL_HEIGHT[startLevel] * COLUMN_HEIGHT);
  const lifted = useSharedValue(0);

  useEffect(() => {
    level.value = startLevel;
    height.value = withSpring(LEVEL_HEIGHT[startLevel] * COLUMN_HEIGHT, spring.gentle);
    setPreview(startLevel);
  }, [startLevel]);

  const tick = (next: number) => {
    setPreview(next);
    haptics.tap();
  };
  const commit = (next: number) => {
    if (next !== startLevel || !day.locked) onCommit(day.date, LEVELS[next]);
  };
  const unlock = () => {
    haptics.press();
    onUnlock(day.date);
  };

  // Высоты ступеней лежат в константе модуля, но в ворклет попадают через
  // локальную копию-массив чисел — без вызова функций модуля на UI-потоке.
  const heights = LEVEL_HEIGHT.map((h) => h * COLUMN_HEIGHT);

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-14, 14])
    .onBegin(() => {
      origin.value = level.value;
      lifted.value = withSpring(1, spring.snappy);
    })
    .onUpdate((event) => {
      const raw = Math.round(origin.value - event.translationY / STEP_PX);
      const next = Math.max(0, Math.min(3, raw));
      if (next !== level.value) {
        level.value = next;
        height.value = withSpring(heights[next], spring.snappy);
        runOnJS(tick)(next);
      }
    })
    .onFinalize(() => {
      lifted.value = withSpring(0, spring.gentle);
      if (level.value !== origin.value) runOnJS(commit)(level.value);
    });

  const tap = Gesture.Tap().onEnd(() => {
    const next = (level.value + 1) % 4;
    level.value = next;
    height.value = withSpring(heights[next], spring.snappy);
    runOnJS(tick)(next);
    runOnJS(commit)(next);
  });

  const longPress = Gesture.LongPress()
    .minDuration(450)
    .onStart(() => {
      runOnJS(unlock)();
    });

  const gesture = Gesture.Exclusive(pan, longPress, tap);

  const barStyle = useAnimatedStyle(() => ({ height: height.value }));
  const columnStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + lifted.value * 0.06 }] }));

  const size = LEVELS[preview];
  const zone = zoneOf(day.acwr);
  const fill = size === "rest" ? "transparent" : sizeColors[size];

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1, alignItems: "center" }, columnStyle]}>
        <View style={{ height: 16, justifyContent: "center" }}>
          {day.locked ? <Lock size={12} color={theme.colors.accent} /> : null}
        </View>
        <View
          style={{
            width: "100%",
            height: COLUMN_HEIGHT,
            justifyContent: "flex-end",
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.surfaceAlt,
            overflow: "hidden",
          }}
        >
          <Animated.View
            style={[
              {
                width: "100%",
                borderRadius: theme.radius.sm,
                backgroundColor: fill,
                borderWidth: size === "rest" ? 1 : 0,
                borderColor: theme.colors.border,
                borderStyle: "dashed",
              },
              barStyle,
            ]}
          />
        </View>
        <Text style={{ ...theme.typography.label, fontSize: 12, color: theme.colors.ink, marginTop: 6 }}>{weekdayShort(day.date)}</Text>
        <Text style={{ ...theme.typography.caption, fontSize: 10, color: theme.colors.inkMuted }}>{SIZE_LABELS[size]}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: zone ? zoneColors[zone] : theme.colors.border,
            }}
          />
          <Text style={{ ...theme.typography.caption, fontSize: 10, color: theme.colors.inkFaint }}>
            {day.acwr === null ? "—" : day.acwr.toFixed(2)}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}
