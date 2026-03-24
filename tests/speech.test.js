const test = require("node:test");
const assert = require("node:assert/strict");
const { splitTextIntoChunks } = require("../speech-core.js");

test("keeps short text in one chunk", () => {
  const chunks = splitTextIntoChunks("A short paragraph. Another sentence.");
  assert.equal(chunks.length, 1);
});

test("splits long article text into multiple chunks", () => {
  const text = Array.from({ length: 40 }, (_, index) =>
    `Sentence ${index + 1} explains why users want reliable lunch reading with clean extraction and predictable playback.`
  ).join(" ");

  const chunks = splitTextIntoChunks(text, 300);

  assert.ok(chunks.length > 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 300));
});
