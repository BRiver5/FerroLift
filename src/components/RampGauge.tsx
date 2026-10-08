import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme";
import { zoneColors } from "../theme/colors";
import { ACWR_SWEET_HIGH, ACWR_SWEET_LOW, zoneOf } from "../lib/load.ts";

const SCALE_MAX = 2;

const ZONE_LABELS = { under: "below your usual", sweet: "steady build", spike: "sharp jump" } as const;

/**
 * RampGauge — где сейчас отношение острой нагрузки к хронической на шкале
 * 0-2 с тремя зонами и чертой пользовательского потолка. Пока истории меньше
 * трёх недель, маркера нет: число ещё ничего не значит, и виджет так и
 * говорит, вместо того чтобы показывать тревожное "3.6".
 */
export function RampGauge({
  acwr,
  cap,
  active,
  delay = 0,
}: {
  acwr: number | null;
  cap: number;
  /** false — истории меньше трёх недель, правило ещё не включено. */
  active: boolean;
  delay?: number;
}) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  // Все проценты посчитаны здесь, в ворклет попадают числа.
  const pct = (value: number) => Math.min(100, (Math.max(0, value) / SCALE_MAX) * 100);
  const markerPct = acwr === null ? 0 : pct(acwr);
  const lowPct = pct(ACWR_SWEET_LOW);
  const highPct = pct(ACWR_SWEET_HIGH);
  const capPct = pct(cap);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [acwr, delay]);

  const markerStyle = useAnimatedStyle(() => ({ left: `${markerPct * progress.value}%` }));

  const zone = active ? zoneOf(acwr) : null;

  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>Load ramp (7d vs 28d)</Text>
        <Text style={{ ...theme.typography.label, color: zone ? zoneColors[zone] : theme.colors.inkFaint }}>
          {!active || acwr === null ? "building a baseline" : `${acwr.toFixed(2)}× · ${ZONE_LABELS[zone!]}`}
        </Text>
      </View>
      <View style={{ height: 20, justifyContent: "center" }}>
        <View style={{ height: 8, borderRadius: 4, flexDirection: "row", overflow: "hidden" }}>
          <View style={{ width: `${lowPct}%`, backgroundColor: zoneColors.under, opacity: 0.28 }} />
          <View style={{ width: `${highPct - lowPct}%`, backgroundColor: zoneColors.sweet, opacity: 0.32 }} />
          <View style={{ flex: 1, backgroundColor: zoneColors.spike, opacity: 0.28 }} />
        </View>
        <View style={{ position: "absolute", left: `${capPct}%`, top: 0, bottom: 0, width: 2, backgroundColor: theme.colors.ink }} />
        {active && acwr !== null ? (
          <Animated.View
            style={[
              {
                position: "absolute",
                width: 14,
                height: 14,
                marginLeft: -7,
                borderRadius: 7,
                backgroundColor: zone ? zoneColors[zone] : theme.colors.inkFaint,
                borderWidth: 2,
                borderColor: theme.colors.surface,
              },
              markerStyle,
            ]}
          />
        ) : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ ...theme.typography.caption, fontSize: 10, color: theme.colors.inkFaint }}>0</Text>
        <Text style={{ ...theme.typography.caption, fontSize: 10, color: theme.colors.inkFaint }}>
          {active ? `your ceiling ${cap.toFixed(1)}×` : "ramp limit starts after 3 weeks of history"}
        </Text>
        <Text style={{ ...theme.typography.caption, fontSize: 10, color: theme.colors.inkFaint }}>2×</Text>
      </View>
    </View>
  );
}
