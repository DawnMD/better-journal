"use client";

import { useSyncExternalStore } from "react";

/**
 * Where the note editor's autosave state lives so the top bar can read it.
 *
 * The editor used to announce every save with `toast.promise` — "Saving…" then
 * "Saved", once per 1s debounce. On a screen whose entire job is to get out of
 * the way while you write, that is a notification every few seconds telling you
 * the software is working. The status is now ambient: one quiet line in the top
 * bar, and a toast reserved for the case that actually needs interrupting, which
 * is a save that *failed*.
 *
 * A module-level store read through `useSyncExternalStore` rather than context:
 * the publisher (NoteEditorContent, deep inside the page) and the subscriber
 * (AppTopbar, in the layout) are in sibling subtrees, so a provider would have to
 * be threaded through the layout for one small value. This is the same reasoning
 * — and the same shape — as the window event search-palette.tsx uses to let the
 * top bar open ⌘K.
 */
export type SaveState = "idle" | "saving" | "saved" | "error";

export type SaveStatus = {
  state: SaveState;
  /** Epoch ms of the last successful save, or null if nothing has saved yet. */
  savedAt: number | null;
};

const IDLE: SaveStatus = { state: "idle", savedAt: null };

let snapshot: SaveStatus = IDLE;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Referentially stable between writes, which is what useSyncExternalStore
// requires to avoid re-rendering on every check.
const getSnapshot = () => snapshot;

// The server has no editor mounted, so it always renders the idle state — and
// returns the same object every time, or React would loop during hydration.
const getServerSnapshot = () => IDLE;

export function setSaveStatus(next: SaveStatus) {
  snapshot = next;
  for (const listener of listeners) listener();
}

/**
 * Called when the editor unmounts, so navigating away from a note does not leave
 * "Saved · just now" hanging over an unrelated page.
 */
export function clearSaveStatus() {
  setSaveStatus(IDLE);
}

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
