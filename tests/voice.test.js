const test = require("node:test");
const assert = require("node:assert/strict");
const {
  chooseVoiceForLanguage,
  detectLanguage
} = require("../voice-core.js");

test("prefers the declared page language when matching voices exist", () => {
  const voice = chooseVoiceForLanguage(
    [
      { name: "English", lang: "en-US", default: true },
      { name: "Deutsch", lang: "de-DE", default: false }
    ],
    "de-DE",
    "Das ist ein kurzer deutscher Beispielsatz."
  );

  assert.equal(voice.name, "Deutsch");
});

test("falls back to script detection when page language is missing", () => {
  assert.equal(detectLanguage("", "Привет мир и добро пожаловать"), "ru");
  assert.equal(detectLanguage("", "こんにちは世界"), "ja");
});
