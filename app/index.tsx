import { useCallback, useEffect, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../src/theme";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { Card } from "../src/components/Card";
import { PrimaryButton } from "../src/components/PrimaryButton";
import { EmptyState } from "../src/components/EmptyState";
import { addItem, listItems, type Item } from "../src/data/items.example";

// ПРИМЕР главного экрана поверх items.example.ts. Замени на реальные экраны
// приложения — паттерн (загрузка через useFocusEffect, локальное состояние,
// EmptyState при пустом списке) переносится один в один.
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");

  const load = useCallback(() => {
    listItems().then(setItems);
  }, []);

  useFocusEffect(load);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top + theme.spacing.lg,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <ScreenHeader title="FerroLift" subtitle="Шаблонный экран — замени на свой." />

      <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Новая запись"
          placeholderTextColor={theme.colors.inkFaint}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            color: theme.colors.ink,
          }}
        />
        <PrimaryButton
          label="Добавить"
          onPress={async () => {
            if (!draft.trim()) return;
            await addItem(draft.trim());
            setDraft("");
            load();
          }}
        />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<EmptyState title="Пока пусто" description="Добавь первую запись выше." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: theme.spacing.sm }}>
            <Text style={{ color: theme.colors.ink, ...theme.typography.body }}>{item.title}</Text>
          </Card>
        )}
      />

      <Link href="/settings" style={{ color: theme.colors.inkMuted, textAlign: "center", padding: theme.spacing.md }}>
        Настройки
      </Link>
    </View>
  );
}
