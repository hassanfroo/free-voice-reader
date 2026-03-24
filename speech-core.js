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

  return {
    splitTextIntoChunks
  };
});
