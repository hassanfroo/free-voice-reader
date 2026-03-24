const test = require("node:test");
const assert = require("node:assert/strict");
const { derivePageMode, getSpeedLabel } = require("../ui-core.js");

test("prefers selection when enough text is highlighted", () => {
  const mode = derivePageMode({
    selectionLength: 80,
    mainContent: "Article body"
  });

  assert.equal(mode.actionType, "READ_SELECTION");
  assert.equal(mode.actionLabel, "Read Selection");
});

test("falls back to page reading when there is no useful selection", () => {
  const mode = derivePageMode({
    selectionLength: 0,
    mainContent: "Article body"
  });

  assert.equal(mode.actionType, "READ_MAIN_CONTENT");
  assert.equal(mode.actionLabel, "Read Page");
});

test("maps rate values to friendly labels", () => {
  assert.equal(getSpeedLabel(0.85), "Relaxed");
  assert.equal(getSpeedLabel(1), "Comfort");
  assert.equal(getSpeedLabel(1.3), "Fast");
  assert.equal(getSpeedLabel(2), "Very Fast");
});
