import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BarChart3, CalendarRange, CircleAlert, CornerDownLeft, Gauge, Settings as SettingsIcon, Timer } from "lucide-react-native";
import { useAppStore } from "../src/store/appStore";
import { useTheme } from "../src/theme";
import { groupColors, sizeColors, zoneColors } from "../src/theme/colors";
import { Appear, Chip, Field, IconButton, SectionTitle, Sheet, SwipeableRow } from "../src/components/Bits";
import { PrimaryButton } from "../src/components/PrimaryButton";
import { SecondaryButton } from "../src/components/SecondaryButton";
import { PressableScale } from "../src/components/PressableScale";
import { describeSets, formatWeight, parseLine, type ParseResult } from "../src/lib/parse.ts";
import { sessionLoad, zoneOf } from "../src/lib/load.ts";
import { estimateLift, sessionObservation } from "../src/lib/strength.ts";
import { addDays, formatShort, todayIso, weekdayShort } from "../src/lib/dates.ts";
import { SIZE_LABELS, type Lift, type SetEntry } from "../src/lib/model.ts";
import { haptics } from "../src/services/haptics";

/**
 * Console — layout-архетип "Chat/Log Console": журнал тренировок снизу вверх,
 * как переписка, с разделителями-датами (липкими), и закреплённая внизу
 * строка ввода. Подход записывается одной строкой — "squat 100x5x3 @8" —
 * и до отправки виден разбор: что понял парсер, какое упражнение, какой
 * получится e1RM. Отправка — только явной кнопкой, не по пробелу и не
 * автоматически: тихая запись того, что парсер понял не так, хуже лишнего
 * нажатия.
 */
