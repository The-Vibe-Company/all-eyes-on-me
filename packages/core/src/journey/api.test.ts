import assert from "node:assert/strict";
import { test } from "node:test";
import { localApiBase, underApi } from "./index.js";

test("an API given is one running on this machine; any other address is refused", () => {
  assert.equal(localApiBase("http://localhost:8000/v1/"), "http://localhost:8000/v1");
  assert.equal(localApiBase("http://127.0.0.1:4481"), "http://127.0.0.1:4481");
  assert.equal(localApiBase("http://[::1]:3000/api"), "http://[::1]:3000/api");
  assert.equal(localApiBase("http://climb.test/api"), "http://climb.test/api");
  for (const remote of ["https://api.example.com/v1", "http://localhost@evil.com", "http://127.0.0.1.nip.io", "http://0.0.0.0:8000", "ftp://localhost/x", "localhost:8000", ""]) assert.equal(localApiBase(remote), null, remote);
});

test("a call belongs to the API when it is under its base, the loopback names of one port being one server", () => {
  const base = localApiBase("http://localhost:8000/v1")!;
  assert.equal(underApi("http://localhost:8000/v1/climbs?x=1", base), true);
  assert.equal(underApi("http://127.0.0.1:8000/v1/climbs", base), true, "127.0.0.1 and localhost on one port are one server");
  assert.equal(underApi("http://[::1]:8000/v1", base), true);
  assert.equal(underApi("http://localhost:8000/v10/climbs", base), false);
  assert.equal(underApi("http://localhost:8001/v1/climbs", base), false);
  assert.equal(underApi("https://api.example.com/v1/climbs", base), false);
});
