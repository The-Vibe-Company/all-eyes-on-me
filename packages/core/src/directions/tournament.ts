/** One judge's pick in a duel. */
export interface DuelVote {
  voter: string;
  winner: string;
  reason: string;
}

export interface Duel {
  id: number;
  round: number;
  a: string;
  /** null when `a` has no opponent this round and goes through. */
  b: string | null;
  votes: DuelVote[];
  winner?: string;
  /** The reasons given by the votes for the winner. */
  reasons?: string[];
}

/** What the person decided at the checkpoint, once the knockout crowned its champion. */
export interface Decision {
  /** The direction the run applies. */
  applied: string;
  /** The judges' champion, which the person validated or replaced. */
  judges: string;
  /** The directions the person dropped. */
  dropped: string[];
  /** Their words, when they gave any. */
  why?: string;
  at: string;
}

export interface Tournament {
  entrants: string[];
  votesPerDuel: number;
  duels: Duel[];
  /** The person's decision, once they made it. */
  decision?: Decision;
}

/**
 * A knockout between directions: they meet two by two, in order; with an odd
 * number, the last one goes through to the next round without a duel. A
 * direction alone, the only one the screening left, is champion at once.
 */
export function createTournament(entrants: string[], { votesPerDuel = 3 } = {}): Tournament {
  if (entrants.length < 1) throw new Error("A tournament needs at least one direction: a direction alone is champion without a duel.");
  if (!Number.isInteger(votesPerDuel) || votesPerDuel < 1 || votesPerDuel % 2 === 0) throw new Error("Votes per duel must be a positive odd number, so every duel has a majority.");
  if (new Set(entrants).size !== entrants.length) throw new Error("Each direction can enter only once.");
  return { entrants, votesPerDuel, duels: pair(entrants, 1, 1) };
}

function pair(names: string[], round: number, firstId: number): Duel[] {
  const duels: Duel[] = [];
  for (let i = 0; i < names.length; i += 2) {
    const b = names[i + 1] ?? null;
    duels.push({ id: firstId + duels.length, round, a: names[i]!, b, votes: [], ...(b === null ? { winner: names[i]! } : {}) });
  }
  return duels;
}

/** The next duel waiting for votes, or null when the tournament is over. */
export function nextDuel(t: Tournament): Duel | null {
  return t.duels.find((d) => d.b !== null && d.winner === undefined) ?? null;
}

/** Records one vote. Returns the updated tournament; a full duel is decided and the next round drawn. */
export function voteDuel(t: Tournament, { duel: id, voter, winner, reason }: DuelVote & { duel: number }): Tournament {
  const duel = t.duels.find((d) => d.id === id);
  if (!duel || duel.b === null) throw new Error(`There is no duel ${id} to vote on.`);
  if (duel.winner !== undefined) throw new Error(`Duel ${id} is already decided.`);
  if (winner !== duel.a && winner !== duel.b) throw new Error(`${winner} is not in duel ${id} (${duel.a} against ${duel.b}).`);
  if (duel.votes.some((v) => v.voter === voter)) throw new Error(`Voter ${voter} already voted on duel ${id}.`);
  if (!reason.trim()) throw new Error(`A vote needs a reason.`);

  const votes = [...duel.votes, { voter, winner, reason }];
  let decided: Duel = { ...duel, votes };
  if (votes.length === t.votesPerDuel) {
    const forA = votes.filter((v) => v.winner === duel.a).length;
    const won = forA * 2 > votes.length ? duel.a : duel.b;
    decided = { ...decided, winner: won, reasons: votes.filter((v) => v.winner === won).map((v) => v.reason) };
  }
  let duels = t.duels.map((d) => (d.id === id ? decided : d));

  const round = duel.round;
  const thisRound = duels.filter((d) => d.round === round);
  const roundOver = thisRound.every((d) => d.winner !== undefined);
  const nextExists = duels.some((d) => d.round === round + 1);
  if (roundOver && !nextExists && thisRound.length > 1) {
    duels = [...duels, ...pair(thisRound.map((d) => d.winner!), round + 1, duels.length + 1)];
  }
  return { ...t, duels };
}

/** The direction that won the last duel, or null while duels remain. */
export function champion(t: Tournament): string | null {
  const lastRound = Math.max(...t.duels.map((d) => d.round));
  const final = t.duels.filter((d) => d.round === lastRound);
  return final.length === 1 && final[0]!.winner !== undefined ? final[0]!.winner : null;
}

/** The direction the run applies: the one the person decided on, null until they do. */
export function applied(t: Tournament): string | null {
  return t.decision?.applied ?? null;
}

/**
 * The person's decision on the knockout: they validate the judges' champion,
 * choose another direction (any built one, `directions`, the ones the screening
 * took out included), or drop some. Dropping the champion without choosing
 * decides nothing: `rerun` names the knockout's directions left for a new
 * knockout, and when one alone is left, it is their choice. A later decision
 * keeps what they dropped and what they applied before, unless it drops or
 * chooses again.
 */
export function decideDirection(
  t: Tournament,
  { choose, drop = [], why, at, directions = t.entrants }: { choose?: string; drop?: string[]; why?: string; at: string; directions?: string[] },
): { tournament: Tournament; rerun: string[] | null } {
  const judges = champion(t);
  if (judges === null) throw new Error("The knockout is not over: there is no champion to show the person yet.");
  const known = [...new Set([...t.entrants, ...directions])];
  for (const name of [...(choose ? [choose] : []), ...drop]) if (!known.includes(name)) throw new Error(`${name} is not one of the directions: ${known.join(", ")}.`);
  if (choose && drop.includes(choose)) throw new Error(`${choose} is both chosen and dropped.`);
  // What they dropped before stays dropped, unless they now choose it.
  const dropped = [...new Set([...(t.decision?.dropped ?? []), ...drop])].filter((name) => name !== choose);
  const left = t.entrants.filter((name) => !dropped.includes(name));
  const kept = t.decision && !dropped.includes(t.decision.applied) ? t.decision.applied : null;
  const pick = choose ?? kept ?? (!dropped.includes(judges) ? judges : left.length === 1 ? left[0]! : null);
  if (pick === null) return { tournament: t, rerun: left };
  const decision: Decision = { applied: pick, judges, dropped, ...(why?.trim() ? { why: why.trim() } : {}), at };
  return { tournament: { ...t, decision }, rerun: null };
}
