import { Text } from "react-native";
import { useTheme } from "../theme";
import { haptics } from "../services/haptics";
import { PressableScale } from "./PressableScale";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function PrimaryButton({ label, onPress, disabled }: Props) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={() => {
        if (disabled) return;
        haptics.press();
        onPress();
      }}
      disabled={disabled}
      style={{
        backgroundColor: theme.colors.accent,
        opacity: disabled ? 0.5 : 1,
        borderRadius: theme.radius.pill,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.xl,
        alignItems: "center",
      }}
    >
      <Text style={{ color: theme.colors.onAccent, ...theme.typography.subtitle }}>{label}</Text>
    </PressableScale>
  );
}
