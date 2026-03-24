const STORAGE_KEY = "freeVoiceReaderSettings";

let availableVoices = [];
let queuedSpeakRequest = null;
let currentPlayback = {
  status: "idle",
  source: null,
  textLength: 0,
  chunkIndex: 0,
  totalChunks: 0
};
let activeChunkUtterance = null;
let activeChunkList = [];
let activeChunkSettings = null;

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
    speakText(pending.text, pending.settings, pending.source);
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
  return FreeVoiceReaderExtractor.normalizeWhitespace(text);
}

function getSelectedText() {
  const selection = window.getSelection();
  if (!selection) {
    return "";
  }

  return normalizeWhitespace(selection.toString());
}

function getMainContentResult() {
  return FreeVoiceReaderExtractor.extractMainContentFromDocument(
    document,
    window
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function resolveMainContentResult() {
  let bestResult = getMainContentResult();

  if (bestResult.confidence === "high" && bestResult.text.length > 280) {
    return bestResult;
  }

  const retryDelays = [350, 1000];
  for (const waitMs of retryDelays) {
    await delay(waitMs);
    const nextResult = getMainContentResult();
    bestResult = FreeVoiceReaderExtractor.chooseBetterExtraction(
      bestResult,
      nextResult
    );

    if (bestResult.confidence === "high" && bestResult.text.length > 280) {
      break;
    }
  }

  return bestResult;
}

function stopSpeech() {
  speechSynthesis.cancel();
  activeChunkUtterance = null;
  activeChunkList = [];
  activeChunkSettings = null;
  queuedSpeakRequest = null;
  currentPlayback = {
    status: "idle",
    source: null,
    textLength: 0,
    chunkIndex: 0,
    totalChunks: 0
  };
}

function getSelectedVoice(settings) {
  return availableVoices.find((voice) => voice.name === settings.voiceName) || null;
}

function createUtterance(text, settings) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Number(settings.rate) || DEFAULT_SETTINGS.rate;
  utterance.pitch = Number(settings.pitch) || DEFAULT_SETTINGS.pitch;
  utterance.volume = Number(settings.volume) || DEFAULT_SETTINGS.volume;

  const selectedVoice = getSelectedVoice(settings);
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  return utterance;
}

function speakNextChunk() {
  if (!activeChunkList.length || !activeChunkSettings) {
    stopSpeech();
    return;
  }

  const text = activeChunkList.shift();
  const utterance = createUtterance(text, activeChunkSettings);
  activeChunkUtterance = utterance;
  currentPlayback.chunkIndex += 1;
  currentPlayback.status = "playing";

  utterance.onend = () => {
    activeChunkUtterance = null;

    if (activeChunkList.length) {
      speakNextChunk();
      return;
    }

    currentPlayback.status = "idle";
    currentPlayback.source = null;
    currentPlayback.chunkIndex = 0;
    currentPlayback.totalChunks = 0;
    currentPlayback.textLength = 0;
    activeChunkSettings = null;
  };

  utterance.onerror = () => {
    stopSpeech();
  };

  speechSynthesis.speak(utterance);
}

function speakText(text, settings, source) {
  if (!text) {
    return { ok: false, message: "No readable text found on this page." };
  }

  if (!availableVoices.length) {
    queuedSpeakRequest = { text, settings, source };
    loadVoices();
    return {
      ok: true,
      message: "Loading available voices. Playback will start automatically."
    };
  }

  stopSpeech();
  activeChunkList = FreeVoiceReaderSpeech.splitTextIntoChunks(text);
  activeChunkSettings = settings;
  currentPlayback = {
    status: "starting",
    source,
    textLength: text.length,
    chunkIndex: 0,
    totalChunks: activeChunkList.length
  };
  speakNextChunk();

  const label = source === "selection" ? "selection" : "page";
  return {
    ok: true,
    message: `Reading ${label} (${currentPlayback.totalChunks} segment${currentPlayback.totalChunks === 1 ? "" : "s"}).`
  };
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
      if (!text) {
        sendResponse({
          ok: false,
          message: "Select some text first, or use Read Main Content."
        });
        return;
      }

      sendResponse(speakText(text, settings, "selection"));
      return;
    }

    if (message.type === "READ_MAIN_CONTENT") {
      const result = await resolveMainContentResult();
      sendResponse(speakText(result.text, settings, "main"));
      return;
    }

    if (message.type === "STOP_READING") {
      stopSpeech();
      sendResponse({ ok: true, message: "Reading stopped." });
      return;
    }

    if (message.type === "PREVIEW_TEXT") {
      const selection = getSelectedText();
      const main = await resolveMainContentResult();
      sendResponse({
        ok: true,
        selection,
        selectionLength: selection.length,
        mainContent: main.text.slice(0, 600),
        mainConfidence: main.confidence,
        playback: currentPlayback
      });
      return;
    }

    if (message.type === "GET_PLAYBACK_STATE") {
      sendResponse({
        ok: true,
        playback: currentPlayback
      });
    }
  })();

  return true;
});
