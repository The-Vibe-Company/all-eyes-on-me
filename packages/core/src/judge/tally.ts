import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Principle } from "./principles.js";

export interface Verdict {
  pass: boolean;
  reason: string;
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

/**
 * Counts the votes, page by page and principle by principle. A principle
 * passes a page only when strictly more votes pass it than fail it, so a tie
 * fails.
 */
export function tally(votes: Vote[], pages: string[], principles: Principle[]): JudgeReport {
  if (votes.length === 0) throw new JudgeVoteError(["no vote to count"]);
  const ids = new Set(principles.map((p) => p.id));
  const problems: string[] = [];
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
      const winners = pass ? cast.filter((v) => v.pass) : fails;
      return {
        principle: id,
        pass,
        votes: pass ? `${cast.length - fails.length}/${cast.length} pass` : `${fails.length}/${cast.length} fail`,
        reasons: winners.map((v) => v.reason).filter(Boolean),
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

/** Reads every `.json` file of `dir` as one vote. */
export async function readVotes(dir: string): Promise<Vote[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(
    files.map(async (file) => {
      const vote = JSON.parse(await readFile(join(dir, file), "utf8")) as Vote;
      return { ...vote, voter: String(vote.voter ?? file.replace(/\.json$/, "")) };
    }),
  );
}
