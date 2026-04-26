import { useEffect, useState } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

interface KeyboardState {
  isKeyboardVisible: boolean;
  keyboardHeight: number;
}

export function useKeyboard(): KeyboardState {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let active = true;
    const listeners: Array<{ remove: () => Promise<void> }> = [];

    const setupListeners = async () => {
      try {
        const showListener = await Keyboard.addListener('keyboardWillShow', (info) => {
          if (!active) return;
          setIsKeyboardVisible(true);
          setKeyboardHeight(info.keyboardHeight);
        });
        listeners.push(showListener);

        const hideListener = await Keyboard.addListener('keyboardDidHide', () => {
          if (!active) return;
          setIsKeyboardVisible(false);
          setKeyboardHeight(0);

          requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
          });
        });
        listeners.push(hideListener);
      } catch (error) {
        console.warn('[useKeyboard] Failed to setup keyboard listeners:', error);
      }
    };

    setupListeners();

    return () => {
      active = false;
      listeners.forEach((l) => l.remove());
    };
  }, []);

  return { isKeyboardVisible, keyboardHeight };
}
