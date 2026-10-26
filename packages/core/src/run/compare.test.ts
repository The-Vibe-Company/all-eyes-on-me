import assert from "node:assert/strict";
import { test } from "node:test";
import { lostActions } from "./index.js";

const content = (lines: string[]) => `# a page\n${lines.join("\n")}\n`;
const link = (href: string, name = "") => ({ href, name });
const page = (path: string, links: { href: string; name: string }[], lines: string[] = []) => ({ page: path, url: `http://app.test${path}`, links, content: content(lines) });

test("a link to a target no page links to any more is lost; one moved to another page, behind a menu, or to the same target written otherwise is not", () => {
  const before = [
    page("/dossiers/12", [link("https://github.com/acme/radar", "Dossier GitHub"), link("http://app.test/dossiers/12/livrables", "Livrables"), link("http://app.test/dossiers/12#top", "Haut"), link("http://app.test/dossiers/12", "Ce dossier"), link("http://app.test/dossiers/12?tab=preuves", "Preuve de dépôt")]),
    page("/", [link("http://app.test/", "Accueil"), link("http://app.test/aide", "Aide"), link("http://app.test/profil", "Profil"), link("mailto:contact@acme.test?subject=Radar", "Écrire")]),
  ];
  const after = [
    // The record's id changes, the menu holds the profile, hidden until opened, and the address of the help gains a slash.
    page("/dossiers/13", [link("http://app.test/dossiers/13/livrables", "Les livrables"), link("http://app.test/dossiers/13?tab=preuves", "")]),
    page("/", [link("http://app.test/aide/", "Aide et contact"), link("http://app.test/profil", "Profil"), link("mailto:CONTACT@acme.test", "Nous écrire")]),
  ];
  assert.deepEqual(lostActions(before, after).lost, [{ page: "/dossiers/12", what: 'link "Dossier GitHub" to https://github.com/acme/radar' }]);
  assert.deepEqual(lostActions(before, before).lost, []);
});

test("a link lost from every page that had it is named on each, for the kit to put back", () => {
  const nav = [link("http://app.test/livrables", "Livrables")];
  const lost = lostActions([page("/", nav), page("/dossiers", nav)], [page("/", []), page("/dossiers", [])]).lost;
  assert.deepEqual(lost.map((l) => l.page), ["/", "/dossiers"]);
});

test("a button or a field whose name no page has any more is said to look at, never counted lost: it may only have been renamed", () => {
  const before = [page("/", [], ['- button "Envoyer"', '- button "Sauvegarder"', '- textbox "Email"', '- button "x"'])];
  const after = [page("/", [], ['- button "Envoyer le message"', '- button "Enregistrer"', '- textbox "Adresse e-mail"', '- button "Exporter"'])];
  const { lost, toCheck } = lostActions(before, after);
  assert.deepEqual(lost, []);
  assert.deepEqual(toCheck.map((t) => t.what), ['button "Sauvegarder"', 'textbox "Email"', 'button "x"']);
});

test("a page whose links were not kept makes nothing lost: what is not known is not counted", () => {
  const before = [page("/", [link("http://app.test/aide", "Aide")])];
  const { lost, unknown } = lostActions(before, [{ page: "/", url: "http://app.test/", content: "" }]);
  assert.deepEqual(lost, []);
  assert.match(unknown ?? "", /\/ was captured without its links/);
});
