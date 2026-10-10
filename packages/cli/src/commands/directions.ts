import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { addFeedback, aeomHome, champion, contactSheet, createTournament, decideDirection, nextDuel, runKey, voteDuel, votesNeeded, type Tournament } from "@aeom/core";

export async function runSheet(argv: string[]): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { out: { type: "string" }, columns: { type: "string", default: "3" }, width: { type: "string", default: "640" }, note: { type: "string", multiple: true }, help: { type: "boolean", short: "h" } },
  });
  if (values.help || !values.out || positionals.length === 0) {
    console.log(`Usage: aeom sheet --out <sheet.png> <label>=<capture.png>... [--note <label>=<sentence>]...

Lays captures side by side, labelled, in one image. A missing capture shows
as a cell saying the direction did not build.

Options:
  --columns <n>             How many captures per row (default 3)
  --width <px>              How wide each capture is drawn (default 640), such as
                            1600 for a sheet of directions each shown on several screens
  --note <label>=<sentence> One sentence read under that capture, such as the
                            part of the product sheet a direction serves`);
    return values.help ? 0 : 1;
  }
  const items: { label: string; file: string; note?: string }[] = positionals.map((arg) => {
    // The label ends at the last =, so a route with a query keeps its capture.
    const at = arg.lastIndexOf("=");
    return at > 0 ? { label: arg.slice(0, at), file: arg.slice(at + 1) } : { label: arg, file: arg };
  });
  for (const note of values.note ?? []) {
    const at = note.indexOf("=");
    if (at < 1 || !note.slice(at + 1).trim()) {
      console.error(`--note takes <label>=<sentence>, such as --note "tissus=Serves the main loop: ...".`);
      return 1;
    }
    const item = items.find((i) => i.label === note.slice(0, at));
    if (!item) {
      console.error(`A note for ${note.slice(0, at)}, which the sheet does not show: give it a capture, or leave the note out.`);
      return 1;
    }
    if (item.note !== undefined) {
      console.error(`Two notes for ${item.label}: give each capture one sentence.`);
      return 1;
    }
    item.note = note.slice(at + 1).trim();
  }
  const columns = Number(values.columns);
  if (!Number.isInteger(columns) || columns < 1) {
    console.error(`--columns must be a positive whole number.`);
    return 1;
  }
  const cellWidth = Number(values.width);
  if (!Number.isInteger(cellWidth) || cellWidth < 1) {
    console.error(`--width must be a positive whole number of pixels.`);
    return 1;
  }
  await contactSheet({ out: values.out, items, columns, cellWidth });
  // The sentences stay beside the sheet, so the result page can say what each direction serves.
  if (items.some((i) => i.note)) await writeFile(values.out.replace(/\.png$/i, "") + ".json", JSON.stringify(items.map(({ label, note }) => ({ label, note })), null, 2) + "\n");
  console.log(`Sheet of ${items.length} captures: ${values.out}`);
  return 0;
}

const TOURNAMENT_HELP = `Usage: aeom tournament <start|next|vote|status|decide> --dir <dir> [...]

A knockout between directions, two by two: one vote decides a duel, three
the final. The state lives in <dir>/tournament.json; each direction's capture
is <dir>/<name>.png.

  start <name>... [--reset] [--votes <n>] [--final-votes <n>]
                                        Draw the first round (--reset replaces a tournament already there);
                                        --votes per duel (default 1), --final-votes for the final (default 3)
  next                                  Print the next duel and its two captures
  vote --duel <n> --voter <v> --winner <name> --reason "<why>"
  status                                Print every duel, the champion, and what the person decided
  decide [--choose <name>] [--drop <name>]... [--why "<their words>"]
                                        Keep the person's decision once there is a champion:
                                        without --choose or --drop they validate it; --choose
                                        takes any direction captured in <dir>; dropping the
                                        champion without choosing asks for a new knockout.
                                        Their decision also goes to their taste, in ~/.aeom/taste.`;

