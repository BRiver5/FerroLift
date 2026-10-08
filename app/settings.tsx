import { useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../src/theme";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { Card } from "../src/components/Card";
import { Toggle } from "../src/components/Toggle";
import { requestNotificationPermission, cancelAll } from "../src/services/notifications";

// ПРИМЕР экрана настроек. Удаляй/дополняй пункты под конкретное приложение —
// сохраняй только сам паттерн (Card-строка с Toggle справа).
export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState(false);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top + theme.spacing.lg,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <ScreenHeader title="Настройки" />

      <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: theme.colors.ink, ...theme.typography.body }}>Уведомления</Text>
        <Toggle
          value={notifications}
          onValueChange={async (value) => {
            if (value) {
              const granted = await requestNotificationPermission();
              setNotifications(granted);
            } else {
              await cancelAll();
              setNotifications(false);
            }
          }}
        />
      </Card>
    </View>
  );
}
