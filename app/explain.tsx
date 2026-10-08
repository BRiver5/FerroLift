import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Lightbulb, Scale, Scissors } from "lucide-react-native";
import { useAppStore } from "../src/store/appStore";
import { useTheme } from "../src/theme";
import { sizeColors } from "../src/theme/colors";
import { staggerDelay } from "../src/theme/motion";
import { Appear, Chip, IconButton, KeyValue, Notice, SectionTitle, TopScrim } from "../src/components/Bits";
import { PressableScale } from "../src/components/PressableScale";
import { suggestFixes, explainInfeasible, type Fix } from "../src/lib/advice.ts";
import { comparePlans, withDay, type Comparison } from "../src/lib/whatif.ts";
import { bindingConstraint } from "../src/lib/planner.ts";
import { SESSION_SIZES, SIZE_LABELS, type SessionSize } from "../src/lib/model.ts";
import { weekdayShort } from "../src/lib/dates.ts";
import { haptics } from "../src/services/haptics";

const PRUNE_LABELS = {
  ramp: "load ramp above your ceiling",
  backToBack: "two hard days in a row",
  tooFewDays: "too few training days",
  tooManyDays: "more sessions than you allow",
  fitnessDrop: "too much fitness lost before the target day",
} as const;

export default function ExplainScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const store = useAppStore();
  const { lifts, sessions, sets, strength, settings, overrides } = store;

  const week = useMemo(() => store.week(), [lifts, sessions, sets, strength, settings, overrides]);
  const request = week.snap.request;
  const plan = week.shown;
  const fixes = useMemo(() => suggestFixes(request, week.search), [week]);

  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [daySize, setDaySize] = useState<SessionSize>("rest");

  const sandbox: Comparison | null = useMemo(() => {
    if (!plan || dayIndex === null) return null;
    return comparePlans(plan, withDay(request, plan, dayIndex, daySize));
  }, [plan, dayIndex, daySize, request]);

  const yoursVsFree: Comparison | null = useMemo(
    () => (plan && week.free ? comparePlans(week.free, plan) : null),
    [plan, week.free]
  );

  const applyFix = async (fix: Fix) => {
    haptics.press();
    const { peakDate, locked, ...rest } = fix.patch;
    if (peakDate) await store.updateSettings({ target: { kind: "peak", date: peakDate } });
    if (locked) {
      for (const date of Object.keys(overrides)) if (!(date in locked)) await store.lockDay(date, null);
    }
    if (Object.keys(rest).length > 0) await store.updateConstraints(rest);
  };

  const binding = bindingConstraint(week.search);
  const pruned = week.search.pruned;
  const totalPruned = pruned.ramp + pruned.backToBack + pruned.tooFewDays + pruned.tooManyDays + pruned.fitnessDrop;

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
            <Text style={{ ...theme.typography.subtitle, color: theme.colors.ink }}>Why this week</Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>
              {settings.target.kind === "peak" ? `Peaking for ${settings.target.date}` : "Building fitness"}
            </Text>
          </View>
        </View>

        {/* --- как искали --- */}
        <Appear>
          <View style={{ marginTop: theme.spacing.lg, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface }}>
            <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>
              Every day can be rest, light, moderate or hard — 4⁷ = 16,384 possible weeks. All of them were walked, branches that
              broke a rule were cut as soon as they broke it, and the {week.search.evaluated.toLocaleString("en-US")} complete
              weeks that survived were scored. The best one is your plan; nothing here is a rule of thumb.
            </Text>
            {totalPruned > 0 ? (
              <View style={{ marginTop: theme.spacing.sm }}>
                {(Object.keys(PRUNE_LABELS) as (keyof typeof PRUNE_LABELS)[])
                  .filter((key) => pruned[key] > 0)
                  .map((key) => (
                    <KeyValue
                      key={key}
                      label={`Cut for ${PRUNE_LABELS[key]}`}
                      value={pruned[key].toLocaleString("en-US")}
                      tone={key === binding ? theme.colors.accent : undefined}
                    />
                  ))}
                {binding ? (
                  <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint, marginTop: 4 }}>
                    The rule that shapes this week most: {PRUNE_LABELS[binding]}.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </Appear>

        {/* --- слагаемые цели --- */}
        {plan ? (
          <Appear delay={60}>
            <View style={{ marginTop: theme.spacing.xl }}>
              <SectionTitle title="What the score is made of" trailing={<Scale size={14} color={theme.colors.inkFaint} />} />
              {plan.terms.map((term) => (
                <View key={term.label} style={{ paddingVertical: 4 }}>
                  <KeyValue label={term.label} value={`${term.value >= 0 ? "+" : ""}${term.value.toFixed(1)}`} tone={term.value < 0 ? theme.colors.danger : theme.colors.ink} />
                  <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint }}>{term.note}</Text>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.sm }} />
              <KeyValue label="Total" value={plan.score.toFixed(1)} />
              <KeyValue label="Weekly load" value={String(plan.weeklyLoad)} />
              <KeyValue label="Steepest ramp" value={plan.maxAcwr === null ? "no baseline yet" : `${plan.maxAcwr.toFixed(2)}×`} />
            </View>
          </Appear>
        ) : null}

        {/* --- нет допустимой недели --- */}
        {!week.search.best ? (
          <View style={{ marginTop: theme.spacing.lg }}>
            <Notice icon={<Scissors size={16} color={theme.colors.danger} />} tone={theme.colors.danger} title="No week passes every rule" body={explainInfeasible(week.search, request)} />
          </View>
        ) : null}

        {/* --- ваша версия против свободной --- */}
        {yoursVsFree ? (
          <Appear delay={90}>
            <View style={{ marginTop: theme.spacing.xl }}>
              <SectionTitle title="Your pinned days vs the planner's free week" />
              <DiffTable comparison={yoursVsFree} beforeLabel="Free" afterLabel="Yours" />
            </View>
          </Appear>
        ) : null}

        {/* --- измеренные варианты --- */}
        <Appear delay={120}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title={week.search.best ? "Trade-offs worth knowing" : "What would make it work"} trailing={<Lightbulb size={14} color={theme.colors.inkFaint} />} />
            {fixes.length === 0 ? (
              <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>
                Loosening any rule would change the week by less than a tenth of what it can gain — not worth the cost.
              </Text>
            ) : (
              fixes.map((fix, index) => (
                <Appear key={fix.label} delay={staggerDelay(index)}>
                  <PressableScale scaleTo={0.99} onPress={() => applyFix(fix)}>
                    <View
                      style={{
                        padding: theme.spacing.md,
                        marginBottom: theme.spacing.sm,
                        borderRadius: theme.radius.md,
                        backgroundColor: theme.colors.surface,
                        borderWidth: 1,
                        borderColor: fix.unlocks ? theme.colors.accent : theme.colors.border,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm }}>
                        <Text style={{ ...theme.typography.label, color: theme.colors.ink, flex: 1 }}>{fix.label}</Text>
                        <Text style={{ ...theme.typography.label, color: fix.unlocks ? theme.colors.accent : theme.colors.success }}>
                          {fix.unlocks ? "makes it work" : `+${fix.delta.toFixed(1)}`}
                        </Text>
                      </View>
                      <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, marginTop: 2 }}>Cost: {fix.cost}</Text>
                    </View>
                  </PressableScale>
                </Appear>
              ))
            )}
          </View>
        </Appear>

        {/* --- песочница --- */}
        {plan ? (
          <Appear delay={150}>
            <View style={{ marginTop: theme.spacing.xl }}>
              <SectionTitle title="What if one day changes" />
              <View style={{ flexDirection: "row", gap: theme.spacing.xs, marginBottom: theme.spacing.sm }}>
                {plan.days.map((day, index) => (
                  <PressableScale
                    key={day.date}
                    scaleTo={0.92}
                    onPress={() => {
                      setDayIndex(index);
                      setDaySize(day.size === "rest" ? "moderate" : "rest");
                    }}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      paddingVertical: theme.spacing.sm,
                      borderRadius: theme.radius.sm,
                      backgroundColor: dayIndex === index ? theme.colors.accentSoft : theme.colors.surface,
                      borderWidth: 1,
                      borderColor: dayIndex === index ? theme.colors.accent : theme.colors.border,
                    }}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: day.size === "rest" ? theme.colors.border : sizeColors[day.size] }} />
                    <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.ink, marginTop: 4 }}>{weekdayShort(day.date)}</Text>
                  </PressableScale>
                ))}
              </View>
              {dayIndex !== null ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
                  {SESSION_SIZES.map((size) => (
                    <Chip key={size} label={SIZE_LABELS[size]} compact selected={daySize === size} onPress={() => setDaySize(size)} />
                  ))}
                </View>
              ) : (
                <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>
                  Pick a day to see what changes if you skip it, add one, or go harder — compared column by column, nothing saved.
                </Text>
              )}
              {sandbox ? <DiffTable comparison={sandbox} beforeLabel="Plan" afterLabel="What if" /> : null}
            </View>
          </Appear>
        ) : null}
      </ScrollView>
      <TopScrim height={insets.top} />
    </View>
  );
}

