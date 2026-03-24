const STORAGE_KEY = "freeVoiceReaderSettings";

let currentUtterance = null;
let availableVoices = [];
let queuedSpeakRequest = null;

const DEFAULT_SETTINGS = {
  voiceName: "",
  rate: 1,
  pitch: 1,
  volume: 1
};

function loadVoices() {
  availableVoices = speechSynthesis.getVoices();

  if (availableVoices.length && queuedSpeakRequest) {
    const pending = queuedSpeakRequest;
    queuedSpeakRequest = null;
    speakText(pending.text, pending.settings);
  }
}

loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

function getStoredSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] || {}) });
    });
  });
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getSelectedText() {
  const selection = window.getSelection();
  if (!selection) {
    return "";
  }

  return normalizeWhitespace(selection.toString());
}

function isHidden(element) {
  const style = window.getComputedStyle(element);
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  );
}

function removeNoisyNodes(root) {
  const blockedSelectors = [
    "nav",
    "aside",
    "footer",
    "header",
    "form",
    "button",
    "label",
    "input",
    "select",
    "textarea",
    "noscript",
    "script",
    "style",
    "svg",
    "canvas",
    "figure",
    "img",
    "video",
    "audio",
    "iframe",
    "[role='navigation']",
    "[role='menu']",
    "[role='complementary']",
    "[aria-hidden='true']",
    ".menu",
    ".sidebar",
    ".ad",
    ".ads",
    ".advertisement",
    ".promo",
    ".newsletter",
    ".comments",
    ".share",
    ".social"
  ];

  root.querySelectorAll(blockedSelectors.join(",")).forEach((node) => {
    node.remove();
  });

  root.querySelectorAll("*").forEach((node) => {
    if (isHidden(node)) {
      node.remove();
    }
  });
}

function scoreNode(node) {
  const text = normalizeWhitespace(node.innerText || "");
  if (!text) {
    return 0;
  }

  const textLength = text.length;
  const paragraphCount = node.querySelectorAll("p").length;
  const headingCount = node.querySelectorAll("h1, h2, h3").length;
  const linkTextLength = Array.from(node.querySelectorAll("a"))
    .map((link) => normalizeWhitespace(link.innerText || "").length)
    .reduce((sum, length) => sum + length, 0);
  const linkDensity = textLength ? linkTextLength / textLength : 1;

  let score = textLength;
  score += paragraphCount * 120;
  score += headingCount * 40;
  score -= linkDensity * 600;

  if (node.matches("main, article, [role='main'], .content, .post, .article")) {
    score += 300;
  }

  return score;
}

function extractMainText() {
  const clone = document.body.cloneNode(true);
  removeNoisyNodes(clone);

  const candidates = clone.querySelectorAll("article, main, section, div");
  let bestNode = clone;
  let bestScore = 0;

  candidates.forEach((node) => {
    const score = scoreNode(node);
    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  });

  const paragraphs = Array.from(bestNode.querySelectorAll("h1, h2, h3, p, li"))
    .map((node) => normalizeWhitespace(node.innerText || ""))
    .filter((text) => text.length > 30);

  const combinedText = paragraphs.join(" ");
  if (combinedText.length > 120) {
    return combinedText;
  }

  return normalizeWhitespace(bestNode.innerText || "");
}

function stopSpeech() {
  speechSynthesis.cancel();
  currentUtterance = null;
  queuedSpeakRequest = null;
}

function speakText(text, settings) {
  if (!text) {
    return { ok: false, message: "No readable text found on this page." };
  }

  if (!availableVoices.length) {
    queuedSpeakRequest = { text, settings };
    loadVoices();
    return {
      ok: true,
      message: "Loading available voices. Playback will start automatically."
    };
  }

  stopSpeech();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Number(settings.rate) || DEFAULT_SETTINGS.rate;
  utterance.pitch = Number(settings.pitch) || DEFAULT_SETTINGS.pitch;
  utterance.volume = Number(settings.volume) || DEFAULT_SETTINGS.volume;

  const selectedVoice = availableVoices.find(
    (voice) => voice.name === settings.voiceName
  );

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  utterance.onend = () => {
    currentUtterance = null;
  };

  utterance.onerror = () => {
    currentUtterance = null;
  };

  currentUtterance = utterance;
  speechSynthesis.speak(utterance);

  return { ok: true, message: "Reading started." };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const settings = await getStoredSettings();

    if (message.type === "GET_SELECTION_TEXT") {
      const text = getSelectedText();
      sendResponse({
        ok: true,
        text,
        hasSelection: Boolean(text)
      });
      return;
    }

    if (message.type === "READ_SELECTION") {
      const text = getSelectedText();
      sendResponse(speakText(text, settings));
      return;
    }

    if (message.type === "READ_MAIN_CONTENT") {
      const text = extractMainText();
      sendResponse(speakText(text, settings));
      return;
    }

    if (message.type === "STOP_READING") {
      stopSpeech();
      sendResponse({ ok: true, message: "Reading stopped." });
      return;
    }

    if (message.type === "PREVIEW_TEXT") {
      const selection = getSelectedText();
      sendResponse({
        ok: true,
        selection,
        mainContent: extractMainText().slice(0, 600)
      });
    }
  })();

  return true;
});
