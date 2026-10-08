import { Text, View } from "react-native";
import { useTheme } from "../theme";

type Props = {
  title: string;
  subtitle?: string;
};

export function ScreenHeader({ title, subtitle }: Props) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: theme.spacing.lg }}>
      <Text style={{ color: theme.colors.ink, ...theme.typography.title }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: theme.colors.inkMuted, ...theme.typography.body, marginTop: theme.spacing.xs }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
