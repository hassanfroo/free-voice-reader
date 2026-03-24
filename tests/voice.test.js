const test = require("node:test");
const assert = require("node:assert/strict");
const {
  chooseVoiceForLanguage,
  chooseDominantLanguage,
  detectLanguage
} = require("../voice-core.js");

test("prefers the declared page language when matching voices exist", () => {
  const voice = chooseVoiceForLanguage(
    [
      { name: "Google English", lang: "en-US", default: true },
      { name: "Google Deutsch", lang: "de-DE", default: false },
      { name: "Deutsch", lang: "de-DE", default: false }
    ],
    "de-DE",
    "Das ist ein kurzer deutscher Beispielsatz."
  );

  assert.equal(voice.name, "Google Deutsch");
});

test("falls back to script detection when page language is missing", () => {
  assert.equal(detectLanguage("", "Привет мир и добро пожаловать"), "ru");
  assert.equal(detectLanguage("", "こんにちは世界"), "ja");
});

test("chooses the dominant weighted language from page hints", () => {
  const language = chooseDominantLanguage(
    [
      { lang: "en-US", weight: 100 },
      { lang: "de-DE", weight: 420 },
      { lang: "en-US", weight: 40 }
    ],
    "Das ist ein deutscher Artikel."
  );

  assert.equal(language, "de");
});

test("auto voice prefers Google voices over non-Google voices", () => {
  const voice = chooseVoiceForLanguage(
    [
      { name: "Microsoft Katja", lang: "de-DE", default: true },
      { name: "Google Deutsch", lang: "de-DE", default: false },
      { name: "Google US English", lang: "en-US", default: false }
    ],
    "de-DE",
    "Das ist ein deutscher Text."
  );

  assert.equal(voice.name, "Google Deutsch");
});
