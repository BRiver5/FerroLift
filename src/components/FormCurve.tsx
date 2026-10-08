import { useEffect, useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme";
import { formatShort } from "../lib/dates.ts";

const AnimatedPath = Animated.createAnimatedComponent(Path);

export type CurvePoint = { date: string; fitness: number; fatigue: number; form: number };

/**
 * FormCurve — сигнатурный виджет FerroLift: три кривые модели нагрузки на
 * одной оси времени — готовность (42-дневная), усталость (7-дневная) и форма
 * (их разность, на отдельной нулевой линии). Прошлое сплошной линией,
 * прогноз недели — пунктиром, граница "сегодня" — вертикальной чертой,
 * целевой день — маркером.
 *
 * Не BarChart и не Heatmap портфеля: здесь главное — расхождение двух
 * скоростей одной и той же нагрузки, и как форма проваливается после
 * тяжёлого дня и выходит в плюс после отдыха.
 */
export function FormCurve({
  history,
  projection,
  targetDate,
  height = 168,
}: {
  history: CurvePoint[];
  projection: CurvePoint[];
  targetDate?: string | null;
  height?: number;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  const all = useMemo(() => [...history, ...projection], [history, projection]);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(80, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [all.length, projection.map((p) => p.form.toFixed(0)).join(",")]);

  const geometry = useMemo(() => {
    if (width <= 0 || all.length < 2) return null;
    const padTop = 10;
    const formBand = height * 0.32;
    const loadBand = height - formBand - padTop - 14;
    const maxLoad = Math.max(1, ...all.map((p) => Math.max(p.fitness, p.fatigue)));
    const maxAbsForm = Math.max(1, ...all.map((p) => Math.abs(p.form)));
    const xOf = (i: number) => (i / (all.length - 1)) * width;
    const yLoad = (v: number) => padTop + loadBand - (v / maxLoad) * loadBand;
    const formZero = padTop + loadBand + 14 + formBand / 2;
    const yForm = (v: number) => formZero - (v / maxAbsForm) * (formBand / 2 - 2);

    const pathOf = (from: number, to: number, y: (p: CurvePoint) => number) => {
      let d = "";
      for (let i = from; i <= to; i++) d += `${i === from ? "M" : "L"}${xOf(i).toFixed(1)},${y(all[i]).toFixed(1)}`;
      return d;
    };

    const split = history.length - 1;
    const last = all.length - 1;
    const targetIndex = targetDate ? all.findIndex((p) => p.date === targetDate) : -1;

    return {
      formZero,
      todayX: xOf(Math.max(0, split)),
      fitnessPast: pathOf(0, Math.max(0, split), (p) => yLoad(p.fitness)),
      fitnessNext: split < last ? pathOf(split, last, (p) => yLoad(p.fitness)) : "",
      fatiguePast: pathOf(0, Math.max(0, split), (p) => yLoad(p.fatigue)),
      fatigueNext: split < last ? pathOf(split, last, (p) => yLoad(p.fatigue)) : "",
      formPast: pathOf(0, Math.max(0, split), (p) => yForm(p.form)),
      formNext: split < last ? pathOf(split, last, (p) => yForm(p.form)) : "",
      target: targetIndex >= 0 ? { x: xOf(targetIndex), y: yForm(all[targetIndex].form) } : null,
      // Длина пути для анимации рисования — с запасом, точная длина SVG-пути
      // на RN недоступна без нативного измерения.
      dash: width * 3,
    };
  }, [width, height, all, history.length, targetDate]);

  // Все числа посчитаны в JS; в ворклет уходит только dash — вызовов функций
  // модуля внутри useAnimatedProps нет (повторяющийся баг портфеля).
  const dash = geometry?.dash ?? 1;
  const drawProps = useAnimatedProps(() => ({ strokeDashoffset: dash * (1 - progress.value) }));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View>
      <View onLayout={onLayout} style={{ height }}>
        {geometry ? (
          <Svg width={width} height={height}>
            <Rect x={geometry.todayX} y={0} width={Math.max(0, width - geometry.todayX)} height={height} fill={theme.colors.surfaceAlt} />
            <Line x1={0} x2={width} y1={geometry.formZero} y2={geometry.formZero} stroke={theme.colors.border} strokeWidth={1} />
            <Line x1={geometry.todayX} x2={geometry.todayX} y1={0} y2={height} stroke={theme.colors.inkFaint} strokeWidth={1} strokeDasharray="2,3" />

            <AnimatedPath d={geometry.fatiguePast} stroke={theme.colors.inkFaint} strokeWidth={1.5} fill="none" strokeDasharray={`${dash}`} animatedProps={drawProps} />
            <Path d={geometry.fatigueNext} stroke={theme.colors.inkFaint} strokeWidth={1.5} fill="none" strokeDasharray="4,4" />

            <AnimatedPath d={geometry.fitnessPast} stroke={theme.colors.ink} strokeWidth={2.2} fill="none" strokeDasharray={`${dash}`} animatedProps={drawProps} />
            <Path d={geometry.fitnessNext} stroke={theme.colors.ink} strokeWidth={2.2} fill="none" strokeDasharray="5,4" />

            <AnimatedPath d={geometry.formPast} stroke={theme.colors.accent} strokeWidth={2.4} fill="none" strokeDasharray={`${dash}`} animatedProps={drawProps} />
            <Path d={geometry.formNext} stroke={theme.colors.accent} strokeWidth={2.4} fill="none" strokeDasharray="5,4" />

            {geometry.target ? (
              <Circle cx={geometry.target.x} cy={geometry.target.y} r={5} fill={theme.colors.surface} stroke={theme.colors.accent} strokeWidth={2.5} />
            ) : null}
          </Svg>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ ...theme.typography.caption, color: theme.colors.inkFaint }}>Log a session and the curves start here</Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={{ ...theme.typography.caption, fontSize: 10, color: theme.colors.inkFaint }}>{all[0] ? formatShort(all[0].date) : ""}</Text>
        <Text style={{ ...theme.typography.caption, fontSize: 10, color: theme.colors.inkFaint }}>today ┊ plan</Text>
        <Text style={{ ...theme.typography.caption, fontSize: 10, color: theme.colors.inkFaint }}>
          {all.length ? formatShort(all[all.length - 1].date) : ""}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.sm, flexWrap: "wrap" }}>
        <Legend color={theme.colors.ink} label="Fitness · 42d" />
        <Legend color={theme.colors.inkFaint} label="Fatigue · 7d" />
        <Legend color={theme.colors.accent} label="Form = fitness − fatigue" />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ ...theme.typography.caption, fontSize: 11, color: theme.colors.inkMuted }}>{label}</Text>
    </View>
  );
}
