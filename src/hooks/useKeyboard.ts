import { useEffect, useState } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

interface KeyboardState {
  isKeyboardVisible: boolean;
  keyboardHeight: number;
}

const SCROLL_MARGIN = 16;
const SHIFTED_ATTR = 'data-keyboard-shifted';
const FOCUS_DELAY_MS = 250;
const ESTIMATED_KEYBOARD_RATIO = 0.45;

function isEditable(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

function findFixedAncestor(el: HTMLElement): HTMLElement | null {
  let parent: HTMLElement | null = el.parentElement;
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent);
    if (style.position === 'fixed') return parent;
    parent = parent.parentElement;
  }
  return null;
}

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let parent: HTMLElement | null = el.parentElement;
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent);
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function measureKeyboardHeight(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (vv) {
    const diff = window.innerHeight - vv.height;
    if (diff > 80) return diff;
  }
  return 0;
}

function ensureFocusedVisible(keyboardHeight: number) {
  const el = document.activeElement;
  if (!isEditable(el)) return;

  const target = el as HTMLElement;
  const rect = target.getBoundingClientRect();
  const visibleBottom = window.innerHeight - keyboardHeight;
  const overflow = rect.bottom - visibleBottom + SCROLL_MARGIN;

  if (overflow <= 0) return;

  const fixedParent = findFixedAncestor(target);
  if (fixedParent) {
    fixedParent.style.transition = 'transform 200ms ease';
    fixedParent.style.transform = `translateY(-${overflow}px)`;
    fixedParent.setAttribute(SHIFTED_ATTR, '1');
    return;
  }

  const scrollable = findScrollableAncestor(target);
  if (scrollable) {
    scrollable.scrollBy({ top: overflow, behavior: 'smooth' });
    return;
  }

  window.scrollBy({ top: overflow, behavior: 'smooth' });
}

function resetShiftedOverlays() {
  const shifted = document.querySelectorAll<HTMLElement>(`[${SHIFTED_ATTR}]`);
  shifted.forEach((el) => {
    el.style.transform = '';
    el.style.transition = '';
    el.removeAttribute(SHIFTED_ATTR);
  });
}

export function useKeyboard(): KeyboardState {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let active = true;
    const capacitorListeners: Array<{ remove: () => Promise<void> }> = [];
    let focusTimer: number | null = null;
    let focusOutTimer: number | null = null;
    let lastMeasuredKeyboardHeight = 0;
    let appliedHeight = 0;

    const updateState = (height: number) => {
      if (!active || height === appliedHeight) return;
      appliedHeight = height;
      setKeyboardHeight(height);
      setIsKeyboardVisible(height > 0);
      document.body.style.setProperty('--keyboard-height', `${height}px`);
    };

    // Android with KeyboardResize.None doesn't update visualViewport — fall back to a cached or estimated height.
    const adjustWithBestHeight = () => {
      const measured = measureKeyboardHeight();
      const fallback = Math.round(window.innerHeight * ESTIMATED_KEYBOARD_RATIO);
      const h = measured || lastMeasuredKeyboardHeight || fallback;
      if (measured > 0) lastMeasuredKeyboardHeight = measured;
      updateState(h);
      ensureFocusedVisible(h);
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!isEditable(e.target as Element | null)) return;
      if (focusTimer) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(adjustWithBestHeight, FOCUS_DELAY_MS);
    };

    const onFocusOut = () => {
      if (focusTimer) window.clearTimeout(focusTimer);
      if (focusOutTimer) window.clearTimeout(focusOutTimer);
      focusOutTimer = window.setTimeout(() => {
        if (!active) return;
        if (isEditable(document.activeElement)) return;
        updateState(0);
        resetShiftedOverlays();
      }, 100);
    };

    const onViewportResize = () => {
      const h = measureKeyboardHeight();
      if (h <= 0) return;
      const heightChanged = h !== appliedHeight;
      lastMeasuredKeyboardHeight = h;
      updateState(h);
      // visualViewport fires many intermediate ticks during the show animation — only re-scroll on real changes
      if (heightChanged && isEditable(document.activeElement)) {
        ensureFocusedVisible(h);
      }
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportResize);
    }

    if (Capacitor.isNativePlatform()) {
      const trackListener = (handle: { remove: () => Promise<void> }) => {
        if (!active) {
          handle.remove();
          return;
        }
        capacitorListeners.push(handle);
      };
      (async () => {
        try {
          trackListener(await Keyboard.addListener('keyboardWillShow', (info) => {
            if (!active) return;
            lastMeasuredKeyboardHeight = info.keyboardHeight;
            updateState(info.keyboardHeight);
            requestAnimationFrame(() => ensureFocusedVisible(info.keyboardHeight));
          }));

          trackListener(await Keyboard.addListener('keyboardDidShow', (info) => {
            if (!active) return;
            lastMeasuredKeyboardHeight = info.keyboardHeight;
            updateState(info.keyboardHeight);
            ensureFocusedVisible(info.keyboardHeight);
          }));

          trackListener(await Keyboard.addListener('keyboardDidHide', () => {
            if (!active) return;
            updateState(0);
            resetShiftedOverlays();
            requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
          }));
        } catch (error) {
          console.warn('[useKeyboard] Capacitor listeners failed:', error);
        }
      })();
    }

    return () => {
      active = false;
      if (focusTimer) window.clearTimeout(focusTimer);
      if (focusOutTimer) window.clearTimeout(focusOutTimer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onViewportResize);
      }
      capacitorListeners.forEach((l) => l.remove());
      resetShiftedOverlays();
    };
  }, []);

  return { isKeyboardVisible, keyboardHeight };
}
