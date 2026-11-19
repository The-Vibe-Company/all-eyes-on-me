/**
 * What `aeom review` says, in English or in French: the person's language,
 * from the product sheet. The checks' own words and the reason a journey
 * breaks stay as aeom check and aeom journey write them.
 */

export type Lang = "en" | "fr";

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** Widths as a list: `390 and 1280`, `390, 768 et 1280`. */
const list = (widths: number[], and: string) => (widths.length > 1 ? `${widths.slice(0, -1).join(", ")} ${and} ${widths.at(-1)}` : `${widths[0]}`);

const EN = {
  head: (branch: string, base: string, standard: string, ahead: number) => `${branch} against ${base}, held to ${standard}: ${ahead} commit${s(ahead, "", "s")} ahead.`,
  cannotCompare: (with_: string, why: string, shallow: boolean) => `Cannot compare this branch with ${with_ || "its base"}: ${why}${shallow ? " The clone is shallow: fetch its history (fetch-depth: 0 in GitHub Actions)." : " Give the branch to compare with: --base <branch>."}`,
  noStandard: (file: string) => `No standard in ${file}: run /aeom first, which writes it from the front as it is.`,
  unmeasuredShape: (shape: string) => `${shape} was not measured: no route of its shape is known. Add one to "pages" in .aeom/config.json.`,
  noUrl: `No app to start: .aeom/config.json has no url, so the screens were not measured, only the code read.`,
  signInFailed: `The sign-in failed, as said above: the screens were not measured.`,
  charter: (line: string) => `${line}: the charter's, kept, said, not refused`,
  doesNotLoad: (reason: string) => `does not load: ${reason}`,
  headerDiffers: (how: string) => `its header differs from the rest of the app: ${how}`,
  cannotReplay: (problem: string) => `cannot be replayed: ${problem}`,
  couldNotMeasure: (why: string) => `The screens could not be measured: ${why}`,
  appDidNotStart: `The app did not start, as said above: the screens were not measured.`,
  appDidNotStartWith: (output: string) => `The app did not start: ${output}`,
  noJourneys: `No key journeys recorded in .aeom/journeys: none replayed.`,
  noneCrosses: `No key journey crosses the screens touched.`,
  alreadyBroke: (name: string, base: string) => `${name} already broke on ${base}, the same way: not this branch's doing.`,
  brokeBaseUnreplayed: `breaks (the base could not be replayed)`,
  wentToEnd: (base: string) => `went to its end on ${base} and breaks`,
  brokeOtherwise: (base: string, step: number | undefined, reason: string | undefined) => `breaks (on ${base} it broke otherwise: step ${step}, ${reason})`,
  atStep: (step: number, width: number, reason: string) => ` at step ${step} at ${width} px: ${reason}`,
  feature: (what: string, why: string | null) => `${what}: ${why ?? "a call the base did not make"}: a feature, said, not refused`,
  stillReaches: `still reaches its end`,
  more: (n: number, everyScreen: boolean) => `… and ${n} more${everyScreen ? "." : ": the branch rewrites more than it changes."}`,
  moreShort: (n: number) => `… and ${n} more.`,
  shotsNotIgnored: `The journeys' captures are in .aeom/review/, which git does not ignore: add .aeom/review/ to .gitignore, so no capture enters a commit.`,
  uncommitted: (n: number) => `${n} uncommitted file${s(n, "", "s")} not reviewed: commit ${s(n, "it", "them")} first.`,
  outside: (n: number) => `${n} thing${s(n, "", "s")} outside the standard.`,
  notMeasured: `Nothing outside the standard in the code; the screens it touches were not measured.`,
  nothing: `Nothing outside the standard.`,
  noScreen: `No screen touched, and nothing outside the standard.`,
  annotationMore: (n: number, summary: boolean) => `; ${n} more in ${summary ? "the check's summary" : "the review's output"}`,
  baseCannotStart: `The base's app cannot be started (no start command: the app given by --url, or none in .aeom/config.json): the journeys were replayed on the branch alone.`,
  baseDidNotStart: (why: string) => `The base's app did not start (${why}): the journeys were replayed on the branch alone.`,
  baseSignInFailed: `The sign-in failed on the base: the journeys were replayed on the branch alone.`,
  workspace: `In this workspace, the base ran on the branch's installed packages: a shared package the branch changed shows its new code on the base too.`,
  baseCouldNotReplay: (why: string) => `The journeys could not be replayed on the base (${why}): the branch is judged alone.`,
  covered: (n: number, missed: string[], widths: number[], from: string | undefined, capped: boolean, followed: number) => {
    const how = !n ? "no screen" : !missed.length ? (n === 1 ? "the one screen" : `the ${n} screens`) : `${n} of the ${n + missed.length} screens`;
    const at = n ? `, at ${list(widths, "and")} px` : "";
    return `Measured ${how} it touches${at}${from ? `, found by following the links from ${from}` : ""}${missed.length ? `; not measured: ${missed.join(", ")}` : ""}${capped ? `; the links are followed to ${followed} pages at most: any other was not measured` : ""}.`;
  },
  replayed: (n: number, base: string | null) => `Replayed ${n} key journey${s(n, " that crosses", "s that cross")} them, ${base ? `on the branch and on ${base}` : "on the branch alone"}.`,
  badWidths: (min: number, max: number) => `--widths lists the widths to measure, in px between ${min} and ${max}, such as 1280 or 390,1280.`,
  /** Between a place and what is said of it, in a list of the summary. */
  sep: ": ",
};

