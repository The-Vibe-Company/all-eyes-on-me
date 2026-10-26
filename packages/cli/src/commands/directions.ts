import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { addFeedback, aeomHome, champion, compareDirections, contactSheet, createTournament, decideDirection, type DirectionComparison, nextDuel, runKey, voteDuel, votesNeeded, type Tournament } from "@aeom/core";

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

const TOURNAMENT_HELP = `Usage: aeom tournament <start|next|vote|status|compare|decide> --dir <dir> [...]

A knockout between directions, two by two: one vote decides a duel, three
the final. The state lives in <dir>/tournament.json; each direction's capture
is <dir>/<name>.png.

  start <name>... [--reset] [--votes <n>] [--final-votes <n>] [--no-knockout]
                                        Draw the first round (--reset replaces a tournament already there);
                                        --votes per duel (default 1), --final-votes for the final (default 3);
                                        --no-knockout records the directions with no duel, for the person to choose
  next                                  Print the next duel and its two captures
  vote --duel <n> --voter <v> --winner <name> --reason "<why>"
  status                                Print every duel, the champion, and what the person decided
  compare --from <screening.json>       Check the screening judge's comparison: every direction of
                                        the sheet with its strong point, its weak point and its fit,
                                        and the one it would start from; keep it in <dir>/compare.json
                                        and say it in words, as advice for the person
  decide [--choose <name>] [--drop <name>]... [--why "<their words>"]
                                        Keep the person's decision: with no knockout, --choose names
                                        the direction (or --drop all the others); after a knockout,
                                        without --choose or --drop they validate its champion, and
                                        dropping the champion without choosing asks for a new one.
                                        --choose takes any direction captured in <dir>. A decision on
                                        the judges' champion also goes to their taste, in ~/.aeom/taste,
                                        and so does whether the person followed the comparison's advice.`;

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
      "no-knockout": { type: "boolean" },
      votes: { type: "string", default: "1" },
      "final-votes": { type: "string", default: "3" },
      choose: { type: "string" },
      drop: { type: "string", multiple: true },
      why: { type: "string" },
      from: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [action, ...names] = positionals;
  if (values.help || !action || !values.dir || !["start", "next", "vote", "status", "compare", "decide"].includes(action)) {
    console.log(TOURNAMENT_HELP);
    return values.help ? 0 : 1;
  }
  const file = join(values.dir, "tournament.json");
  const load = async (): Promise<Tournament> => JSON.parse(await readFile(file, "utf8"));
  const save = (t: Tournament) => writeFile(file, JSON.stringify(t, null, 2) + "\n");
  const capturePath = (name: string) => join(values.dir!, `${name}.png`);

  try {
    if (action === "compare") {
      // The directions on the sheet that opened, the front as it is aside: each is compared, and only those.
      const sheet = await readJson<{ label?: unknown }[]>(join(values.dir, "sheet.json"));
      const captured = (await readdir(values.dir)).filter((f) => f.endsWith(".png") && f !== "sheet.png" && f !== "now.png").map((f) => f.slice(0, -4));
      const shown = Array.isArray(sheet) ? sheet.map((i) => String(i?.label ?? "")).filter((l) => l && l !== "now" && captured.includes(l)) : captured;
      if (!values.from) return (console.error(`aeom tournament compare --dir <dir> --from <the screening judge's answer>.`), 1);
      // The judge's object, even said in words or in a code block around it.
      const said = await readFile(values.from, "utf8").catch(() => null);
      const object = said?.slice(said.indexOf("{"), said.lastIndexOf("}") + 1) ?? "";
      let answer: unknown = null;
      try {
        answer = JSON.parse(object);
      } catch {
        answer = null;
      }
      if (!answer || typeof answer !== "object") return (console.error(`${values.from} holds no JSON object: ask the screening judge again, for only the object the screening brief asks for.`), 1);
      const { comparison, problems } = compareDirections(answer, shown);
      if (!comparison) return (console.error(`The comparison cannot be shown, so nothing was kept:\n${problems.map((p) => `  ${p}`).join("\n")}\nAsk the screening judge again, with the screening brief.`), 1);
      await writeFile(join(values.dir, "compare.json"), JSON.stringify(comparison, null, 2) + "\n");
      console.log(`${comparison.directions.map((d) => `${d.slug}\n  Strong: ${d.strong}\n  Weak: ${d.weak}\n  Fit: ${d.fit}`).join("\n\n")}\n\nThe screening would start from ${comparison.start.slug}: ${/[.!?…]$/.test(comparison.start.why) ? comparison.start.why : `${comparison.start.why}.`} Advice only: the person chooses, one direction or a mix.`);
      return 0;
    }
    if (action === "start") {
      const knockout = !values["no-knockout"];
      const t = createTournament(names, { votesPerDuel: Number(values.votes), finalVotes: Number(values["final-votes"]), knockout });
      const exists = await access(file).then(() => true, () => false);
      if (exists && !values.reset) {
        console.error(`${file} already holds a tournament. Pass --reset to replace it and its votes.`);
        return 1;
      }
      await mkdir(values.dir, { recursive: true });
      await save(t);
      console.log(
        !knockout
          ? `${names.length} direction${names.length === 1 ? "" : "s"} recorded, with no knockout: ask the person, then aeom tournament decide --dir ${values.dir} --choose <name>.`
          : names.length === 1
            ? `${names[0]} alone: champion without a duel. ${ASK}`
            : `${names.length} directions, first round drawn. Run: aeom tournament next --dir ${values.dir}`,
      );
      return 0;
    }
    const t = await load();
    if (action === "next") {
      if (t.knockout === false) {
        console.log(`No knockout in this run: the person chooses. Ask them, then aeom tournament decide --dir ${values.dir} --choose <name>.`);
        return 0;
      }
      const duel = nextDuel(t);
      if (!duel) {
        console.log(`No duel left. Champion: ${champion(t)}`);
        if (!t.decision) console.log(ASK);
        return 0;
      }
      const missing = votesNeeded(t, duel) - duel.votes.length;
      console.log(`Duel ${duel.id} (round ${duel.round}${t.duels.filter((d) => d.round === duel.round).length === 1 ? ", the final" : ""}): ${duel.a} against ${duel.b}, ${missing} vote${missing > 1 ? "s" : ""} missing`);
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
      // Any direction built and captured can be chosen, the ones the screening took out included; the sheet and the front as it is are not directions.
      const captured = (await readdir(values.dir)).filter((f) => f.endsWith(".png") && f !== "sheet.png" && f !== "now.png").map((f) => f.slice(0, -4));
      const drop = values.drop ?? [];
      const { tournament, rerun } = decideDirection(t, { choose: values.choose, drop, why: values.why, at: new Date().toISOString(), directions: captured });
      // The comparison's advice, when the screening gave one on this round's directions: whether the person followed it,
      // a variant or a mix of the advised one included, kept to measure the screening against them.
      const compared = await readJson<DirectionComparison>(join(values.dir, "compare.json"));
      const round = (names: string[]) => JSON.stringify([...names].sort());
      const advice = compared?.start?.slug && Array.isArray(compared.directions) && round(compared.directions.map((d) => d.slug)) === round(t.entrants) ? compared.start.slug : null;
      const follows = (name: string | undefined) => !!advice && !!name && (name === advice || name.startsWith(`${advice}-`));
      if (advice && tournament.decision) tournament.decision.advised = { slug: advice, followed: follows(tournament.decision.applied) };
      // No knockout played: the person chose alone, and there is no champion to agree with.
      const judges = t.duels.some((d) => d.votes.length > 0) ? champion(t) : null;
      const applied = tournament.decision?.applied;
      const said = [values.choose && values.choose !== judges ? `Chose ${values.choose}.` : "", drop.length ? `Dropped ${drop.join(", ")}.` : "", values.why?.trim() ?? ""].filter(Boolean).join(" ");
      if (judges !== null) {
        await addFeedback(aeomHome(), {
          ...(await runKey(dirname(values.dir))),
          id: `direction-choice:${judges}`,
          category: "direction",
          verdict: `The judges' champion: ${judges}`,
          agree: applied === judges,
          ...(said ? { why: said } : {}),
          at: new Date().toISOString(),
        });
      }
      if (!applied) {
        console.log(
          rerun!.length
            ? `The person dropped the judges' champion, ${judges}. Run a new knockout among ${rerun!.join(", ")}: aeom tournament start --reset --dir ${values.dir} ${rerun!.join(" ")}, then ask them again.`
            : `The person dropped every direction of the knockout: build new ones, or let them choose one with --choose.`,
        );
        return 0;
      }
      await save(tournament);
      if (advice) {
        await addFeedback(aeomHome(), {
          ...(await runKey(dirname(values.dir))),
          id: `direction-advice:${advice}`,
          category: "direction",
          verdict: `The screening's advice: start from ${advice}`,
          agree: follows(applied),
          ...(said ? { why: said } : {}),
          at: new Date().toISOString(),
        });
        console.log(follows(applied) ? `The screening advised ${advice}: the person followed it${applied === advice ? "" : `, as ${applied}`}.` : `The screening advised ${advice}: the person chose otherwise.`);
      }
      console.log(
        judges === null
          ? `The run applies ${applied}, chosen by the person, with no knockout.`
          : applied === judges
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
      console.log(
        d
          ? `\nChampion of the judges: ${d.judges ?? "none, no knockout"}\nApplied: ${d.applied}, the person's decision${d.why ? `: ${d.why}` : ""}${d.dropped.length ? ` (dropped: ${d.dropped.join(", ")})` : ""}`
          : t.knockout === false
            ? `\nNo knockout: waiting for the person's choice among ${t.entrants.join(", ")}.`
            : !won
              ? `\nNo champion yet.`
              : `\nChampion: ${won}, waiting for the person's decision.`,
      );
      return 0;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  console.log(TOURNAMENT_HELP);
  return 1;
}

/** A JSON file, or null when it is missing or broken: an optional file never stops a decision. */
async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}
