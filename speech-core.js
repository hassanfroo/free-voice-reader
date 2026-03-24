(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.FreeVoiceReaderSpeech = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeWhitespace(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function splitTextIntoChunks(text, maxLength = 1800) {
    const normalizedText = normalizeWhitespace(text);
    const sentences = normalizedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalizedText];
    const chunks = [];
    let currentChunk = "";

    sentences.forEach((sentence) => {
      const normalizedSentence = normalizeWhitespace(sentence);
      if (!normalizedSentence) {
        return;
      }

      const proposedChunk = currentChunk
        ? `${currentChunk} ${normalizedSentence}`
        : normalizedSentence;

      if (proposedChunk.length > maxLength && currentChunk) {
        chunks.push(currentChunk);
        currentChunk = normalizedSentence;
        return;
      }

      currentChunk = proposedChunk;
    });

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.length ? chunks : [normalizedText];
  }

  function buildSpeechQueueFromBlocks(blocks, maxLength = 1800) {
    const queue = [];

    (blocks || []).forEach((block, blockIndex) => {
      const text = normalizeWhitespace(block);
      if (!text) {
        return;
      }

      const chunks = splitTextIntoChunks(text, maxLength);
      chunks.forEach((chunk, chunkIndex) => {
        queue.push({
          text: chunk,
          blockIndex,
          chunkIndex,
          isBlockStart: chunkIndex === 0
        });
      });
    });

    return queue;
  }

  function getNextBlockQueueIndex(queue, currentQueueIndex) {
    const currentItem = queue[currentQueueIndex];
    if (!currentItem) {
      return -1;
    }

    const currentBlockIndex = currentItem.blockIndex;
    for (let index = currentQueueIndex + 1; index < queue.length; index += 1) {
      if (queue[index].blockIndex > currentBlockIndex) {
        return index;
      }
    }

    return -1;
  }

  function getPreviousBlockQueueIndex(queue, currentQueueIndex) {
    const currentItem = queue[currentQueueIndex];
    if (!currentItem) {
      return -1;
    }

    const currentBlockIndex = currentItem.blockIndex;
    for (let index = currentQueueIndex - 1; index >= 0; index -= 1) {
      if (queue[index].blockIndex < currentBlockIndex) {
        while (index > 0 && queue[index - 1].blockIndex === queue[index].blockIndex) {
          index -= 1;
        }
        return index;
      }
    }

    return -1;
  }

  return {
    buildSpeechQueueFromBlocks,
    getNextBlockQueueIndex,
    getPreviousBlockQueueIndex,
    splitTextIntoChunks
  };
});
