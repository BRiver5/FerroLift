import { Text, View } from "react-native";
import { useTheme } from "../theme";

type Props = {
  title: string;
  description?: string;
};

// Пустое состояние — обязательный экран для любого списка/статистики.
// Никаких моковых/демо-записей вместо реальных данных: если данных нет,
// показываем это состояние, а не заглушку.
export function EmptyState({ title, description }: Props) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: theme.spacing.xxxl }}>
      <Text style={{ color: theme.colors.ink, ...theme.typography.subtitle, textAlign: "center" }}>{title}</Text>
      {description ? (
        <Text
          style={{
            color: theme.colors.inkMuted,
            ...theme.typography.body,
            textAlign: "center",
            marginTop: theme.spacing.sm,
          }}
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}
