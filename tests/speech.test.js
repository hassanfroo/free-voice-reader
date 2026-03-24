const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSpeechQueueFromBlocks,
  getNextBlockQueueIndex,
  splitTextIntoChunks
} = require("../speech-core.js");

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

test("builds queue entries that preserve block boundaries", () => {
  const queue = buildSpeechQueueFromBlocks(
    [
      "Heading one. A short explanation follows.",
      "Second paragraph is long enough to split. ".repeat(12)
    ],
    120
  );

  assert.equal(queue[0].blockIndex, 0);
  assert.equal(queue[0].isBlockStart, true);
  assert.ok(queue.some((item) => item.blockIndex === 1));
});

test("finds the next paragraph boundary for fast forward", () => {
  const queue = buildSpeechQueueFromBlocks(
    [
      "First paragraph. ".repeat(10),
      "Second paragraph. ".repeat(12),
      "Third paragraph. ".repeat(8)
    ],
    80
  );

  const nextIndex = getNextBlockQueueIndex(queue, 0);
  assert.ok(nextIndex > 0);
  assert.equal(queue[nextIndex].blockIndex, 1);
});