const FR: typeof EN = {
  head: (branch, base, standard, ahead) => `${branch} face à ${base}, tenue à ${standard} : ${ahead} commit${s(ahead, "", "s")} d'avance.`,
  cannotCompare: (with_, why, shallow) => `Impossible de comparer cette branche à ${with_ || "sa base"} : ${why}${shallow ? " Le clone est partiel : récupère son historique (fetch-depth: 0 dans GitHub Actions)." : " Donne la branche à comparer : --base <branche>."}`,
  noStandard: (file) => `Pas de standard dans ${file} : lance d'abord /aeom, qui l'écrit depuis le front tel qu'il est.`,
  unmeasuredShape: (shape) => `${shape} n'a pas été mesuré : aucune route de sa forme n'est connue. Ajoutes-en une à "pages" dans .aeom/config.json.`,
  noUrl: `Pas d'app à démarrer : .aeom/config.json n'a pas d'url, donc les écrans n'ont pas été mesurés, seul le code a été lu.`,
  signInFailed: `La connexion a échoué, comme dit plus haut : les écrans n'ont pas été mesurés.`,
  charter: (line) => `${line} : propre à la charte, gardé, dit, pas refusé`,
  doesNotLoad: (reason) => `ne se charge pas : ${reason}`,
  headerDiffers: (how) => `son en-tête diffère du reste de l'app : ${how}`,
  cannotReplay: (problem) => `ne peut pas être rejoué : ${problem}`,
  couldNotMeasure: (why) => `Les écrans n'ont pas pu être mesurés : ${why}`,
  appDidNotStart: `L'app n'a pas démarré, comme dit plus haut : les écrans n'ont pas été mesurés.`,
  appDidNotStartWith: (output) => `L'app n'a pas démarré : ${output}`,
  noJourneys: `Aucun parcours clé enregistré dans .aeom/journeys : aucun rejoué.`,
  noneCrosses: `Aucun parcours clé ne traverse les écrans touchés.`,
  alreadyBroke: (name, base) => `${name} cassait déjà sur ${base}, de la même façon : ce n'est pas le fait de cette branche.`,
  brokeBaseUnreplayed: `casse (la base n'a pas pu être rejouée)`,
  wentToEnd: (base) => `allait au bout sur ${base} et casse`,
  brokeOtherwise: (base, step, reason) => `casse (sur ${base}, il cassait autrement : étape ${step}, ${reason})`,
  atStep: (step, width, reason) => ` à l'étape ${step} à ${width} px : ${reason}`,
  // The guard's reason for new fields, `sends new fields: a, b`, keeps its fields and loses its English.
  feature: (what, why) => `${what} : ${why === null ? "un appel que la base ne faisait pas" : why.replace(/^sends new fields: /, "envoie de nouveaux champs : ")} : une feature, dite, pas refusée`,
  stillReaches: `va toujours au bout`,
  more: (n, everyScreen) => `… et ${n} de plus${everyScreen ? "." : " : la branche réécrit plus qu'elle ne change."}`,
  moreShort: (n) => `… et ${n} de plus.`,
  shotsNotIgnored: `Les captures des parcours sont dans .aeom/review/, que git n'ignore pas : ajoute .aeom/review/ à .gitignore, pour qu'aucune capture n'entre dans un commit.`,
  uncommitted: (n) => `${n} fichier${s(n, "", "s")} non commité${s(n, "", "s")}, donc pas relu${s(n, "", "s")} : commite-${s(n, "le", "les")} d'abord.`,
  outside: (n) => `${n} écart${s(n, "", "s")} au standard.`,
  notMeasured: `Rien hors du standard dans le code ; les écrans que la branche touche n'ont pas été mesurés.`,
  nothing: `Rien hors du standard.`,
  noScreen: `Aucun écran touché, et rien hors du standard.`,
  annotationMore: (n, summary) => ` ; ${n} de plus dans ${summary ? "le résumé du check" : "la sortie de la relecture"}`,
  baseCannotStart: `L'app de la base ne peut pas être démarrée (pas de commande de démarrage : l'app donnée par --url, ou aucune dans .aeom/config.json) : les parcours ont été rejoués sur la branche seule.`,
  baseDidNotStart: (why) => `L'app de la base n'a pas démarré (${why}) : les parcours ont été rejoués sur la branche seule.`,
  baseSignInFailed: `La connexion a échoué sur la base : les parcours ont été rejoués sur la branche seule.`,
  workspace: `Dans ce workspace, la base a tourné sur les paquets installés de la branche : un paquet partagé que la branche a changé y montre aussi son nouveau code.`,
  baseCouldNotReplay: (why) => `Les parcours n'ont pas pu être rejoués sur la base (${why}) : la branche est jugée seule.`,
  covered: (n, missed, widths, from, capped, followed) =>
    `Écrans touchés mesurés : ${n} sur ${n + missed.length}${n ? `, à ${list(widths, "et")} px` : ""}${from ? `, trouvés en suivant les liens depuis ${from}` : ""}${missed.length ? ` ; non mesuré${s(missed.length, "", "s")} : ${missed.join(", ")}` : ""}${capped ? ` ; les liens sont suivis jusqu'à ${followed} pages : au-delà, aucune n'a été mesurée` : ""}.`,
  replayed: (n, base) => `${n} parcours clé${s(n, " qui les traverse, rejoué", "s qui les traversent, rejoués")} ${base ? `sur la branche et sur ${base}` : "sur la branche seule"}.`,
  badWidths: (min, max) => `--widths donne les largeurs à mesurer, en px entre ${min} et ${max}, comme 1280 ou 390,1280.`,
  sep: " : ",
};

export const reviewWords = (lang: Lang) => (lang === "fr" ? FR : EN);
export type ReviewWords = typeof EN;
