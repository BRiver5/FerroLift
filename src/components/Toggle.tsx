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
      // false-дорожка — border, а не surfaceAlt: на карточке того же тона
      // выключенный переключатель сливался с фоном и выглядел отсутствующим
      // (баг шаблона, вылезал на эмуляторе в прошлых приложениях). Бегунок —
      // фиксированный белый, иначе в выключенном состоянии он тоже исчезает.
      trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
      thumbColor="#FFFFFF"
    />
  );
}