export default function ConsoleScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const store = useAppStore();
  const { ready, lifts, sessions, sets, strength, settings } = store;
  const scrollRef = useRef<ScrollView>(null);
  // Высота клавиатуры с UI-потока Reanimated. Два предыдущих способа на
  // эмуляторе (Expo SDK 54, edge-to-edge) не сработали: KeyboardAvoidingView
  // прятал строку ввода под клавиатуру, а события Keyboard.addListener не
  // поднимали её вовсе. useAnimatedKeyboard читает инсеты окна напрямую.
  const keyboard = useAnimatedKeyboard();
  const restPadding = insets.bottom + theme.spacing.sm;
  const openPadding = theme.spacing.sm;
  const inputBarStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.height.value > 0 ? keyboard.height.value + openPadding : restPadding,
  }));

  const [line, setLine] = useState("");
  const [metaOpen, setMetaOpen] = useState(false);
  const [rpeDraft, setRpeDraft] = useState("");
  const [minutesDraft, setMinutesDraft] = useState("");
  const [menuLift, setMenuLift] = useState<{ lift: Lift; sets: SetEntry[] } | null>(null);

  useEffect(() => {
    if (!ready) store.init();
  }, [ready]);

  const today = todayIso();
  const parsed: ParseResult | null = useMemo(() => (line.trim() ? parseLine(line, lifts) : null), [line, lifts]);
  const week = useMemo(() => (ready ? store.week() : null), [ready, lifts, sessions, sets, strength, settings, store.overrides]);
  const now = week?.snap.now ?? null;
  const rampActive = (week?.snap.request.historyDays ?? 0) >= 21;

  const liftById = useMemo(() => new Map(lifts.map((lift) => [lift.id, lift])), [lifts]);

  // Журнал: последние три недели, старые сверху — как в мессенджере.
  const days = useMemo(() => {
    const recent = [...sessions].sort((a, b) => a.date.localeCompare(b.date)).filter((s) => s.date >= addDays(today, -21));
    return recent
      .map((session) => {
        const own = sets.filter((set) => set.sessionId === session.id).sort((a, b) => a.order - b.order);
        const blocks: { lift: Lift; sets: SetEntry[] }[] = [];
        for (const set of own) {
          const lift = liftById.get(set.liftId);
          if (!lift) continue;
          const last = blocks[blocks.length - 1];
          if (last && last.lift.id === lift.id) last.sets.push(set);
          else blocks.push({ lift, sets: [set] });
        }
        return { session, blocks, load: sessionLoad(session, sets) };
      })
      .filter((day) => day.blocks.length > 0 || day.session.rpe !== null);
  }, [sessions, sets, liftById, today]);

  // Пресеты над строкой ввода: сегодняшний план (если сегодня тренировочный
  // день) и "как в прошлый раз" по последним упражнениям.
  const presets = useMemo(() => {
    const out: { label: string; text: string; tone?: string }[] = [];
    const program = week?.programs[today];
    if (program) {
      for (const item of program.lifts) {
        const p = item.prescription;
        const weight = p ? (p.bodyweightOnly ? "bw" : item.lift.bodyweight ? `bw+${formatWeight(p.weight)}` : formatWeight(p.weight)) : "";
        if (!weight) continue;
        out.push({
          label: `${item.lift.name} ${weight}×${item.reps}×${item.sets}`,
          text: `${item.lift.aliases[0] ?? item.lift.name} ${weight}x${item.reps}x${item.sets} @${item.rpe}`,
          tone: groupColors[item.lift.group],
        });
      }
    }
    const seen = new Set<string>();
    for (const set of [...sets].sort((a, b) => b.order - a.order)) {
      if (seen.size >= 4) break;
      if (seen.has(set.liftId)) continue;
      const lift = liftById.get(set.liftId);
      if (!lift) continue;
      seen.add(set.liftId);
      const weight = lift.bodyweight ? (set.weight > 0 ? `bw+${formatWeight(set.weight)}` : "bw") : formatWeight(set.weight);
      // Полное имя, а не первое слово: "Barbell 33×10" и "Barbell 75×8" на
      // эмуляторе оказались сгибанием и тягой — различить было нельзя.
      out.push({ label: `↻ ${lift.name} ${weight}×${set.reps}`, text: `${lift.aliases[0] ?? lift.name} ${weight}x${set.reps}` });
    }
    return out;
  }, [week, sets, liftById, today]);

  const submit = async () => {
    if (!parsed) return;
    if (parsed.kind === "error") {
      haptics.error();
      return;
    }
    if (parsed.kind === "session") {
      await store.setSessionMeta(today, { rpe: parsed.rpe, minutes: parsed.minutes });
    } else {
      await store.logSets(today, parsed.lift, parsed.sets);
    }
    haptics.success();
    setLine("");
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  if (!ready) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;

  const children: React.ReactNode[] = [];
  const sticky: number[] = [];

  children.push(
    <View key="intro" style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
      <Text style={{ ...theme.typography.caption, color: theme.colors.inkFaint }}>
        Last three weeks of training. Older sessions live on each lift's page.
      </Text>
    </View>
  );

  if (days.length === 0) {
    children.push(
      <View key="empty" style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.xxl }}>
        <Text style={{ ...theme.typography.subtitle, color: theme.colors.ink }}>Your log starts with one line</Text>
        <Text style={{ ...theme.typography.body, color: theme.colors.inkMuted, marginTop: theme.spacing.sm }}>
          Type a lift the way you'd scribble it in a notebook — squat 100x5x3 @8, bench 80 x 8, 8, 7, pullup bw+10 x6 — and
          send. Effort after @ is how hard the set felt out of 10; leave it off and FerroLift assumes two reps left in the tank.
        </Text>
      </View>
    );
  }

  days.forEach((day, dayIndex) => {
    sticky.push(children.length);
    const isToday = day.session.date === today;
    children.push(
      <View key={`h-${day.session.id}`} style={{ backgroundColor: theme.colors.background, paddingVertical: theme.spacing.xs }}>
        <SectionTitle
          sticky
          title={isToday ? "Today" : `${weekdayShort(day.session.date)} ${formatShort(day.session.date)}`}
          trailing={
            <Text style={{ ...theme.typography.caption, color: theme.colors.inkFaint }}>
              load {day.load.load}
              {day.load.estimated ? " · est." : ""}
            </Text>
          }
        />
      </View>
    );

    day.blocks.forEach((block, blockIndex) => {
      const value = sessionObservation(block.sets, block.lift, settings.bodyweight);
      children.push(
        <View key={`${day.session.id}-${blockIndex}`} style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
          <Appear delay={dayIndex === days.length - 1 ? blockIndex * 60 : 0}>
            <SwipeableRow
              leftLabel="Delete"
              onSwipeLeft={async () => {
                for (const set of block.sets) await store.removeSet(set.id);
              }}
            >
              <Pressable
                onPress={() => router.push(`/lift/${block.lift.id}`)}
                onLongPress={() => {
                  haptics.press();
                  setMenuLift(block);
                }}
                delayLongPress={320}
                style={{
                  flexDirection: "row",
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.radius.md,
                  overflow: "hidden",
                }}
              >
                <View style={{ width: 4, backgroundColor: groupColors[block.lift.group] }} />
                <View style={{ flex: 1, padding: theme.spacing.md }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ ...theme.typography.label, color: theme.colors.ink }}>{block.lift.name}</Text>
                    {value !== null ? (
                      <Text style={{ ...theme.typography.caption, color: theme.colors.inkFaint }}>e1RM {Math.round(value)}</Text>
                    ) : null}
                  </View>
                  <Text style={{ ...theme.typography.body, color: theme.colors.ink, marginTop: 2, fontVariant: ["tabular-nums"] }}>
                    {describeSets(block.sets)}
                  </Text>
                </View>
              </Pressable>
            </SwipeableRow>
          </Appear>
        </View>
      );
    });

    if (day.session.rpe !== null || day.session.minutes !== null) {
      children.push(
        <View key={`m-${day.session.id}`} style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm, alignItems: "flex-end" }}>
          <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted }}>
            session effort {day.session.rpe ?? "—"} · {day.session.minutes ?? "—"} min
          </Text>
        </View>
      );
    }
  });

  const todayPlan = week?.shown?.days.find((day) => day.date === today) ?? null;
  const zone = rampActive ? zoneOf(now?.acwr ?? null) : null;

  return (
<View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ paddingTop: insets.top + theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, backgroundColor: theme.colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ ...theme.typography.title, color: theme.colors.ink }}>FerroLift</Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <IconButton icon={<CalendarRange size={18} color={theme.colors.ink} />} onPress={() => router.push("/plan")} />
            <IconButton icon={<BarChart3 size={18} color={theme.colors.ink} />} onPress={() => router.push("/stats")} />
            <IconButton icon={<SettingsIcon size={18} color={theme.colors.ink} />} onPress={() => router.push("/settings")} />
          </View>
        </View>

        <PressableScale scaleTo={0.99} onPress={() => router.push("/plan")}>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <StatPill
              icon={<Gauge size={14} color={theme.colors.accent} />}
              label="Form"
              // Форма в процентах от готовности: сырое "−87" не имеет шкалы и
              // только пугает, "−32%" читается как "устал на треть".
              value={now && now.fitness > 1 ? `${now.form >= 0 ? "+" : ""}${Math.round((now.form / now.fitness) * 100)}%` : "—"}
            />
            <StatPill
              icon={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: zone ? zoneColors[zone] : theme.colors.border }} />}
              label="Ramp"
              value={rampActive && now?.acwr != null ? `${now.acwr.toFixed(2)}×` : "baseline"}
            />
            <StatPill
              icon={<View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: todayPlan && todayPlan.size !== "rest" ? sizeColors[todayPlan.size] : theme.colors.border }} />}
              label={week?.snap.trainedToday ? "Done today" : "Today"}
              value={week?.snap.trainedToday ? "✓" : todayPlan ? SIZE_LABELS[todayPlan.size] : "—"}
            />
          </View>
        </PressableScale>
      </View>

      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={sticky}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >
        {children}
      </ScrollView>

      {/* --- строка ввода --- */}
      <Animated.View
        style={[
          {
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.backgroundAlt,
            paddingTop: theme.spacing.sm,
          },
          inputBarStyle,
        ]}
      >
        {presets.length > 0 && !line ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm }}>
            {presets.map((preset) => (
              <Chip key={preset.label} label={preset.label} compact onPress={() => setLine(preset.text)} />
            ))}
          </ScrollView>
        ) : null}

        {parsed ? (
          <ParsePreview
            result={parsed}
            onPick={(lift) => setLine(replaceLiftName(line, lift))}
            strengthHint={(lift) => estimateLift(strength, lift.id, today)?.e1rm ?? null}
          />
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm }}>
          <PressableScale
            scaleTo={0.9}
            onPress={() => {
              const meta = days.find((d) => d.session.date === today)?.session;
              setRpeDraft(meta?.rpe != null ? String(meta.rpe) : "");
              setMinutesDraft(meta?.minutes != null ? String(meta.minutes) : "");
              setMetaOpen(true);
            }}
            style={{ padding: theme.spacing.sm, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}
          >
            <Timer size={18} color={theme.colors.ink} />
          </PressableScale>
          <TextInput
            value={line}
            onChangeText={setLine}
            onSubmitEditing={submit}
            placeholder="squat 100x5x3 @8"
            placeholderTextColor={theme.colors.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            style={{
              flex: 1,
              ...theme.typography.body,
              color: theme.colors.ink,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              borderColor: parsed?.kind === "error" ? theme.colors.danger : theme.colors.border,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.sm,
            }}
          />
          <PressableScale
            scaleTo={0.9}
            onPress={submit}
            disabled={!parsed || parsed.kind === "error"}
            style={{
              padding: theme.spacing.md,
              borderRadius: theme.radius.pill,
              backgroundColor: parsed && parsed.kind !== "error" ? theme.colors.accent : theme.colors.border,
            }}
          >
            <CornerDownLeft size={18} color={theme.colors.onAccent} />
          </PressableScale>
        </View>
      </Animated.View>

      <Sheet
        visible={metaOpen}
        title="Today's session"
        onClose={() => setMetaOpen(false)}
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <PrimaryButton
              label="Save"
              onPress={async () => {
                const rpe = Number(rpeDraft.replace(",", "."));
                const minutes = Number(minutesDraft);
                await store.setSessionMeta(today, {
                  rpe: Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : null,
                  minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
                });
                setMetaOpen(false);
              }}
            />
            <SecondaryButton label="Cancel" onPress={() => setMetaOpen(false)} />
          </View>
        }
      >
        <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, marginBottom: theme.spacing.md }}>
          How hard was the whole session out of 10, and how long. These two numbers are the session's training load (effort ×
          minutes) — without them FerroLift estimates both from your sets and marks the day as estimated.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
          {[5, 6, 7, 8, 9].map((value) => (
            <Chip key={value} label={`Effort ${value}`} compact selected={rpeDraft === String(value)} onPress={() => setRpeDraft(String(value))} />
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
          {[30, 45, 60, 75, 90].map((value) => (
            <Chip key={value} label={`${value} min`} compact selected={minutesDraft === String(value)} onPress={() => setMinutesDraft(String(value))} />
          ))}
        </View>
        <Field label="Effort (1-10)" value={rpeDraft} onChangeText={setRpeDraft} keyboardType="decimal-pad" />
        <Field label="Minutes" value={minutesDraft} onChangeText={setMinutesDraft} keyboardType="numeric" />
      </Sheet>

      <Sheet visible={menuLift !== null} title={menuLift?.lift.name ?? ""} onClose={() => setMenuLift(null)} footer={<SecondaryButton label="Close" onPress={() => setMenuLift(null)} />}>
        {menuLift ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text style={{ ...theme.typography.body, color: theme.colors.inkMuted }}>{describeSets(menuLift.sets)}</Text>
            <PrimaryButton
              label="Open lift history"
              onPress={() => {
                const id = menuLift.lift.id;
                setMenuLift(null);
                router.push(`/lift/${id}`);
              }}
            />
            <SecondaryButton
              label="Log it again"
              onPress={() => {
                const s = menuLift.sets[0];
                const weight = menuLift.lift.bodyweight ? (s.weight > 0 ? `bw+${formatWeight(s.weight)}` : "bw") : formatWeight(s.weight);
                setLine(`${menuLift.lift.aliases[0] ?? menuLift.lift.name} ${weight}x${s.reps}x${menuLift.sets.length}${s.rpe !== null ? ` @${s.rpe}` : ""}`);
                setMenuLift(null);
              }}
            />
            <SecondaryButton
              label={`Delete ${menuLift.sets.length} set${menuLift.sets.length === 1 ? "" : "s"}`}
              onPress={async () => {
                for (const set of menuLift.sets) await store.removeSet(set.id);
                setMenuLift(null);
              }}
            />
          </View>
        ) : null}
      </Sheet>

    </View>
  );
}

