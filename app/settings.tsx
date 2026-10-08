import { useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Brain, CalendarCheck, Dumbbell, Plus, Search, ShieldCheck } from "lucide-react-native";
import { useAppStore } from "../src/store/appStore";
import { useTheme } from "../src/theme";
import { groupColors } from "../src/theme/colors";
import { Appear, Chip, Field, IconButton, KeyValue, Notice, SectionTitle, Segmented, Sheet, TopScrim } from "../src/components/Bits";
import { Toggle } from "../src/components/Toggle";
import { PrimaryButton } from "../src/components/PrimaryButton";
import { SecondaryButton } from "../src/components/SecondaryButton";
import { PressableScale } from "../src/components/PressableScale";
import { weekdayName } from "../src/lib/dates.ts";
import { GROUP_LABELS, type LiftKind, type MuscleGroup } from "../src/lib/model.ts";
import { newLiftId } from "../src/data/repo";

const GROUPS: MuscleGroup[] = ["legs", "push", "pull", "hinge", "core", "arms"];

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const store = useAppStore();
  const { settings, lifts, strength, sessions } = store;
  const c = settings.constraints;

  const [bodyweight, setBodyweight] = useState(String(settings.bodyweight));
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState<MuscleGroup>("legs");
  const [newKind, setNewKind] = useState<LiftKind>("accessory");

  const visibleLifts = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return lifts
      .filter((lift) => lift.archivedAt === null)
      .filter((lift) => !needle || lift.name.toLowerCase().includes(needle) || lift.aliases.some((a) => a.includes(needle)))
      .sort((a, b) => Number(b.inProgram) - Number(a.inProgram) || GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name));
  }, [lifts, filter]);

  const programCount = lifts.filter((lift) => lift.inProgram && lift.archivedAt === null).length;

  const toggleWeekday = (day: number) => {
    const next = c.availableWeekdays.includes(day) ? c.availableWeekdays.filter((d) => d !== day) : [...c.availableWeekdays, day].sort();
    store.updateConstraints({ availableWeekdays: next });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingTop: insets.top + theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.xxl }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <IconButton icon={<ArrowLeft size={18} color={theme.colors.ink} />} onPress={() => router.back()} />
          <Text style={{ ...theme.typography.subtitle, color: theme.colors.ink }}>Settings</Text>
        </View>

        {/* --- когда тренируешься --- */}
        <Appear>
          <View style={{ marginTop: theme.spacing.lg }}>
            <SectionTitle title="When you can train" trailing={<CalendarCheck size={14} color={theme.colors.inkFaint} />} />
            <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <PressableScale
                  key={day}
                  scaleTo={0.9}
                  onPress={() => toggleWeekday(day)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: theme.spacing.sm,
                    borderRadius: theme.radius.sm,
                    backgroundColor: c.availableWeekdays.includes(day) ? theme.colors.accent : theme.colors.surface,
                  }}
                >
                  <Text style={{ ...theme.typography.label, fontSize: 12, color: c.availableWeekdays.includes(day) ? theme.colors.onAccent : theme.colors.inkMuted }}>
                    {weekdayName(day)}
                  </Text>
                </PressableScale>
              ))}
            </View>
            <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, marginTop: theme.spacing.md, marginBottom: 6 }}>At least this many sessions a week</Text>
            <Segmented
              value={c.minTrainingDays}
              onChange={(value) => store.updateConstraints({ minTrainingDays: value, maxTrainingDays: Math.max(value, c.maxTrainingDays) })}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            />
            <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, marginTop: theme.spacing.md, marginBottom: 6 }}>And at most</Text>
            <Segmented
              value={c.maxTrainingDays}
              onChange={(value) => store.updateConstraints({ maxTrainingDays: Math.max(value, c.minTrainingDays) })}
              options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
            />
          </View>
        </Appear>

        {/* --- правила --- */}
        <Appear delay={60}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Guard rails" trailing={<ShieldCheck size={14} color={theme.colors.inkFaint} />} />
            <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, marginBottom: 6 }}>Ramp ceiling — this week vs your usual</Text>
            <Segmented
              value={c.acwrCap}
              onChange={(value) => store.updateConstraints({ acwrCap: value })}
              options={[1.2, 1.3, 1.4, 1.5].map((v) => ({ value: v, label: `${v.toFixed(1)}×` }))}
            />
            <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint, marginTop: 6 }}>
              1.3× is the common upper edge of a steady build. It only applies after three weeks of history.
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: theme.spacing.md }}>
              <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
                <Text style={{ ...theme.typography.body, color: theme.colors.ink }}>Two hard days in a row</Text>
                <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint }}>Off by default: the second one starts under yesterday's fatigue.</Text>
              </View>
              <Toggle value={c.allowBackToBackHard} onValueChange={(value) => store.updateConstraints({ allowBackToBackHard: value })} />
            </View>
            <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, marginTop: theme.spacing.md, marginBottom: 6 }}>When peaking, fitness you'll trade for freshness</Text>
            <Segmented
              value={c.maxFitnessDropPct}
              onChange={(value) => store.updateConstraints({ maxFitnessDropPct: value })}
              options={[3, 6, 10].map((v) => ({ value: v, label: `${v}%` }))}
            />
          </View>
        </Appear>

        {/* --- тело --- */}
        <Appear delay={90}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="Bodyweight" />
            <Field
              label="Kilograms"
              value={bodyweight}
              onChangeText={(value) => {
                setBodyweight(value);
                const parsed = Number(value.replace(",", "."));
                if (Number.isFinite(parsed) && parsed >= 30 && parsed <= 250) store.updateSettings({ bodyweight: parsed });
              }}
              keyboardType="decimal-pad"
              hint="Used for pull-ups, dips and other bodyweight lifts: the max is estimated on you plus the belt."
            />
          </View>
        </Appear>

        {/* --- программа --- */}
        <Appear delay={120}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle
              title={`Program · ${programCount} lifts`}
              trailing={
                <PressableScale scaleTo={0.9} onPress={() => setAdding(true)}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Plus size={14} color={theme.colors.accent} />
                    <Text style={{ ...theme.typography.caption, color: theme.colors.accent }}>Add lift</Text>
                  </View>
                </PressableScale>
              }
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.sm }}>
              <Search size={15} color={theme.colors.inkFaint} />
              <TextInput
                value={filter}
                onChangeText={setFilter}
                placeholder="Find a lift"
                placeholderTextColor={theme.colors.inkFaint}
                style={{ ...theme.typography.caption, color: theme.colors.ink, flex: 1, paddingVertical: theme.spacing.sm }}
              />
            </View>
            {visibleLifts.map((lift) => (
              <View key={lift.id} style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, paddingVertical: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: groupColors[lift.group] }} />
                <PressableScale scaleTo={0.98} onPress={() => router.push(`/lift/${lift.id}`)} style={{ flex: 1 }}>
                  <Text style={{ ...theme.typography.body, color: theme.colors.ink }}>{lift.name}</Text>
                  <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint }}>
                    {GROUP_LABELS[lift.group]} · types as {lift.aliases.slice(0, 2).join(", ") || lift.name.toLowerCase()}
                    {strength[lift.id] ? ` · e1RM ${Math.round(strength[lift.id].e1rm)}` : ""}
                  </Text>
                </PressableScale>
                <Toggle value={lift.inProgram} onValueChange={(value) => store.saveLift({ ...lift, inProgram: value })} />
              </View>
            ))}
          </View>
        </Appear>

        {/* --- модель --- */}
        <Appear delay={150}>
          <View style={{ marginTop: theme.spacing.xl }}>
            <SectionTitle title="What the app has learned" trailing={<Brain size={14} color={theme.colors.inkFaint} />} />
            <Notice
              icon={<Brain size={16} color={theme.colors.accent} />}
              title={`${Object.keys(strength).length} lifts modelled from ${sessions.length} sessions`}
              body="Each session nudges the estimated max: quickly at first, then at a steady quarter step, and a jump of more than a quarter is clipped — a slipped zero shouldn't rewrite your squat."
            />
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
              <SecondaryButton label="Rebuild from every session" onPress={() => store.relearnStrength()} />
              <SecondaryButton label="Forget the estimates" onPress={() => store.forgetStrength()} />
            </View>
            <View style={{ marginTop: theme.spacing.lg }}>
              <KeyValue label="Data" value="on this phone only" />
              <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint }}>
                No account, no sync, no network. Everything lives in a local database.
              </Text>
            </View>
          </View>
        </Appear>
      </ScrollView>

      <Sheet
        visible={adding}
        title="New lift"
        onClose={() => setAdding(false)}
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <PrimaryButton
              label="Add"
              disabled={newName.trim().length < 2}
              onPress={async () => {
                const name = newName.trim();
                await store.saveLift({
                  id: await newLiftId(),
                  name,
                  group: newGroup,
                  kind: newKind,
                  increment: newKind === "compound" ? 2.5 : 1,
                  aliases: [name.toLowerCase()],
                  bodyweight: false,
                  inProgram: true,
                  archivedAt: null,
                });
                setNewName("");
                setAdding(false);
              }}
            />
            <SecondaryButton label="Cancel" onPress={() => setAdding(false)} />
          </View>
        }
      >
        <Field label="Name" value={newName} onChangeText={setNewName} placeholder="Cable row" />
        <Text style={{ ...theme.typography.caption, color: theme.colors.inkMuted, marginBottom: 6 }}>Muscle group</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
          {GROUPS.map((g) => (
            <Chip key={g} label={GROUP_LABELS[g]} compact tone={groupColors[g]} selected={newGroup === g} onPress={() => setNewGroup(g)} />
          ))}
        </View>
        <Segmented
          value={newKind}
          onChange={setNewKind}
          options={[
            { value: "compound", label: "Main lift" },
            { value: "accessory", label: "Accessory" },
          ]}
        />
        <View style={{ height: theme.spacing.md }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Dumbbell size={13} color={theme.colors.inkFaint} />
          <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkFaint }}>Main lifts get heavier, lower-rep work in the plan.</Text>
        </View>
      </Sheet>
      <TopScrim height={insets.top} />
    </View>
  );
}
