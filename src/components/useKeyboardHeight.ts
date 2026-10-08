import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Высота клавиатуры из событий системы — вместо KeyboardAvoidingView.
 *
 * На эмуляторе (Expo SDK 54, edge-to-edge) KeyboardAvoidingView сначала
 * прятал строку ввода ПОД клавиатуру (behavior undefined), а с
 * behavior="padding" оставлял после закрытия клавиатуры застрявший отступ.
 * Явная подписка детерминирована: высота при показе, ноль при скрытии.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
