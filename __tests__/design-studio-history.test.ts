import { createUndoRedo, DEFAULT_HISTORY_LIMIT } from "@/lib/design-studio/history";

type Doc = { text: string; n: number };

describe("createUndoRedo", () => {
  it("starts with the initial state, nothing to undo/redo", () => {
    const history = createUndoRedo<Doc>({ text: "a", n: 1 });
    expect(history.current()).toEqual({ text: "a", n: 1 });
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
    expect(history.depth()).toBe(1);
    expect(history.cursor()).toBe(0);
  });

  it("undo walks backward and redo walks forward", () => {
    const history = createUndoRedo<Doc>({ text: "a", n: 1 });
    history.push({ text: "b", n: 2 });
    history.push({ text: "c", n: 3 });
    expect(history.current()).toEqual({ text: "c", n: 3 });

    expect(history.undo()).toEqual({ text: "b", n: 2 });
    expect(history.undo()).toEqual({ text: "a", n: 1 });
    expect(history.canUndo()).toBe(false);
    expect(history.undo()).toBeNull(); // stays at the floor

    expect(history.redo()).toEqual({ text: "b", n: 2 });
    expect(history.redo()).toEqual({ text: "c", n: 3 });
    expect(history.canRedo()).toBe(false);
    expect(history.redo()).toBeNull(); // stays at the ceiling
  });

  it("pushing after undo truncates the redo future", () => {
    const history = createUndoRedo<Doc>({ text: "a", n: 1 });
    history.push({ text: "b", n: 2 });
    history.push({ text: "c", n: 3 });
    history.undo(); // back to "b"
    expect(history.canRedo()).toBe(true);

    history.push({ text: "d", n: 4 });
    expect(history.canRedo()).toBe(false); // "c" is gone
    expect(history.current()).toEqual({ text: "d", n: 4 });
    expect(history.undo()).toEqual({ text: "b", n: 2 });
    expect(history.depth()).toBe(3); // a, b, d
  });

  it("ignores pushes that duplicate the current state", () => {
    const history = createUndoRedo<Doc>({ text: "a", n: 1 });
    const state = { text: "b", n: 2 };
    expect(history.push(state)).toBe(true);
    expect(history.push({ text: "b", n: 2 })).toBe(false); // deep-equal duplicate
    expect(history.depth()).toBe(2); // no pollution
    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toEqual({ text: "a", n: 1 });
    expect(history.canUndo()).toBe(false);
  });

  it("stays bounded — oldest states fall off the front", () => {
    const history = createUndoRedo<Doc>({ text: "0", n: 0 }, 3);
    for (let i = 1; i <= 10; i += 1) history.push({ text: String(i), n: i });
    expect(history.depth()).toBe(3); // limit respected
    expect(history.current()).toEqual({ text: "10", n: 10 });

    expect(history.undo()).toEqual({ text: "9", n: 9 });
    expect(history.undo()).toEqual({ text: "8", n: 8 });
    expect(history.undo()).toBeNull(); // 7 and earlier fell off
    expect(history.canUndo()).toBe(false);
  });

  it("never goes below a limit of 1", () => {
    const history = createUndoRedo<Doc>({ text: "a", n: 1 }, 0);
    history.push({ text: "b", n: 2 });
    expect(history.depth()).toBe(1);
    expect(history.current()).toEqual({ text: "b", n: 2 });
  });

  it("reset replaces the whole stack (design switch)", () => {
    const history = createUndoRedo<Doc>({ text: "a", n: 1 });
    history.push({ text: "b", n: 2 });
    history.reset({ text: "fresh", n: 99 });
    expect(history.current()).toEqual({ text: "fresh", n: 99 });
    expect(history.depth()).toBe(1);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it("has a sensible default limit", () => {
    expect(DEFAULT_HISTORY_LIMIT).toBe(100);
    const history = createUndoRedo<number>(0);
    for (let i = 1; i <= 150; i += 1) history.push(i);
    expect(history.depth()).toBe(100);
    expect(history.current()).toBe(150);
  });

  it("compares structurally, not by reference", () => {
    const history = createUndoRedo({ a: { b: [1, 2] } });
    expect(history.push({ a: { b: [1, 2] } })).toBe(false);
    expect(history.push({ a: { b: [1, 3] } })).toBe(true);
  });
});
