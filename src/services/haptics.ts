// Тонкая обёртка над expo-haptics. Вибрация — это единственное "физическое"
// разрешение, которое реально используется в приложении помимо уведомлений
// (Android добавляет VIBRATE автоматически вместе с этим модулем).

import * as Haptics from "expo-haptics";

export const haptics = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  press: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
