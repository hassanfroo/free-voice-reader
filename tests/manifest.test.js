const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("../manifest.json");

test("manifest exposes background worker and commands", () => {
  assert.equal(manifest.background.service_worker, "background.js");
  assert.equal(manifest.icons["128"], "icons/icon-128.png");
  assert.ok(manifest.commands["read-selection"]);
  assert.ok(manifest.commands["read-page"]);
  assert.ok(manifest.commands["stop-reading"]);
  assert.ok(manifest.commands["next-paragraph"]);
  assert.ok(manifest.commands["previous-paragraph"]);
});
