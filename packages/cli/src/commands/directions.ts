import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { champion, contactSheet, createTournament, nextDuel, voteDuel, type Tournament } from "@aeom/core";

export async function runSheet(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { out: { type: "string" }, columns: { type: "string", default: "3" }, help: { type: "boolean", short: "h" } },
  });
  if (values.help || !values.out || positionals.length === 0) {
    console.log(`Usage: aeom sheet --out <sheet.png> <label>=<capture.png>...

Lays captures side by side, labelled, in one image. A missing capture shows
as a cell saying the direction did not build.

Options:
  --columns <n>  How many captures per row (default 3)`);
    return values.help ? 0 : 1;
  }
  const items = positionals.map((arg) => {
    const at = arg.indexOf("=");
    return at > 0 ? { label: arg.slice(0, at), file: arg.slice(at + 1) } : { label: arg, file: arg };
  });
  const columns = Number(values.columns);
  if (!Number.isInteger(columns) || columns < 1) {
    console.error(`--columns must be a positive whole number.`);
    return 1;
  }
  await contactSheet({ out: values.out, items, columns });
  console.log(`Sheet of ${items.length} captures: ${values.out}`);
  return 0;
}

const TOURNAMENT_HELP = `Usage: aeom tournament <start|next|vote|status> --dir <dir> [...]

A knockout between directions, two by two, three votes per duel. The state
lives in <dir>/tournament.json; each direction's capture is <dir>/<name>.png.

  start <name>... [--reset]             Draw the first round (--reset replaces a tournament already there)
  next                                  Print the next duel and its two captures
  vote --duel <n> --voter <v> --winner <name> --reason "<why>"
  status                                Print every duel, and the champion when there is one`;

export async function runTournament(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: "string" },
      duel: { type: "string" },
      voter: { type: "string" },
      winner: { type: "string" },
      reason: { type: "string" },
      reset: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [action, ...names] = positionals;
  if (values.help || !action || !values.dir || !["start", "next", "vote", "status"].includes(action)) {
    console.log(TOURNAMENT_HELP);
    return values.help ? 0 : 1;
  }
  const file = join(values.dir, "tournament.json");
  const load = async (): Promise<Tournament> => JSON.parse(await readFile(file, "utf8"));
  const save = (t: Tournament) => writeFile(file, JSON.stringify(t, null, 2) + "\n");
  const capturePath = (name: string) => join(values.dir!, `${name}.png`);

  try {
    if (action === "start") {
      const t = createTournament(names);
      const exists = await access(file).then(() => true, () => false);
      if (exists && !values.reset) {
        console.error(`${file} already holds a tournament. Pass --reset to replace it and its votes.`);
        return 1;
      }
      await mkdir(values.dir, { recursive: true });
      await save(t);
      console.log(`${names.length} directions, first round drawn. Run: aeom tournament next --dir ${values.dir}`);
      return 0;
    }
    const t = await load();
    if (action === "next") {
      const duel = nextDuel(t);
      if (!duel) {
        console.log(`No duel left. Champion: ${champion(t)}`);
        return 0;
      }
      const missing = t.votesPerDuel - duel.votes.length;
      console.log(`Duel ${duel.id} (round ${duel.round}): ${duel.a} against ${duel.b}, ${missing} vote${missing > 1 ? "s" : ""} missing`);
      console.log(`  ${duel.a}: ${capturePath(duel.a)}`);
      console.log(`  ${duel.b}: ${capturePath(duel.b!)}`);
      return 0;
    }
    if (action === "vote") {
      const { duel, voter, winner, reason } = values;
      if (!duel || !voter || !winner || reason === undefined) {
        console.error(`vote needs --duel, --voter, --winner and --reason.`);
        return 1;
      }
      const updated = voteDuel(t, { duel: Number(duel), voter, winner, reason });
      await save(updated);
      const decided = updated.duels.find((d) => d.id === Number(duel))!;
      console.log(decided.winner ? `Duel ${duel} goes to ${decided.winner}.` : `Vote recorded on duel ${duel}.`);
      const won = champion(updated);
      if (won) console.log(`Champion: ${won}`);
      return 0;
    }
    if (action === "status") {
      for (const d of t.duels) {
        if (d.b === null) console.log(`Round ${d.round}: ${d.a} goes through without a duel`);
        else console.log(`Round ${d.round}, duel ${d.id}: ${d.a} against ${d.b} → ${d.winner ?? `${d.votes.length}/${t.votesPerDuel} votes`}${d.reasons?.length ? `\n    ${d.reasons.join("\n    ")}` : ""}`);
      }
      const won = champion(t);
      console.log(won ? `\nChampion: ${won}` : `\nNo champion yet.`);
      return 0;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  console.log(TOURNAMENT_HELP);
  return 1;
}
