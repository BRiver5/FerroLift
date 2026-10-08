import { Text } from "react-native";
import { useTheme } from "../theme";
import { haptics } from "../services/haptics";
import { PressableScale } from "./PressableScale";

type Props = {
  label: string;
  onPress: () => void;
};

export function SecondaryButton({ label, onPress }: Props) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.pill,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.xl,
        alignItems: "center",
      }}
    >
      <Text style={{ color: theme.colors.ink, ...theme.typography.subtitle }}>{label}</Text>
    </PressableScale>
  );
}
