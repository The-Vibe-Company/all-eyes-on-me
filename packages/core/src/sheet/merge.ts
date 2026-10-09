/** A piece of a file the user can correct on its own, found again by its key. */
export interface Piece {
  key: string;
  /** How AEOM names it to the user, when its key is not enough. */
  label?: string;
  /** Its text, heading included, without the blank lines around it. */
  text: string;
}

/** What merging AEOM's new draft into the user's file gave, and what it did. */
export interface SheetMerge {
  text: string;
  /** Kept as the user wrote it, though AEOM proposed something else or nothing. */
  kept: string[];
  /** Replaced by what AEOM learned, since the user had not touched it. */
  updated: string[];
  /** New in this proposal. */
  added: string[];
  /** AEOM's own, untouched by the user, and no longer in its proposal. */
  removed: string[];
}

export interface ThreeWay<T extends Piece> {
  pieces: T[];
  /** Kept as the user wrote it, though AEOM proposed something else or nothing. */
  kept: string[];
  /** Replaced by what AEOM learned, since the user had not touched it. */
  updated: string[];
  /** New in this proposal. */
  added: string[];
  /** AEOM's own, untouched by the user, and no longer in its proposal. */
  removed: string[];
}

/**
 * Merges AEOM's new proposal into a file the user may have corrected, piece
 * by piece. `base` is AEOM's previous proposal: a piece that differs from it,
 * or that it did not hold, is the user's and stays as they wrote it; one the
 * user removed stays removed. What the user left alone takes the new proposal,
 * or goes when the proposal no longer holds it, and what is new in the
 * proposal is added where `place` says. Without `base`, everything already in
 * the file counts as the user's.
 */
export function threeWay<T extends Piece>({ base, current, proposed, place }: { base?: T[]; current: T[]; proposed: T[]; place: (merged: T[], piece: T) => number }): ThreeWay<T> {
  const before = base === undefined ? null : new Map(base.map((p) => [p.key, p.text]));
  const offered = new Map(proposed.map((p) => [p.key, p]));
  const name = (p: T) => p.label ?? p.key;
  const result = { kept: [] as string[], updated: [] as string[], added: [] as string[], removed: [] as string[] };

  const pieces: T[] = [];
  for (const piece of current) {
    const next = offered.get(piece.key);
    const untouched = before !== null && before.get(piece.key) === piece.text;
    if (next?.text === piece.text) pieces.push(piece);
    else if (untouched && next === undefined) result.removed.push(name(piece));
    else if (untouched) {
      result.updated.push(name(next!));
      pieces.push(next!);
    } else {
      pieces.push(piece);
      if (before !== null || next !== undefined) result.kept.push(name(piece));
    }
  }

  const present = new Set(current.map((p) => p.key));
  for (const piece of proposed) {
    if (present.has(piece.key)) continue;
    // In AEOM's last proposal but gone from the file: the user removed it.
    if (before?.has(piece.key)) continue;
    pieces.splice(place(pieces, piece), 0, piece);
    result.added.push(name(piece));
  }
  return { pieces, ...result };
}