function DiffTable({ comparison, beforeLabel, afterLabel }: { comparison: Comparison; beforeLabel: string; afterLabel: string }) {
  const theme = useTheme();
  return (
    <View style={{ borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.surfaceAlt }}>
        <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, flex: 1.4 }}>Measure</Text>
        <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, flex: 1, textAlign: "right" }}>{beforeLabel}</Text>
        <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, flex: 1, textAlign: "right" }}>{afterLabel}</Text>
      </View>
      {comparison.rows.map((row) => (
        <View key={row.label} style={{ flexDirection: "row", paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <Text style={{ ...theme.typography.caption, color: theme.colors.ink, flex: 1.4 }}>{row.label}</Text>
          <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, flex: 1, textAlign: "right", fontVariant: ["tabular-nums"] }}>{row.before}</Text>
          <Text
            style={{
              ...theme.typography.caption,
              fontWeight: "600",
              flex: 1,
              textAlign: "right",
              fontVariant: ["tabular-nums"],
              color: row.direction === "better" ? theme.colors.success : row.direction === "worse" ? theme.colors.danger : theme.colors.ink,
            }}
          >
            {row.after}
          </Text>
        </View>
      ))}
      <View style={{ padding: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <Text style={{ ...theme.typography.caption, color: theme.colors.ink }}>{comparison.verdict}</Text>
      </View>
    </View>
  );
}
