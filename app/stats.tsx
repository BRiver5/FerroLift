import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Award, CalendarDays, Dumbbell, Gauge, TrendingUp, Waves } from "lucide-react-native";
import { useAppStore } from "../src/store/appStore";
import { useTheme } from "../src/theme";
import { groupColors, heatScale, zoneColors } from "../src/theme/colors";
import { staggerDelay } from "../src/theme/motion";
import { Appear, Chip, IconButton, SectionTitle, StatTile, TopScrim } from "../src/components/Bits";
import { AnimatedCounter } from "../src/components/AnimatedCounter";
import { BarChart } from "../src/components/BarChart";
import { DonutChart } from "../src/components/DonutChart";
import { Heatmap } from "../src/components/Heatmap";
import { EmptyState } from "../src/components/EmptyState";
import { PressableScale } from "../src/components/PressableScale";
import { groupVolume, liftHistory, personalRecords, sessionActivity, trendFor, weeklyLoads, zoneShare } from "../src/lib/stats.ts";
import { addDays, formatShort, todayIso } from "../src/lib/dates.ts";
import { GROUP_LABELS, type MuscleGroup } from "../src/lib/model.ts";
import { RAMP_MIN_HISTORY_DAYS } from "../src/lib/planner.ts";

export default function StatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const store = useAppStore();
  const { lifts, sessions, sets, strength, settings, overrides } = store;
  const today = todayIso();
  const [group, setGroup] = useState<MuscleGroup | null>(null);

  const week = useMemo(() => store.week(), [lifts, sessions, sets, strength, settings, overrides]);
  const loads = week.snap.loads;
  const weeks = useMemo(() => weeklyLoads(loads, 8, today), [loads, today]);
  const volume = useMemo(() => groupVolume(sets, lifts), [sets, lifts]);
  const scopedLifts = useMemo(() => lifts.filter((lift) => group === null || lift.group === group), [lifts, group]);
  const records = useMemo(() => personalRecords(scopedLifts, sessions, sets, settings.bodyweight).slice(0, 6), [scopedLifts, sessions, sets, settings.bodyweight]);
  const trends = useMemo(
    () =>
      scopedLifts
        .map((lift) => ({ lift, trend: trendFor(liftHistory(lift, sessions, sets, settings.bodyweight), today) }))
        .filter((item) => item.trend.n > 0)
        .sort((a, b) => b.trend.slopePerWeek - a.trend.slopePerWeek),
    [scopedLifts, sessions, sets, settings.bodyweight, today]
  );
  // Только дни после трёх недель истории: до этого 28-дневное среднее ещё
  // набирается, и каждая тренировка выглядит "скачком" — на эмуляторе это
  // давало "jumps 48%" у вполне ровного графика.
  const zones = useMemo(() => {
    const first = loads.reduce<string | null>((min, item) => (min === null || item.date < min ? item.date : min), null);
    const from = first ? addDays(first, RAMP_MIN_HISTORY_DAYS) : today;
    return zoneShare(week.snap.history.filter((p) => p.date >= from).map((p) => p.acwr));
  }, [week, loads, today]);
  const activity = useMemo(() => sessionActivity(loads, 12, today), [loads, today]);
  const maxDay = Math.max(1, ...activity.flatMap((w) => w.counts));
  const cells = activity.flatMap((w) => w.counts.map((count, day) => ({ key: `${w.weekStart}-${day}`, intensity: count / maxDay })));

  const thisMonth = loads.filter((item) => item.date.slice(0, 7) === today.slice(0, 7));
  const rampActive = week.snap.request.historyDays >= RAMP_MIN_HISTORY_DAYS;
  const zoneTotal = zones.under + zones.sweet + zones.spike || 1;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingTop: insets.top + theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xxl }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <IconButton icon={<ArrowLeft size={18} color={theme.colors.ink} />} onPress={() => router.back()} />
          {/* flex: 1 — без него Android мерил блок по ширине самой узкой строки и ломал заголовок на две. */}
          <View style={{ flex: 1 }}>
            <Text style={{ ...theme.typography.subtitle, color: theme.colors.ink }}>Progress</Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>{group ? `${GROUP_LABELS[group]} only` : "All lifts"}</Text>
          </View>
        </View>

        {sessions.length === 0 ? <EmptyState title="Nothing logged yet" description="Every number on this screen comes from your own sessions — log one and it starts." /> : null}

        {/* --- 1. итоги --- */}
        <Appear>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
            <StatTile
              label="Sessions this month"
              value={<AnimatedCounter value={thisMonth.length} formatter={(v) => { "worklet"; return String(Math.round(v)); }} style={{ ...theme.typography.title, color: theme.colors.ink, padding: 0 }} />}
              hint={`${sets.length} sets all time`}
            />
            <StatTile
              label="Fitness now"
              value={<AnimatedCounter value={week.snap.now?.fitness ?? 0} formatter={(v) => { "worklet"; return String(Math.round(v)); }} style={{ ...theme.typography.title, color: theme.colors.ink, padding: 0 }} />}
              hint="42-day average daily load"
            />
          </View>
        </Appear>

        {/* --- 2. недельная нагрузка --- */}
        <Appear delay={60}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Weekly load" trailing={<Gauge size={14} color={theme.colors.inkFaint} />} />
            <BarChart data={weeks.map((w) => ({ label: formatShort(w.weekStart).split(" ")[1], value: w.load }))} color={theme.colors.accent} />
            <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint }}>
              Effort × minutes per week, last eight weeks. Days without an effort rating are estimated from your sets.
            </Text>
          </View>
        </Appear>

        {/* --- 3. донат по группам (интерактивная секция) --- */}
        <Appear delay={90}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Where the sets went" trailing={<Dumbbell size={14} color={theme.colors.inkFaint} />} />
            {volume.length === 0 ? (
              <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>No sets yet.</Text>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.lg }}>
                <DonutChart
                  segments={volume.map((slice) => ({ value: slice.sets, color: group && slice.group !== group ? theme.colors.border : groupColors[slice.group] }))}
                  size={124}
                />
                <View style={{ flex: 1, gap: 6 }}>
                  {volume.map((slice) => (
                    <PressableScale key={slice.group} scaleTo={0.97} onPress={() => setGroup(group === slice.group ? null : slice.group)}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: groupColors[slice.group], opacity: group && slice.group !== group ? 0.35 : 1 }} />
                        <Text style={{ ...theme.typography.caption, color: theme.colors.ink, flex: 1 }}>{GROUP_LABELS[slice.group]}</Text>
                        <Text style={{ ...theme.typography.caption, color: theme.colors.inkFaint }}>
                          {slice.sets} · {Math.round(slice.share * 100)}%
                        </Text>
                      </View>
                    </PressableScale>
                  ))}
                  {group ? (
                    <Chip label={`Show all groups`} compact onPress={() => setGroup(null)} />
                  ) : (
                    <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint }}>Tap a group to narrow records and trends to it.</Text>
                  )}
                </View>
              </View>
            )}
          </View>
        </Appear>

        {/* --- 4. тренды с интервалом --- */}
        <Appear delay={120}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Which lifts are moving" trailing={<TrendingUp size={14} color={theme.colors.inkFaint} />} />
            {trends.length === 0 ? (
              <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>No lift has enough sessions yet.</Text>
            ) : (
              trends.slice(0, 8).map(({ lift, trend }, index) => (
                <Appear key={lift.id} delay={staggerDelay(index)}>
                  <PressableScale scaleTo={0.99} onPress={() => router.push(`/lift/${lift.id}`)}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: groupColors[lift.group] }} />
                      <Text style={{ ...theme.typography.caption, color: theme.colors.ink, flex: 1 }}>{lift.name}</Text>
                      <Text
                        style={{
                          ...theme.typography.caption,
                          fontWeight: "600",
                          color: trend.verdict === "rising" ? theme.colors.success : trend.verdict === "falling" ? theme.colors.danger : theme.colors.inkFaint,
                        }}
                      >
                        {trend.verdict === "too-few"
                          ? `${trend.n} session${trend.n === 1 ? "" : "s"} — too few`
                          : trend.verdict === "unclear"
                            ? "no clear direction"
                            : `${trend.slopePerWeek >= 0 ? "+" : ""}${trend.slopePerWeek.toFixed(1)} kg/wk`}
                      </Text>
                    </View>
                  </PressableScale>
                </Appear>
              ))
            )}
            <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint, marginTop: 4 }}>
              A direction is shown only when the whole 95% interval of the slope sits on one side of zero.
            </Text>
          </View>
        </Appear>

        {/* --- 5. рекорды --- */}
        <Appear delay={150}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Best estimated maxes" trailing={<Award size={14} color={theme.colors.inkFaint} />} />
            {records.length === 0 ? (
              <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>Nothing here yet.</Text>
            ) : (
              records.map((record) => (
                <View key={record.lift.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 5, gap: theme.spacing.sm }}>
                  <View style={{ width: 4, height: 22, borderRadius: 2, backgroundColor: groupColors[record.lift.group] }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...theme.typography.caption, color: theme.colors.ink }}>{record.lift.name}</Text>
                    <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint }}>
                      {formatShort(record.date)} · {record.topSet}
                    </Text>
                  </View>
                  <Text style={{ ...theme.typography.label, color: theme.colors.ink }}>{Math.round(record.best)} kg</Text>
                </View>
              ))
            )}
          </View>
        </Appear>

        {/* --- 6. зоны нагрузки --- */}
        <Appear delay={180}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Six weeks of ramps" trailing={<Waves size={14} color={theme.colors.inkFaint} />} />
            {rampActive ? (
              <>
                <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden" }}>
                  <View style={{ flex: zones.under || 0.0001, backgroundColor: zoneColors.under }} />
                  <View style={{ flex: zones.sweet || 0.0001, backgroundColor: zoneColors.sweet }} />
                  <View style={{ flex: zones.spike || 0.0001, backgroundColor: zoneColors.spike }} />
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Text style={{ ...theme.typography.caption, color: zoneColors.under }}>below usual {Math.round((zones.under / zoneTotal) * 100)}%</Text>
                  <Text style={{ ...theme.typography.caption, color: zoneColors.sweet }}>steady {Math.round((zones.sweet / zoneTotal) * 100)}%</Text>
                  <Text style={{ ...theme.typography.caption, color: zoneColors.spike }}>jumps {Math.round((zones.spike / zoneTotal) * 100)}%</Text>
                </View>
              </>
            ) : (
              <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>
                Ramps mean something once there are three weeks of history to compare against.
              </Text>
            )}
          </View>
        </Appear>

        {/* --- 7. календарь тренировок --- */}
        <Appear delay={210}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Twelve weeks" trailing={<CalendarDays size={14} color={theme.colors.inkFaint} />} />
            <Heatmap cells={cells} colorForIntensity={(i) => heatScale[i === 0 ? 0 : i < 0.34 ? 1 : i < 0.67 ? 2 : 3]} />
            <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint, marginTop: theme.spacing.sm }}>
              One square per day, darker means a heavier session.
            </Text>
          </View>
        </Appear>
      </ScrollView>
      <TopScrim height={insets.top} />
    </View>
  );
}
