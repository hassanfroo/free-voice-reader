(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.FreeVoiceReaderVoice = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeLangTag(value) {
    return (value || "").toLowerCase().split("-")[0];
  }

  function chooseDominantLanguage(candidates, fallbackText) {
    const scores = new Map();

    (candidates || []).forEach((candidate) => {
      const lang = normalizeLangTag(
        typeof candidate === "string" ? candidate : candidate?.lang
      );
      if (!lang) {
        return;
      }

      const weight =
        typeof candidate === "string" ? 1 : Number(candidate?.weight) || 1;
      scores.set(lang, (scores.get(lang) || 0) + weight);
    });

    if (scores.size) {
      let bestLang = "";
      let bestWeight = -1;
      scores.forEach((weight, lang) => {
        if (weight > bestWeight) {
          bestLang = lang;
          bestWeight = weight;
        }
      });
      if (bestLang) {
        return bestLang;
      }
    }

    return detectScriptLanguage(fallbackText || "");
  }

  function detectScriptLanguage(text) {
    const sample = (text || "").slice(0, 2000);

    if (/[\u3040-\u30FF]/.test(sample)) {
      return "ja";
    }

    if (/[\uAC00-\uD7AF]/.test(sample)) {
      return "ko";
    }

    if (/[\u4E00-\u9FFF]/.test(sample)) {
      return "zh";
    }

    if (/[\u0400-\u04FF]/.test(sample)) {
      return "ru";
    }

    if (/[\u0600-\u06FF]/.test(sample)) {
      return "ar";
    }

    if (/[\u0590-\u05FF]/.test(sample)) {
      return "he";
    }

    return "en";
  }

  function detectLanguage(preferredLang, text) {
    if (Array.isArray(preferredLang)) {
      return chooseDominantLanguage(preferredLang, text);
    }

    const normalizedPreferred = normalizeLangTag(preferredLang);
    if (normalizedPreferred) {
      return normalizedPreferred;
    }

    return detectScriptLanguage(text);
  }

  function chooseVoiceForLanguage(voices, preferredLang, text) {
    const detectedLang = detectLanguage(preferredLang, text);
    const normalizedVoices = voices || [];

    const exactMatch = normalizedVoices.find(
      (voice) => normalizeLangTag(voice.lang) === detectedLang && voice.default
    );
    if (exactMatch) {
      return exactMatch;
    }

    const langMatch = normalizedVoices.find(
      (voice) => normalizeLangTag(voice.lang) === detectedLang
    );
    if (langMatch) {
      return langMatch;
    }

    return (
      normalizedVoices.find((voice) => voice.default) ||
      normalizedVoices.find((voice) => normalizeLangTag(voice.lang) === "en") ||
      normalizedVoices[0] ||
      null
    );
  }

  return {
    chooseVoiceForLanguage,
    chooseDominantLanguage,
    detectLanguage,
    normalizeLangTag
  };
});
