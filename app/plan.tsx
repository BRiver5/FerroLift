import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CircleHelp, Lock, RotateCcw, TriangleAlert } from "lucide-react-native";
import { useAppStore } from "../src/store/appStore";
import { useTheme } from "../src/theme";
import { groupColors, sizeColors } from "../src/theme/colors";
import { staggerDelay } from "../src/theme/motion";
import { Appear, Chip, IconButton, Notice, SectionTitle, Segmented, TopScrim } from "../src/components/Bits";
import { FormCurve } from "../src/components/FormCurve";
import { WeekStrip } from "../src/components/WeekStrip";
import { RampGauge } from "../src/components/RampGauge";
import { PressableScale } from "../src/components/PressableScale";
import { addDays, dayRange, formatShort, weekdayShort } from "../src/lib/dates.ts";
import { SIZE_LABELS } from "../src/lib/model.ts";
import { formatWeight } from "../src/lib/parse.ts";
import { RAMP_MIN_HISTORY_DAYS } from "../src/lib/planner.ts";

/**
 * План недели. Кривые модели нагрузки с прогнозом, жестовая полоса недели и
 * программа на каждый тренировочный день — с конкретными весами из модели
 * силы. Потянуть день — зафиксировать его; остальные дни планировщик
 * пересобирает вокруг.
 */
