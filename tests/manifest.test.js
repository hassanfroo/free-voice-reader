const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("../manifest.json");

test("manifest exposes background worker and commands", () => {
  assert.equal(manifest.background.service_worker, "background.js");
  assert.ok(manifest.commands["read-selection"]);
  assert.ok(manifest.commands["read-page"]);
  assert.ok(manifest.commands["stop-reading"]);
});
