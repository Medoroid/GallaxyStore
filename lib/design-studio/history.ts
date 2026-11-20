/**
 * Bounded undo/redo stack — pure, framework-free.
 *
 * Semantics (matching desktop editors):
 *  - `push` truncates the redo future, appends, and advances the cursor.
 *    Pushing a state deep-equal to the current one is a no-op so stray
 *    events never pollute history.
 *  - `undo`/`redo` move the cursor and return the state to display, or
 *    `null` when there is nothing to move to.
 *  - The stack never exceeds `limit` — the oldest states fall off the front.
 */

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  return ka.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

export type UndoRedo<T> = {
  /** Add a committed state. Returns false when it equals the current state. */
  push(state: T): boolean;
  undo(): T | null;
  redo(): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
  current(): T;
  /** Replace the whole stack (e.g. after loading a different design). */
  reset(state: T): void;
  /** Number of stored states (≤ limit). */
  depth(): number;
  cursor(): number;
};

export const DEFAULT_HISTORY_LIMIT = 100;

export function createUndoRedo<T>(initial: T, limit = DEFAULT_HISTORY_LIMIT): UndoRedo<T> {
  const max = Math.max(1, Math.floor(limit));
  let states: T[] = [initial];
  let index = 0;

  return {
    push(state) {
      if (deepEqual(states[index], state)) return false;
      states = states.slice(0, index + 1);
      states.push(state);
      if (states.length > max) {
        states.splice(0, states.length - max);
      }
      index = states.length - 1;
      return true;
    },
    undo() {
      if (index === 0) return null;
      index -= 1;
      return states[index];
    },
    redo() {
      if (index >= states.length - 1) return null;
      index += 1;
      return states[index];
    },
    canUndo() {
      return index > 0;
    },
    canRedo() {
      return index < states.length - 1;
    },
    current() {
      return states[index];
    },
    reset(state) {
      states = [state];
      index = 0;
    },
    depth() {
      return states.length;
    },
    cursor() {
      return index;
    },
  };
}