export default function PlanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const store = useAppStore();
  const { lifts, sessions, sets, strength, settings, overrides } = store;

  const week = useMemo(() => store.week(), [lifts, sessions, sets, strength, settings, overrides]);
  const plan = week.shown;
  const snap = week.snap;
  const rampActive = snap.request.historyDays >= RAMP_MIN_HISTORY_DAYS;
  const target = settings.target;
  const lockedCount = Object.keys(overrides).length;

  const curveHistory = snap.history.map((p) => ({ date: p.date, fitness: p.fitness, fatigue: p.fatigue, form: p.form }));
  const curveNext = plan ? plan.days.map((d) => ({ date: d.date, fitness: d.fitness, fatigue: d.fatigue, form: d.form })) : [];

  const peakChoices = dayRange(addDays(snap.request.start, 2), 5);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingTop: insets.top + theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xxl }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <IconButton icon={<ArrowLeft size={18} color={theme.colors.ink} />} onPress={() => router.back()} />
          <Text style={{ ...theme.typography.subtitle, color: theme.colors.ink }}>This week</Text>
          <IconButton icon={<CircleHelp size={18} color={theme.colors.ink} />} onPress={() => router.push("/explain")} />
        </View>

        {/* --- цель --- */}
        <View style={{ marginTop: theme.spacing.lg }}>
          <Segmented
            value={target.kind}
            onChange={(kind) =>
              store.updateSettings({ target: kind === "build" ? { kind: "build" } : { kind: "peak", date: peakChoices[peakChoices.length - 1] } })
            }
            options={[
              { value: "build", label: "Build fitness" },
              { value: "peak", label: "Peak for a day" },
            ]}
          />
          {target.kind === "peak" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.sm }}>
              {peakChoices.map((date) => (
                <Chip
                  key={date}
                  label={`${weekdayShort(date)} ${formatShort(date)}`}
                  compact
                  selected={target.date === date}
                  onPress={() => store.updateSettings({ target: { kind: "peak", date } })}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>

        {/* --- кривые --- */}
        <Appear>
          <View style={{ marginTop: theme.spacing.lg, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface }}>
            <FormCurve history={curveHistory} projection={curveNext} targetDate={target.kind === "peak" ? target.date : null} />
          </View>
        </Appear>

        <Appear delay={60}>
          <View style={{ marginTop: theme.spacing.md, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface }}>
            <RampGauge acwr={snap.now?.acwr ?? null} cap={settings.constraints.acwrCap} active={rampActive} />
          </View>
        </Appear>

        {/* --- полоса недели --- */}
        <Appear delay={120}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle
              title="Shape of the week"
              trailing={
                lockedCount > 0 ? (
                  <PressableScale scaleTo={0.9} onPress={() => store.clearLocks()}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <RotateCcw size={13} color={theme.colors.accent} />
                      <Text style={{ ...theme.typography.caption, color: theme.colors.accent }}>Unlock {lockedCount}</Text>
                    </View>
                  </PressableScale>
                ) : (
                  <Text style={{ ...theme.typography.caption, color: theme.colors.inkFaint }}>{week.search.evaluated.toLocaleString("en-US")} weeks compared</Text>
                )
              }
            />
            {plan ? (
              <WeekStrip
                days={plan.days}
                onCommit={(date, size) => store.lockDay(date, size)}
                onUnlock={(date) => store.lockDay(date, null)}
              />
            ) : null}
            <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint, marginTop: theme.spacing.sm }}>
              Drag a day up or down to set it yourself, tap to cycle, hold to hand it back. The other days are re-planned around
              whatever you pin.
            </Text>
          </View>
        </Appear>

        {/* --- нарушения --- */}
        {plan && plan.violations.length > 0 ? (
          <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
            <Notice
              icon={<TriangleAlert size={16} color={theme.colors.danger} />}
              tone={theme.colors.danger}
              title={week.search.best ? "Your pinned days break a rule" : "No week fits every rule"}
              body={plan.violations.map((v) => v.message).join(" · ")}
              onPress={() => router.push("/explain")}
            />
          </View>
        ) : null}
        {week.search.targetOutOfRange ? (
          <View style={{ marginTop: theme.spacing.sm }}>
            <Notice
              icon={<CircleHelp size={16} color={theme.colors.inkMuted} />}
              title="The target day is beyond this week"
              body="Planning for fitness now; the taper starts once the day comes inside the seven-day window."
            />
          </View>
        ) : null}

        {/* --- программа по дням --- */}
        <View style={{ marginTop: theme.spacing.xl }}>
          <SectionTitle title="Sessions" />
          {plan?.days.map((day, index) => {
            const program = week.programs[day.date];
            return (
              <Appear key={day.date} delay={staggerDelay(index)}>
                <View
                  style={{
                    flexDirection: "row",
                    marginBottom: theme.spacing.sm,
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.surface,
                    overflow: "hidden",
                    opacity: day.size === "rest" ? 0.75 : 1,
                  }}
                >
                  <View style={{ width: 5, backgroundColor: day.size === "rest" ? theme.colors.border : sizeColors[day.size] }} />
                  <View style={{ flex: 1, padding: theme.spacing.md }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ ...theme.typography.label, color: theme.colors.ink }}>
                          {weekdayShort(day.date)} {formatShort(day.date)}
                        </Text>
                        {day.locked ? <Lock size={12} color={theme.colors.accent} /> : null}
                      </View>
                      <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>
                        {SIZE_LABELS[day.size]}
                        {day.load > 0 ? ` · load ${day.load}` : ""}
                        {program ? ` · ${program.rotation}` : ""}
                      </Text>
                    </View>
                    {program ? (
                      <View style={{ marginTop: 6, gap: 4 }}>
                        {program.lifts.map((item) => {
                          const p = item.prescription;
                          const weight = !p
                            ? "find a working weight"
                            : p.bodyweightOnly
                              ? "bodyweight"
                              : item.lift.bodyweight
                                ? `BW + ${formatWeight(p.weight)} kg`
                                : `${formatWeight(p.weight)} kg`;
                          return (
                            <PressableScale key={item.lift.id} scaleTo={0.98} onPress={() => router.push(`/lift/${item.lift.id}`)}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: groupColors[item.lift.group] }} />
                                <Text style={{ ...theme.typography.caption, color: theme.colors.ink, flex: 1 }}>{item.lift.name}</Text>
                                <Text style={{ ...theme.typography.caption, color: p ? theme.colors.ink : theme.colors.inkFaint, fontVariant: ["tabular-nums"] }}>
                                  {weight} · {item.sets}×{item.reps} @{item.rpe}
                                </Text>
                              </View>
                            </PressableScale>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={{ ...theme.typography.caption, color: theme.colors.inkFaint, marginTop: 4 }}>
                        Rest — fatigue drops to {Math.round(day.fatigue)}, form {day.form >= 0 ? "+" : ""}
                        {Math.round(day.form)}
                      </Text>
                    )}
                  </View>
                </View>
              </Appear>
            );
          })}
        </View>
      </ScrollView>
      <TopScrim height={insets.top} />
    </View>
  );
}
