import { useSyncExternalStore } from 'react';

/**
 * The card centred in the dashboard wallet (null for "All cards"), shared with the tab bar so its
 * add button can add to that card.
 */
let focusedCardId: string | null = null;
const listeners = new Set<() => void>();

export function setFocusedCard(id: string | null) {
  if (id === focusedCardId) return;
  focusedCardId = id;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFocusedCard(): string | null {
  return focusedCardId;
}

export function useFocusedCard(): string | null {
  return useSyncExternalStore(subscribe, getFocusedCard);
}
