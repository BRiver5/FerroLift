import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Archive, ArrowLeft, Pencil, TrendingDown, TrendingUp, Waves } from "lucide-react-native";
import { useAppStore } from "../../src/store/appStore";
import { useTheme } from "../../src/theme";
import { groupColors } from "../../src/theme/colors";
import { staggerDelay } from "../../src/theme/motion";
import { Appear, Chip, Field, IconButton, KeyValue, Notice, SectionTitle, Sheet, StatTile, TopScrim } from "../../src/components/Bits";
import { Sparkline } from "../../src/components/Sparkline";
import { Toggle } from "../../src/components/Toggle";
import { PrimaryButton } from "../../src/components/PrimaryButton";
import { SecondaryButton } from "../../src/components/SecondaryButton";
import { EmptyState } from "../../src/components/EmptyState";
import { liftHistory, trendFor } from "../../src/lib/stats.ts";
import { estimateLift, prescribe } from "../../src/lib/strength.ts";
import { formatShort, todayIso } from "../../src/lib/dates.ts";
import { formatWeight } from "../../src/lib/parse.ts";
import { GROUP_LABELS } from "../../src/lib/model.ts";

const GRID_REPS = [3, 5, 8, 10];
const GRID_RPE = [7, 8, 9];

export default function LiftScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useAppStore();
  const { lifts, sessions, sets, strength, settings } = store;
  const lift = lifts.find((item) => item.id === id);
  const today = todayIso();

  const [editing, setEditing] = useState(false);
  const [increment, setIncrement] = useState(String(lift?.increment ?? 2.5));
  const [aliases, setAliases] = useState(lift?.aliases.join(", ") ?? "");

  const history = useMemo(() => (lift ? liftHistory(lift, sessions, sets, settings.bodyweight) : []), [lift, sessions, sets, settings.bodyweight]);
  const trend = useMemo(() => trendFor(history, today), [history, today]);
  const estimate = lift ? estimateLift(strength, lift.id, today) : null;

  if (!lift) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + theme.spacing.xl, paddingHorizontal: theme.spacing.lg }}>
        <IconButton icon={<ArrowLeft size={18} color={theme.colors.ink} />} onPress={() => router.back()} />
        <EmptyState title="This lift is gone" />
      </View>
    );
  }

  const recent = history.slice(-12);
  const values = recent.map((point) => point.e1rm);
  // Линия тренда на спарклайне — только если интервал наклона не пересекает ноль.
  const sparkTrend =
    (trend.verdict === "rising" || trend.verdict === "falling") && recent.length >= 2
      ? (() => {
          const n = values.length;
          const meanX = (n - 1) / 2;
          const meanY = values.reduce((s, v) => s + v, 0) / n;
          let sxx = 0;
          let sxy = 0;
          values.forEach((v, i) => {
            sxx += (i - meanX) ** 2;
            sxy += (i - meanX) * (v - meanY);
          });
          const slope = sxx > 0 ? sxy / sxx : 0;
          return { slope, intercept: meanY - slope * meanX };
        })()
      : null;

  const verdictText =
    trend.verdict === "too-few"
      ? "Four sessions in the last four months are needed before saying anything about direction."
      : trend.verdict === "unclear"
        ? `Somewhere between ${trend.low.toFixed(1)} and ${trend.high >= 0 ? "+" : ""}${trend.high.toFixed(1)} kg a week — the interval crosses zero, so no claim either way.`
        : `${trend.slopePerWeek >= 0 ? "+" : ""}${trend.slopePerWeek.toFixed(1)} kg a week (95% interval ${trend.low.toFixed(1)} to ${trend.high.toFixed(1)}, ${trend.n} sessions).`;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingTop: insets.top + theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xxl }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <IconButton icon={<ArrowLeft size={18} color={theme.colors.ink} />} onPress={() => router.back()} />
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <IconButton icon={<Pencil size={16} color={theme.colors.ink} />} onPress={() => setEditing(true)} />
            <IconButton
              icon={<Archive size={16} color={theme.colors.ink} />}
              onPress={() => store.saveLift({ ...lift, archivedAt: lift.archivedAt ? null : today, inProgram: false })}
            />
          </View>
        </View>

        <Appear>
          <View style={{ marginTop: theme.spacing.lg }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: groupColors[lift.group] }} />
              <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>
                {GROUP_LABELS[lift.group]} · {lift.kind === "compound" ? "main lift" : "accessory"}
                {lift.bodyweight ? " · bodyweight" : ""}
                {lift.archivedAt ? " · archived" : ""}
              </Text>
            </View>
            <Text style={{ ...theme.typography.title, color: theme.colors.ink, marginTop: 2 }}>{lift.name}</Text>
          </View>
        </Appear>

        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
          <StatTile label="Estimated max" value={estimate ? `${Math.round(estimate.e1rm)} kg` : "—"} hint={estimate ? `±${Math.round(estimate.high - estimate.e1rm)} kg` : "no sets yet"} />
          <StatTile label="Model trust" value={estimate ? `${Math.round(estimate.confidence * 100)}%` : "—"} hint={estimate ? `${estimate.samples} sessions · ${estimate.daysSince}d ago` : ""} />
        </View>
        {lift.bodyweight && estimate ? (
          <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint, marginTop: 4 }}>
            Includes your {settings.bodyweight} kg bodyweight — the added weight is what goes on the belt.
          </Text>
        ) : null}

        {/* --- тренд --- */}
        <Appear delay={60}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Is it going up" />
            <View style={{ padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface }}>
              <Sparkline values={values} trend={sparkTrend} color={groupColors[lift.group]} height={52} />
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: theme.spacing.sm }}>
                {trend.verdict === "rising" ? (
                  <TrendingUp size={16} color={theme.colors.success} />
                ) : trend.verdict === "falling" ? (
                  <TrendingDown size={16} color={theme.colors.danger} />
                ) : (
                  <Waves size={16} color={theme.colors.inkFaint} />
                )}
                <Text style={{ ...theme.typography.caption, color: theme.colors.ink, flex: 1 }}>{verdictText}</Text>
              </View>
            </View>
          </View>
        </Appear>

        {/* --- сетка весов --- */}
        <Appear delay={90}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Working weights" />
            {estimate ? (
              <View style={{ borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, overflow: "hidden" }}>
                <View style={{ flexDirection: "row", backgroundColor: theme.colors.surfaceAlt, paddingVertical: theme.spacing.sm }}>
                  <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, flex: 1, textAlign: "center" }}>reps</Text>
                  {GRID_RPE.map((rpe) => (
                    <Text key={rpe} style={{ ...theme.typography.caption, color: theme.colors.inkMuted, flex: 1, textAlign: "center" }}>
                      @{rpe}
                    </Text>
                  ))}
                </View>
                {GRID_REPS.map((reps) => (
                  <View key={reps} style={{ flexDirection: "row", paddingVertical: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                    <Text style={{ ...theme.typography.label, color: theme.colors.ink, flex: 1, textAlign: "center" }}>{reps}</Text>
                    {GRID_RPE.map((rpe) => {
                      const p = prescribe(estimate.e1rm, reps, rpe, lift, settings.bodyweight);
                      return (
                        <Text key={rpe} style={{ ...theme.typography.body, color: theme.colors.ink, flex: 1, textAlign: "center", fontVariant: ["tabular-nums"] }}>
                          {p.bodyweightOnly ? "BW" : lift.bodyweight ? `+${formatWeight(p.weight)}` : formatWeight(p.weight)}
                        </Text>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : (
              <Notice icon={<Waves size={16} color={theme.colors.inkFaint} />} title="Log one set with an effort rating" body="The grid fills from the estimated max — one session is enough to start, and it sharpens with every one after." />
            )}
            <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint, marginTop: theme.spacing.sm }}>
              Rounded down to your {lift.increment} kg step — half a step short is safer than half a step over.
            </Text>
          </View>
        </Appear>

        {/* --- история --- */}
        <Appear delay={120}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Every session" />
            {history.length === 0 ? (
              <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>Nothing logged yet.</Text>
            ) : (
              [...history].reverse().slice(0, 30).map((point, index) => (
                <Appear key={point.date + index} delay={staggerDelay(index)}>
                  <KeyValue label={`${formatShort(point.date)} · top set ${point.topSet}`} value={`${Math.round(point.e1rm)} kg`} />
                </Appear>
              ))
            )}
          </View>
        </Appear>
      </ScrollView>

      <Sheet
        visible={editing}
        title={`Edit ${lift.name}`}
        onClose={() => setEditing(false)}
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <PrimaryButton
              label="Save"
              onPress={async () => {
                const step = Number(increment.replace(",", "."));
                await store.saveLift({
                  ...lift,
                  increment: Number.isFinite(step) && step > 0 ? step : lift.increment,
                  aliases: aliases.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
                });
                setEditing(false);
              }}
            />
            <SecondaryButton label="Cancel" onPress={() => setEditing(false)} />
          </View>
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.spacing.md }}>
          <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
            <Text style={{ ...theme.typography.body, color: theme.colors.ink }}>In my program</Text>
            <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint }}>The planner builds sessions only from program lifts.</Text>
          </View>
          <Toggle value={lift.inProgram} onValueChange={(value) => store.saveLift({ ...lift, inProgram: value })} />
        </View>
        <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, marginBottom: 6 }}>Weight step</Text>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
          {["1", "1.25", "2.5", "5"].map((value) => (
            <Chip key={value} label={`${value} kg`} compact selected={increment === value} onPress={() => setIncrement(value)} />
          ))}
        </View>
        <Field label="Short names you type" value={aliases} onChangeText={setAliases} hint="Comma separated — the console understands any of them." />
      </Sheet>
      <TopScrim height={insets.top} />
    </View>
  );
}