const ASK = "Show the person the directions and ask them: aeom tournament decide (it validates), --choose <name> or --drop <name>; with /aeom --autonome, the champion applies as it is.";

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
      votes: { type: "string", default: "1" },
      "final-votes": { type: "string", default: "3" },
      choose: { type: "string" },
      drop: { type: "string", multiple: true },
      why: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [action, ...names] = positionals;
  if (values.help || !action || !values.dir || !["start", "next", "vote", "status", "decide"].includes(action)) {
    console.log(TOURNAMENT_HELP);
    return values.help ? 0 : 1;
  }
  const file = join(values.dir, "tournament.json");
  const load = async (): Promise<Tournament> => JSON.parse(await readFile(file, "utf8"));
  const save = (t: Tournament) => writeFile(file, JSON.stringify(t, null, 2) + "\n");
  const capturePath = (name: string) => join(values.dir!, `${name}.png`);

  try {
    if (action === "start") {
      const t = createTournament(names, { votesPerDuel: Number(values.votes), finalVotes: Number(values["final-votes"]) });
      const exists = await access(file).then(() => true, () => false);
      if (exists && !values.reset) {
        console.error(`${file} already holds a tournament. Pass --reset to replace it and its votes.`);
        return 1;
      }
      await mkdir(values.dir, { recursive: true });
      await save(t);
      console.log(names.length === 1 ? `${names[0]} alone: champion without a duel. ${ASK}` : `${names.length} directions, first round drawn. Run: aeom tournament next --dir ${values.dir}`);
      return 0;
    }
    const t = await load();
    if (action === "next") {
      const duel = nextDuel(t);
      if (!duel) {
        console.log(`No duel left. Champion: ${champion(t)}`);
        if (!t.decision) console.log(ASK);
        return 0;
      }
      const missing = votesNeeded(t, duel) - duel.votes.length;
      console.log(`Duel ${duel.id} (round ${duel.round}${duel.needs ? ", the final" : ""}): ${duel.a} against ${duel.b}, ${missing} vote${missing > 1 ? "s" : ""} missing`);
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
      if (won) console.log(`Champion: ${won}. ${ASK}`);
      return 0;
    }
    if (action === "decide") {
      // Any direction built and captured can be chosen, the ones the screening took out included.
      const captured = (await readdir(values.dir)).filter((f) => f.endsWith(".png") && f !== "sheet.png").map((f) => f.slice(0, -4));
      const drop = values.drop ?? [];
      const { tournament, rerun } = decideDirection(t, { choose: values.choose, drop, why: values.why, at: new Date().toISOString(), directions: captured });
      const judges = champion(t)!;
      const applied = tournament.decision?.applied;
      const said = [values.choose && values.choose !== judges ? `Chose ${values.choose}.` : "", drop.length ? `Dropped ${drop.join(", ")}.` : "", values.why?.trim() ?? ""].filter(Boolean).join(" ");
      await addFeedback(aeomHome(), {
        ...(await runKey(dirname(values.dir))),
        id: `direction-choice:${judges}`,
        category: "direction",
        verdict: `The judges' champion: ${judges}`,
        agree: applied === judges,
        ...(said ? { why: said } : {}),
        at: new Date().toISOString(),
      });
      if (!applied) {
        console.log(
          rerun!.length
            ? `The person dropped the judges' champion, ${judges}. Run a new knockout among ${rerun!.join(", ")}: aeom tournament start --reset --dir ${values.dir} ${rerun!.join(" ")}, then ask them again.`
            : `The person dropped every direction of the knockout: build new ones, or let them choose one with --choose.`,
        );
        return 0;
      }
      await save(tournament);
      console.log(
        applied === judges
          ? `The run applies ${applied}, the judges' champion, as the person decided.`
          : values.choose
            ? `The run applies ${applied}, chosen by the person over the judges' ${judges}.`
            : `${applied} is the one direction left of the knockout: the run applies it.`,
      );
      return 0;
    }
    if (action === "status") {
      for (const d of t.duels) {
        if (d.b === null) console.log(`Round ${d.round}: ${d.a} goes through without a duel`);
        else {
          const reasons = d.reasons ?? d.votes.map((v) => `${v.winner}: ${v.reason}`);
          console.log(`Round ${d.round}, duel ${d.id}: ${d.a} against ${d.b} → ${d.winner ?? `${d.votes.length}/${votesNeeded(t, d)} votes`}${reasons.length ? `\n    ${reasons.join("\n    ")}` : ""}`);
        }
      }
      const won = champion(t);
      const d = t.decision;
      console.log(!won ? `\nNo champion yet.` : !d ? `\nChampion: ${won}, waiting for the person's decision.` : `\nChampion of the judges: ${d.judges}\nApplied: ${d.applied}, the person's decision${d.why ? `: ${d.why}` : ""}${d.dropped.length ? ` (dropped: ${d.dropped.join(", ")})` : ""}`);
      return 0;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  console.log(TOURNAMENT_HELP);
  return 1;
}
