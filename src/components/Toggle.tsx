import { Switch } from "react-native";
import { useTheme } from "../theme";

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function Toggle({ value, onValueChange }: Props) {
  const theme = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: theme.colors.surfaceAlt, true: theme.colors.accent }}
      thumbColor={theme.colors.onAccent}
    />
  );
}
