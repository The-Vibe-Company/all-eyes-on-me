import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Principle } from "./principles.js";

export interface Verdict {
  pass: boolean;
  reason: string;
  /** For a journey: the step where the verdict shows, 1 for the first. */
  step?: number;
}

/** What one voter decided: for each page, for each principle, pass or fail. */
export interface Vote {
  voter: string;
  pages: Record<string, Record<string, Verdict>>;
}

export interface PrincipleVerdict {
  principle: string;
  pass: boolean;
  /** Such as `2/3 fail`. */
  votes: string;
  /** The reasons given by the voters on the winning side. */
  reasons: string[];
  /** The reasons given by the voters on the losing side, so a split call keeps its dissent. */
  dissent: string[];
  /** For a journey: the steps the winning side pointed at, in order. */
  steps: number[];
}

export interface JudgeReport {
  judgedAt: string;
  voters: string[];
  principles: Principle[];
  pages: { page: string; verdicts: PrincipleVerdict[] }[];
  failures: number;
}

/** Some votes cannot be counted. The message lists every problem. */
export class JudgeVoteError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
    this.name = "JudgeVoteError";
  }
}

/** The judge votes three times. */
export const VOTERS = 3;

/**
 * Counts the votes, page by page and principle by principle. A principle
 * passes a page only when strictly more votes pass it than fail it, so a tie
 * fails. Refuses anything but exactly `voters` complete votes, each verdict
 * with a reason.
 */
export function tally(votes: Vote[], pages: string[], principles: Principle[], { voters = VOTERS } = {}): JudgeReport {
  if (pages.length === 0) throw new JudgeVoteError(["no page to judge"]);
  const ids = new Set(principles.map((p) => p.id));
  const problems: string[] = [];
  if (votes.length !== voters) problems.push(`expected ${voters} votes, found ${votes.length}`);
  const seenVoters = new Set<string>();
  for (const vote of votes) {
    if (seenVoters.has(vote.voter)) problems.push(`voter ${vote.voter} voted more than once`);
    seenVoters.add(vote.voter);
  }
  for (const vote of votes) {
    for (const page of pages) {
      const verdicts = vote.pages?.[page];
      if (!verdicts) {
        problems.push(`voter ${vote.voter}: no verdict for ${page}`);
        continue;
      }
      for (const id of ids) {
        const verdict = verdicts[id];
        if (!verdict || typeof verdict.pass !== "boolean") problems.push(`voter ${vote.voter}, ${page}: no verdict for ${id}`);
        else if (typeof verdict.reason !== "string" || !verdict.reason.trim()) problems.push(`voter ${vote.voter}, ${page}: no reason for ${id}`);
        else if (verdict.step !== undefined && (!Number.isInteger(verdict.step) || verdict.step < 1)) problems.push(`voter ${vote.voter}, ${page}: the step for ${id} must be a step number, 1 or more`);
      }
      for (const id of Object.keys(verdicts)) if (!ids.has(id)) problems.push(`voter ${vote.voter}, ${page}: unknown principle ${id}`);
    }
  }
  if (problems.length) throw new JudgeVoteError(problems);

  const judged = pages.map((page) => ({
    page,
    verdicts: principles.map(({ id }) => {
      const cast = votes.map((vote) => vote.pages[page]![id]!);
      const fails = cast.filter((v) => !v.pass);
      const pass = cast.length - fails.length > fails.length;
      return {
        principle: id,
        pass,
        votes: pass ? `${cast.length - fails.length}/${cast.length} pass` : `${fails.length}/${cast.length} fail`,
        reasons: cast.filter((v) => v.pass === pass).map((v) => v.reason),
        dissent: cast.filter((v) => v.pass !== pass).map((v) => v.reason),
        steps: [...new Set(cast.filter((v) => v.pass === pass && v.step !== undefined).map((v) => v.step!))].sort((a, b) => a - b),
      };
    }),
  }));
  return {
    judgedAt: new Date().toISOString(),
    voters: votes.map((v) => v.voter),
    principles,
    pages: judged,
    failures: judged.reduce((n, p) => n + p.verdicts.filter((v) => !v.pass).length, 0),
  };
}

/**
 * Reads every `.json` file of `dir` as one vote. A missing folder means no
 * vote; a file that cannot be read, or is not valid JSON, is a JudgeVoteError
 * naming it and saying which.
 */
export async function readVotes(dir: string): Promise<Vote[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const problems: string[] = [];
  const votes: Vote[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(join(dir, file), "utf8");
    } catch (error) {
      problems.push(`${file}: cannot be read (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    try {
      const vote = JSON.parse(text) as Vote;
      votes.push({ ...vote, voter: String(vote.voter ?? file.replace(/\.json$/, "")) });
    } catch (error) {
      problems.push(`${file}: not valid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  if (problems.length) throw new JudgeVoteError(problems);
  return votes;
}
