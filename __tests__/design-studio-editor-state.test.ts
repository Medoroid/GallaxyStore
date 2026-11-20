import {
  createInitialEditorState,
  editorStateForReplacement,
  editorStateTooLarge,
  normalizeEditorState,
} from "@/lib/design-studio/editor-state";
import { ARTWORK_LIMITS, DEFAULT_PRINTABLE_AREA, type EditorState } from "@/lib/design-studio/types";

function validState(): EditorState {
  return {
    version: 1,
    transform: { cx: 1, cy: -2, width: 6, height: 3, rotation: 30 },
    zoom: 1.5,
    aspectLocked: false,
  };
}

describe("createInitialEditorState", () => {
  it("fits the artwork into the default area, zoom 1, aspect locked", () => {
    const state = createInitialEditorState(undefined, 2); // wide artwork
    expect(state.version).toBe(1);
    expect(state.zoom).toBe(1);
    expect(state.aspectLocked).toBe(true);
    expect(state.transform.cx).toBe(0);
    expect(state.transform.cy).toBe(0);
    expect(state.transform.rotation).toBe(0);
    expect(state.transform.width / state.transform.height).toBeCloseTo(2, 5);
    expect(state.transform.width).toBeLessThanOrEqual(DEFAULT_PRINTABLE_AREA.widthIn);
  });
});

describe("normalizeEditorState (server authority for PATCH)", () => {
  it("accepts a valid state and strips unknown keys", () => {
    const input = { ...validState(), evil: "payload", owner_id: "attacker", transform: { ...validState().transform, extra: 1 } };
    const result = normalizeEditorState(input);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect("evil" in result!).toBe(false);
    expect("owner_id" in result!).toBe(false);
    expect("extra" in result!.transform).toBe(false);
    expect(result!.transform).toEqual(validState().transform);
    expect(result!.zoom).toBe(1.5);
    expect(result!.aspectLocked).toBe(false);
  });

  it("normalizes rotation and clamps zoom and size", () => {
    const result = normalizeEditorState({
      version: 1,
      transform: { cx: 0, cy: 0, width: 500, height: 500, rotation: -10 },
      zoom: 99,
      aspectLocked: true,
    });
    expect(result).not.toBeNull();
    expect(result!.transform.rotation).toBe(350);
    expect(result!.zoom).toBe(4); // clamped to MAX_ZOOM
    expect(result!.transform.width).toBe(24); // clamped to area × 2
    expect(result!.transform.height).toBe(24);
  });

  it("defaults aspectLocked to true when the key is absent", () => {
    const result = normalizeEditorState({
      version: 1,
      transform: { cx: 0, cy: 0, width: 4, height: 4, rotation: 0 },
    });
    expect(result!.aspectLocked).toBe(true);
  });

  it("rejects unknown future versions instead of half-understanding them", () => {
    expect(
      normalizeEditorState({ ...validState(), version: 2 })
    ).toBeNull();
    expect(
      normalizeEditorState({ version: 0, transform: validState().transform })
    ).toBeNull();
  });

  it("rejects structurally broken payloads", () => {
    expect(normalizeEditorState(null)).toBeNull();
    expect(normalizeEditorState("nope")).toBeNull();
    expect(normalizeEditorState([1, 2, 3])).toBeNull();
    expect(normalizeEditorState({ version: 1 })).toBeNull();
    expect(normalizeEditorState({ version: 1, transform: null })).toBeNull();
    expect(
      normalizeEditorState({
        version: 1,
        transform: { cx: Number.NaN, cy: 0, width: 4, height: 4, rotation: 0 },
      })
    ).toBeNull();
    expect(
      normalizeEditorState({
        version: 1,
        transform: { cx: 0, cy: 0, width: 0, height: 4, rotation: 0 },
      })
    ).toBeNull();
    expect(
      normalizeEditorState({
        version: 1,
        transform: { cx: 0, cy: 0, width: -4, height: 4, rotation: 0 },
      })
    ).toBeNull();
  });

  it("rejects payloads over the serialized size cap", () => {
    expect(editorStateTooLarge("x".repeat(100))).toBe(false);
    expect(editorStateTooLarge("x".repeat(16 * 1024 + 1))).toBe(true);
  });
});

describe("editorStateForReplacement (artwork replace carry-over)", () => {
  it("keeps center, rotation, zoom and lock; refits the box to the new aspect", () => {
    const previous = {
      ...validState(), // box 6×3 (2:1), center (1,-2), rotation 30, zoom 1.5
    };
    const next = editorStateForReplacement(previous, 1, DEFAULT_PRINTABLE_AREA);
    // square artwork inscribed into the 6×3 box →3×3
    expect(next.transform.width).toBeCloseTo(3, 5);
    expect(next.transform.height).toBeCloseTo(3, 5);
    expect(next.transform.cx).toBe(1);
    expect(next.transform.cy).toBe(-2);
    expect(next.transform.rotation).toBe(30);
    expect(next.zoom).toBe(1.5);
    expect(next.aspectLocked).toBe(false);
  });

  it("keeps the box untouched when the new artwork's aspect is unknown (SVG)", () => {
    const next = editorStateForReplacement(validState(), null, DEFAULT_PRINTABLE_AREA);
    expect(next.transform.width).toBe(6);
    expect(next.transform.height).toBe(3);
  });

  it("falls back to a fitted initial state when there was no previous state", () => {
    const next = editorStateForReplacement(null, 0.5, DEFAULT_PRINTABLE_AREA);
    expect(next.version).toBe(1);
    expect(next.zoom).toBe(1);
    expect(next.transform.width / next.transform.height).toBeCloseTo(0.5, 5);
    expect(next.transform.width).toBeLessThanOrEqual(DEFAULT_PRINTABLE_AREA.widthIn);
  });

  it("drops garbage from the previous state rather than carrying it", () => {
    const next = editorStateForReplacement(
      { version: 1, transform: { cx: 0, cy: 0, width: -5, height: -5, rotation: 0 } },
      2,
      DEFAULT_PRINTABLE_AREA
    );
    // unusable previous → fitted initial, still valid for the new artwork
    expect(next.transform.width).toBeGreaterThan(0);
    expect(next.transform.width / next.transform.height).toBeCloseTo(2, 5);
  });
});

describe("limits are shared with the upload validator", () => {
  it("editor state cap sits far below any sane payload", () => {
    expect(ARTWORK_LIMITS.maxTitleLength).toBe(80);
    expect(editorStateTooLarge(JSON.stringify(validState()))).toBe(false);
  });
});