/**
 * Подставить выбранное упражнение вместо того, что пользователь напечатал как
 * имя, — и не тронуть цифры. Имя — всё до первого токена с цифрой, "bw", "+"
 * или "@" (то же правило, что в парсере).
 */
function replaceLiftName(line: string, lift: Lift): string {
  const tokens = line.trim().split(/\s+/);
  const firstData = tokens.findIndex((token) => /^(\d|bw|\+|@)/i.test(token));
  const rest = firstData >= 0 ? tokens.slice(firstData).join(" ") : "";
  return `${lift.aliases[0] ?? lift.name.toLowerCase()} ${rest}`.trim() + (rest ? "" : " ");
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
      }}
    >
      {icon}
      <View>
        <Text style={{ ...theme.typography.caption, fontSize: 10, color: theme.colors.inkFaint }}>{label}</Text>
        <Text style={{ ...theme.typography.label, color: theme.colors.ink }}>{value}</Text>
      </View>
    </View>
  );
}

/** Строка разбора над полем ввода: что понял парсер — до отправки. */
function ParsePreview({
  result,
  onPick,
  strengthHint,
}: {
  result: ParseResult;
  onPick: (lift: Lift) => void;
  strengthHint: (lift: Lift) => number | null;
}) {
  const theme = useTheme();
  if (result.kind === "error") {
    return (
      <View style={{ paddingHorizontal: theme.spacing.lg, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <CircleAlert size={14} color={theme.colors.danger} />
          <Text style={{ ...theme.typography.caption, color: theme.colors.danger, flex: 1 }}>{result.message}</Text>
        </View>
        {result.suggestions.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            {result.suggestions.map((lift) => (
              <Chip key={lift.id} label={lift.name} compact onPress={() => onPick(lift)} />
            ))}
          </View>
        ) : null}
      </View>
    );
  }
  if (result.kind === "session") {
    return (
      <Text style={{ ...theme.typography.caption, color: theme.colors.success, paddingHorizontal: theme.spacing.lg }}>
        → session effort {result.rpe ?? "—"} · {result.minutes ?? "—"} min
      </Text>
    );
  }
  const known = strengthHint(result.lift);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: theme.spacing.lg }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: groupColors[result.lift.group] }} />
      <Text style={{ ...theme.typography.caption, color: theme.colors.success, flex: 1 }} numberOfLines={1}>
        → {result.lift.name} · {describeSets(result.sets)}
        {known !== null ? ` · current e1RM ${Math.round(known)}` : " · new lift for the model"}
      </Text>
    </View>
  );
}
