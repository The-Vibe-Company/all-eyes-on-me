import type { Page } from "playwright";

/** A record repeated more than this keeps its first KEPT, and says how many it leaves out. */
const LONG = 8;
const KEPT = 5;
/** A record of plain blocks, such as a card of a heading, a text and a button, holds at most this many siblings. */
const LONGEST_RECORD = 6;
/** Past HEAD + TAIL lines, the middle is said in one line: a worker reads what a screen holds, not every record of it. */
const HEAD = 400;
const TAIL = 100;

interface Node {
  line: string;
  children: Node[];
}

/** `- listitem:`, `- heading "Nos produits" [level=1]`, `- 'row "Commande #4 Statut: payée"':` are a listitem, a heading and a row. */
const role = (line: string) => /^-\s+'?([^\s:"'[]+)/.exec(line.trim())?.[1] ?? "";
/** A node's role and its children's: two records alike have the same. */
const shape = (node: Node) => `${role(node.line)}(${node.children.map((c) => role(c.line)).join(",")})`;

/** The snapshot as a tree, by its indentation. */
function parse(text: string): Node[] {
  const root: Node = { line: "", children: [] };
  const stack: { indent: number; node: Node }[] = [{ indent: -1, node: root }];
  for (const line of text.split("\n").filter((l) => l.trim())) {
    const indent = line.length - line.trimStart().length;
    while (stack.length > 1 && stack.at(-1)!.indent >= indent) stack.pop();
    const node: Node = { line, children: [] };
    stack.at(-1)!.node.children.push(node);
    stack.push({ indent, node });
  }
  return root.children;
}

/**
 * The run of records alike from `at`, the smallest record first: one node of two children or more
 * repeated (a row of cells, an item holding a card), or a few plain blocks
 * repeated together (a heading, a text, a button). Links alike, or texts, are
 * not records: each is an action or a piece of content of its own.
 */
function records(nodes: Node[], shapes: string[], at: number): { size: number; count: number } | null {
  for (let size = 1; size <= LONGEST_RECORD && at + size <= nodes.length; size++) {
    const block = shapes.slice(at, at + size);
    if (size === 1 && nodes[at]!.children.length < 2) continue;
    if (size > 1 && block.every((s) => s === block[0])) continue;
    let count = 1;
    while (at + (count + 1) * size <= nodes.length && shapes.slice(at + count * size, at + (count + 1) * size).every((s, i) => s === block[i])) count++;
    if (count > LONG) return { size, count };
  }
  return null;
}

/** Every long run of records alike keeps its first ones, and one line says how many it leaves out. */
function shortenRuns(nodes: Node[]): string[] {
  const shapes = nodes.map(shape);
  const out: string[] = [];
  const write = (node: Node) => out.push(node.line, ...shortenRuns(node.children));
  for (let i = 0; i < nodes.length; ) {
    const run = records(nodes, shapes, i);
    if (!run) {
      write(nodes[i]!);
      i++;
      continue;
    }
    nodes.slice(i, i + run.size * KEPT).forEach(write);
    const first = nodes[i]!.line;
    const what = nodes.slice(i, i + run.size).map((n) => role(n.line)).join(", ");
    out.push(`${" ".repeat(first.length - first.trimStart().length)}- … ${run.count - KEPT} more ${what}`);
    i += run.size * run.count;
  }
  return out;
}

/** What a screen reader reads of a snapshot, its long runs of records shortened and its length capped, its end kept. */
export function shortenContent(snapshot: string): string {
  const lines = shortenRuns(parse(snapshot));
  if (lines.length <= HEAD + TAIL) return lines.join("\n");
  return [...lines.slice(0, HEAD), `- … cut here: ${lines.length - HEAD - TAIL} more lines`, ...lines.slice(-TAIL)].join("\n");
}

/**
 * What the page holds, as a screen reader reads it: its headings, texts,
 * links, buttons and fields, in order, and nothing of its look. Null when the
 * page cannot be read so.
 */
export async function pageContent(page: Page): Promise<string | null> {
  try {
    return shortenContent(await page.locator("body").ariaSnapshot({ timeout: 10_000 }));
  } catch {
    return null;
  }
}
