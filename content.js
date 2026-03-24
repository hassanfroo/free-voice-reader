const STORAGE_KEY = "freeVoiceReaderSettings";

let availableVoices = [];
let queuedSpeakRequest = null;
let currentPlayback = {
  status: "idle",
  source: null,
  textLength: 0,
  chunkIndex: 0,
  totalChunks: 0,
  blockIndex: 0,
  totalBlocks: 0,
  countdownRemaining: 0,
  voiceLabel: ""
};
let activeChunkUtterance = null;
let activeQueue = [];
let activeQueueIndex = -1;
let activeChunkSettings = null;
let activeSourceMeta = null;
let activeCountdownTimer = null;
let activeUtteranceToken = 0;
let activeChunkCharIndex = 0;
let activeResumeCharIndex = 0;
let activePauseMode = "none";
let overlayRoot = null;
let overlayStatus = null;
let overlayPlayButton = null;
let overlayPauseButton = null;
let overlayBackButton = null;
let overlayNextButton = null;
let overlayStopButton = null;
let overlayExpandButton = null;
let overlayVoiceSelect = null;
let overlaySpeedSelect = null;
let overlayInlinePlayButton = null;
let overlayInlinePauseButton = null;
let activeHighlightedElement = null;
let overlayPinnedOpen = false;

const DEFAULT_SETTINGS = {
  voiceName: "auto",
  rate: 1.5,
  pitch: 1,
  volume: 1
};

function loadVoices() {
  availableVoices = speechSynthesis.getVoices();
  renderOverlayVoices();

  if (availableVoices.length && queuedSpeakRequest) {
    const pending = queuedSpeakRequest;
    queuedSpeakRequest = null;
    beginReading(pending.result, pending.settings, pending.source);
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

function buildSelectionResult(text) {
  return {
    text,
    blocks: text ? [text] : [],
    confidence: text ? "high" : "low",
    langHints: []
  };
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
  activeUtteranceToken += 1;
  speechSynthesis.cancel();
  if (activeCountdownTimer) {
    window.clearInterval(activeCountdownTimer);
    activeCountdownTimer = null;
  }
  activeChunkUtterance = null;
  activeQueue = [];
  activeQueueIndex = -1;
  activeChunkSettings = null;
  activeSourceMeta = null;
  activeChunkCharIndex = 0;
  activeResumeCharIndex = 0;
  activePauseMode = "none";
  queuedSpeakRequest = null;
  currentPlayback = {
    status: "idle",
    source: null,
    textLength: 0,
    chunkIndex: 0,
    totalChunks: 0,
    blockIndex: 0,
    totalBlocks: 0,
    countdownRemaining: 0,
    voiceLabel: ""
  };
  clearReadingMarker();
  syncOverlayControls();
  renderOverlayState();
}

function pauseSpeech() {
  if (currentPlayback.status !== "playing" || !activeChunkUtterance) {
    return { ok: false, message: "Nothing is currently playing." };
  }

  activePauseMode = "native";
  speechSynthesis.pause();
  currentPlayback.status = "paused";
  renderOverlayState();

  window.setTimeout(() => {
    if (currentPlayback.status !== "paused" || activePauseMode !== "native") {
      return;
    }

    if (speechSynthesis.paused) {
      return;
    }

    activePauseMode = "manual";
    activeUtteranceToken += 1;
    speechSynthesis.cancel();
    activeChunkUtterance = null;
  }, 140);

  return {
    ok: true,
    message: `Paused at paragraph ${currentPlayback.blockIndex}.`
  };
}

function resumeSpeech() {
  if (currentPlayback.status === "paused" && activeQueue.length && activeQueueIndex >= 0) {
    if (activePauseMode === "native" && (speechSynthesis.paused || activeChunkUtterance)) {
      speechSynthesis.resume();
      currentPlayback.status = "playing";
      renderOverlayState();

      window.setTimeout(() => {
        if (currentPlayback.status !== "playing" || activePauseMode !== "native") {
          return;
        }

        if (speechSynthesis.speaking) {
          return;
        }

        activePauseMode = "manual";
        speakCurrentQueueItem(activeChunkCharIndex);
      }, 220);

      return {
        ok: true,
        message: `Resumed at paragraph ${currentPlayback.blockIndex}.`
      };
    }

    activePauseMode = "manual";
    currentPlayback.status = "starting";
    renderOverlayState();
    speakCurrentQueueItem(activeChunkCharIndex);
    return {
      ok: true,
      message: `Resumed at paragraph ${currentPlayback.blockIndex}.`
    };
  }

  return { ok: false, message: "Nothing is paused right now." };
}

function getSelectedVoice(settings, sourceMeta) {
  if (settings.voiceName && settings.voiceName !== "auto") {
    return availableVoices.find((voice) => voice.name === settings.voiceName) || null;
  }

  return FreeVoiceReaderVoice.chooseVoiceForLanguage(
    availableVoices,
    sourceMeta?.langHints?.length ? sourceMeta.langHints : sourceMeta?.lang || document.documentElement.lang,
    sourceMeta?.text || ""
  );
}

function createUtterance(text, settings, sourceMeta) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Number(settings.rate) || DEFAULT_SETTINGS.rate;
  utterance.pitch = Number(settings.pitch) || DEFAULT_SETTINGS.pitch;
  utterance.volume = Number(settings.volume) || DEFAULT_SETTINGS.volume;

  const selectedVoice = getSelectedVoice(settings, sourceMeta);
  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  }

  return utterance;
}

function updatePlaybackFromQueueItem(item) {
  currentPlayback.chunkIndex = activeQueueIndex + 1;
  currentPlayback.totalChunks = activeQueue.length;
  currentPlayback.blockIndex = item.blockIndex + 1;
  currentPlayback.totalBlocks = activeSourceMeta?.blocks?.length || 0;
  focusCurrentBlock(item.blockIndex);
}

function clearReadingMarker() {
  if (!activeHighlightedElement) {
    return;
  }

  activeHighlightedElement.classList.remove("fvr-reading-target");
  activeHighlightedElement = null;
}

function findElementForBlockText(blockText) {
  const normalizedBlock = normalizeWhitespace(blockText);
  if (!normalizedBlock) {
    return null;
  }

  const shortPrefix = normalizedBlock.slice(0, 80);
  const candidates = Array.from(
    document.querySelectorAll("article p, article li, article blockquote, article pre, article h1, article h2, article h3, article h4, main p, main li, main blockquote, main pre, main h1, main h2, main h3, main h4, p, li, blockquote, pre, h1, h2, h3, h4")
  );

  return (
    candidates.find((element) => {
      const text = normalizeWhitespace(element.innerText || "");
      return text === normalizedBlock || text.includes(shortPrefix);
    }) || null
  );
}

function getElementLanguageHint(element) {
  if (!element) {
    return "";
  }

  const langElement = element.closest("[lang]");
  return (
    langElement?.getAttribute("lang") ||
    element.getAttribute("lang") ||
    ""
  );
}

function collectLanguageHintsForBlocks(blocks) {
  const hints = [];

  (blocks || []).forEach((blockText) => {
    const element = findElementForBlockText(blockText);
    const hintedLang = getElementLanguageHint(element);
    if (hintedLang) {
      hints.push({
        lang: hintedLang,
        weight: Math.max(40, normalizeWhitespace(blockText).length)
      });
    }
  });

  const metaLang = document
    .querySelector("meta[http-equiv='content-language']")
    ?.getAttribute("content");
  if (metaLang) {
    hints.push({ lang: metaLang, weight: 120 });
  }

  if (document.documentElement.lang) {
    hints.push({ lang: document.documentElement.lang, weight: 100 });
  }

  return hints;
}

function focusCurrentBlock(blockIndex) {
  clearReadingMarker();
  const blockText = activeSourceMeta?.blocks?.[blockIndex];
  if (!blockText) {
    return;
  }

  const element = findElementForBlockText(blockText);
  if (!element) {
    return;
  }

  activeHighlightedElement = element;
  activeHighlightedElement.classList.add("fvr-reading-target");
  activeHighlightedElement.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function saveOverlaySettings(patch) {
  return getStoredSettings().then(
    (settings) =>
      new Promise((resolve) => {
        chrome.storage.sync.set(
          {
            [STORAGE_KEY]: {
              ...settings,
              ...patch
            }
          },
          resolve
        );
      })
  );
}

function syncOverlayControls() {
  if (!overlayVoiceSelect || !overlaySpeedSelect) {
    return;
  }

  getStoredSettings().then((settings) => {
    if (!overlayVoiceSelect || !overlaySpeedSelect) {
      return;
    }
    overlayVoiceSelect.value = settings.voiceName || "auto";
    overlaySpeedSelect.value = String(settings.rate || DEFAULT_SETTINGS.rate);
  });
}

function renderOverlayVoices() {
  if (!overlayVoiceSelect) {
    return;
  }

  overlayVoiceSelect.innerHTML = "";
  const autoOption = document.createElement("option");
  autoOption.value = "auto";
  autoOption.textContent = "Auto voice";
  overlayVoiceSelect.appendChild(autoOption);

  availableVoices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    overlayVoiceSelect.appendChild(option);
  });

  syncOverlayControls();
}

function renderOverlaySpeeds() {
  if (!overlaySpeedSelect) {
    return;
  }

  overlaySpeedSelect.innerHTML = "";
  [0.85, 1, 1.25, 1.5, 2].forEach((rate) => {
    const option = document.createElement("option");
    option.value = String(rate);
    option.textContent = `${rate.toFixed(rate % 1 === 0 ? 0 : 2)}x`;
    overlaySpeedSelect.appendChild(option);
  });

  syncOverlayControls();
}

function finishPlayback() {
  currentPlayback.status = "idle";
  currentPlayback.source = null;
  currentPlayback.chunkIndex = 0;
  currentPlayback.totalChunks = 0;
  currentPlayback.textLength = 0;
  currentPlayback.blockIndex = 0;
  currentPlayback.totalBlocks = 0;
  currentPlayback.countdownRemaining = 0;
  currentPlayback.voiceLabel = "";
  activeChunkSettings = null;
  activeSourceMeta = null;
  activeQueue = [];
  activeQueueIndex = -1;
  activeChunkCharIndex = 0;
  activeResumeCharIndex = 0;
  activePauseMode = "none";
  clearReadingMarker();
  renderOverlayState();
}

function speakCurrentQueueItem(startCharIndex = 0) {
  const item = activeQueue[activeQueueIndex];
  if (!item || !activeChunkSettings) {
    stopSpeech();
    return;
  }

  let speakOffset = Math.max(0, Math.min(startCharIndex, item.text.length));
  while (speakOffset < item.text.length && /\s/.test(item.text.charAt(speakOffset))) {
    speakOffset += 1;
  }

  if (speakOffset >= item.text.length) {
    activeChunkUtterance = null;
    if (activeQueueIndex + 1 < activeQueue.length) {
      activeQueueIndex += 1;
      activeChunkCharIndex = 0;
      activeResumeCharIndex = 0;
      speakCurrentQueueItem();
      return;
    }

    finishPlayback();
    return;
  }

  const utterance = createUtterance(
    item.text.slice(speakOffset),
    activeChunkSettings,
    activeSourceMeta
  );
  const utteranceToken = ++activeUtteranceToken;
  activeChunkUtterance = utterance;
  activeResumeCharIndex = speakOffset;
  activeChunkCharIndex = speakOffset;
  activePauseMode = "none";
  currentPlayback.status = "playing";
  updatePlaybackFromQueueItem(item);
  renderOverlayState();

  utterance.onboundary = (event) => {
    if (utteranceToken !== activeUtteranceToken) {
      return;
    }

    if (typeof event.charIndex === "number") {
      activeChunkCharIndex = Math.min(
        item.text.length,
        activeResumeCharIndex + event.charIndex
      );
    }
  };

  utterance.onend = () => {
    if (utteranceToken !== activeUtteranceToken) {
      return;
    }

    activeChunkUtterance = null;
    activeChunkCharIndex = 0;
    activeResumeCharIndex = 0;

    if (activeQueueIndex + 1 < activeQueue.length) {
      activeQueueIndex += 1;
      speakCurrentQueueItem();
      return;
    }

    finishPlayback();
  };

  utterance.onerror = () => {
    if (utteranceToken !== activeUtteranceToken) {
      return;
    }

    stopSpeech();
  };

  speechSynthesis.speak(utterance);
}

function startQueuePlayback(settings, source) {
  if (!activeQueue.length || !activeSourceMeta) {
    return { ok: false, message: "No readable text found on this page." };
  }

  const chosenVoice = getSelectedVoice(settings, activeSourceMeta);
  currentPlayback.voiceLabel = chosenVoice
    ? `${chosenVoice.name} (${chosenVoice.lang})`
    : "Browser default";

  currentPlayback.status = "starting";
  renderOverlayState();
  speakCurrentQueueItem();

  const label = source === "selection" ? "selection" : "page";
  return {
    ok: true,
    message: `Reading ${label} (${currentPlayback.totalBlocks} blocks, ${currentPlayback.totalChunks} segment${currentPlayback.totalChunks === 1 ? "" : "s"}).`
  };
}

function beginReading(result, settings, source) {
  if (!result?.text) {
    return { ok: false, message: "No readable text found on this page." };
  }

  if (!availableVoices.length) {
    queuedSpeakRequest = { result, settings, source };
    loadVoices();
    return {
      ok: true,
      message: "Loading available voices. Playback will start automatically."
    };
  }

  stopSpeech();
  activeSourceMeta = {
    text: result.text,
    blocks: result.blocks?.length ? result.blocks : [result.text],
    lang: result.lang || document.documentElement.lang || "",
    langHints: result.langHints?.length
      ? result.langHints
      : collectLanguageHintsForBlocks(result.blocks?.length ? result.blocks : [result.text]),
    source
  };
  activeQueue = FreeVoiceReaderSpeech.buildSpeechQueueFromBlocks(
    activeSourceMeta.blocks
  );
  activeQueueIndex = 0;
  activeChunkSettings = settings;
  currentPlayback = {
    status: "queued",
    source,
    textLength: result.text.length,
    chunkIndex: 0,
    totalChunks: activeQueue.length,
    blockIndex: 0,
    totalBlocks: activeSourceMeta.blocks.length,
    countdownRemaining: 0,
    voiceLabel: ""
  };
  return startQueuePlayback(settings, source);
}

function skipForward() {
  if (!activeQueue.length || activeQueueIndex < 0) {
    return { ok: false, message: "Nothing is currently being read." };
  }

  const nextIndex = FreeVoiceReaderSpeech.getNextBlockQueueIndex(
    activeQueue,
    activeQueueIndex
  );

  if (nextIndex < 0) {
    stopSpeech();
    return { ok: true, message: "Reached the last paragraph." };
  }

  activeUtteranceToken += 1;
  speechSynthesis.cancel();
  activeChunkUtterance = null;
  if (activeCountdownTimer) {
    window.clearInterval(activeCountdownTimer);
    activeCountdownTimer = null;
  }

  activeQueueIndex = nextIndex;
  currentPlayback.countdownRemaining = 0;
  currentPlayback.status = "starting";
  renderOverlayState();
  speakCurrentQueueItem();

  return {
    ok: true,
    message: `Jumped to paragraph ${activeQueue[activeQueueIndex].blockIndex + 1}.`
  };
}

function skipBackward() {
  if (!activeQueue.length || activeQueueIndex < 0) {
    return { ok: false, message: "Nothing is currently being read." };
  }

  const previousIndex = FreeVoiceReaderSpeech.getPreviousBlockQueueIndex(
    activeQueue,
    activeQueueIndex
  );

  if (previousIndex < 0) {
    activeUtteranceToken += 1;
    speechSynthesis.cancel();
    activeChunkUtterance = null;
    if (activeCountdownTimer) {
      window.clearInterval(activeCountdownTimer);
      activeCountdownTimer = null;
    }
    activeQueueIndex = 0;
    currentPlayback.countdownRemaining = 0;
    currentPlayback.status = "starting";
    renderOverlayState();
    speakCurrentQueueItem();
    return { ok: true, message: "Jumped to the first paragraph." };
  }

  activeUtteranceToken += 1;
  speechSynthesis.cancel();
  activeChunkUtterance = null;
  if (activeCountdownTimer) {
    window.clearInterval(activeCountdownTimer);
    activeCountdownTimer = null;
  }

  activeQueueIndex = previousIndex;
  currentPlayback.countdownRemaining = 0;
  currentPlayback.status = "starting";
  renderOverlayState();
  speakCurrentQueueItem();

  return {
    ok: true,
    message: `Jumped back to paragraph ${activeQueue[activeQueueIndex].blockIndex + 1}.`
  };
}

function getOverlayLabel() {
  if (currentPlayback.status === "paused") {
    return "Play";
  }

  if (currentPlayback.status === "playing" || currentPlayback.status === "starting") {
    return "Play";
  }

  return "Read";
}

function renderOverlayState() {
  if (!overlayRoot) {
    return;
  }

  overlayRoot.classList.toggle("fvr-open", overlayPinnedOpen);
  overlayPlayButton.textContent = getOverlayLabel();
  overlayPlayButton.disabled = currentPlayback.status === "playing";
  overlayPauseButton.disabled = currentPlayback.status !== "playing";
  if (overlayInlinePlayButton) {
    overlayInlinePlayButton.disabled = currentPlayback.status === "playing";
  }
  if (overlayInlinePauseButton) {
    overlayInlinePauseButton.disabled = currentPlayback.status !== "playing";
  }
  overlayExpandButton.textContent = overlayPinnedOpen ? "Close" : "Set";
  overlayExpandButton.title = overlayPinnedOpen ? "Collapse settings" : "Open full settings";
  overlayBackButton.disabled =
    currentPlayback.status === "idle" ||
    currentPlayback.blockIndex <= 1;
  overlayNextButton.disabled =
    currentPlayback.status === "idle" ||
    currentPlayback.blockIndex >= currentPlayback.totalBlocks;
  overlayStopButton.disabled = currentPlayback.status === "idle";
  overlayStatus.textContent =
    currentPlayback.status === "idle"
      ? "Ready"
      : currentPlayback.status === "paused"
        ? `Paused at P${currentPlayback.blockIndex}/${currentPlayback.totalBlocks}`
        : `Reading P${currentPlayback.blockIndex}/${currentPlayback.totalBlocks}`;
}

function injectOverlay() {
  if (overlayRoot || !document.body) {
    return;
  }

  overlayRoot = document.createElement("div");
  overlayRoot.id = "free-voice-reader-overlay";
  overlayRoot.innerHTML = `
    <style>
      #free-voice-reader-overlay {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 2147483647;
        font-family: Arial, sans-serif;
        color: #2a221c;
      }
      #free-voice-reader-overlay .fvr-shell {
        width: 132px;
        min-height: 42px;
        border-radius: 16px;
        background: rgba(255, 249, 241, 0.96);
        border: 1px solid rgba(98, 67, 48, 0.22);
        box-shadow: 0 12px 28px rgba(59, 40, 26, 0.18);
        overflow: hidden;
        transition: width 120ms ease;
      }
      #free-voice-reader-overlay:hover .fvr-shell,
      #free-voice-reader-overlay.fvr-open .fvr-shell {
        width: 316px;
      }
      #free-voice-reader-overlay .fvr-main {
        display: block;
      }
      #free-voice-reader-overlay button {
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        padding: 0;
      }
      #free-voice-reader-overlay .fvr-topbar {
        display: grid;
        grid-template-columns: 42px 42px 48px;
        align-items: center;
      }
      #free-voice-reader-overlay .fvr-play {
        width: 42px;
        height: 42px;
        background: #a64926;
        color: white;
        font-size: 11px;
        font-weight: 700;
      }
      #free-voice-reader-overlay .fvr-pause {
        width: 42px;
        height: 42px;
        background: rgba(166, 73, 38, 0.12);
        color: #7c3316;
        font-size: 11px;
        font-weight: 700;
      }
      #free-voice-reader-overlay .fvr-expand-main {
        height: 42px;
        font-size: 11px;
        font-weight: 700;
      }
      #free-voice-reader-overlay .fvr-panel {
        display: grid;
        grid-template-columns: 1fr;
        gap: 6px;
        padding: 6px 10px;
        border-top: 1px solid rgba(98, 67, 48, 0.12);
      }
      #free-voice-reader-overlay:not(.fvr-open):hover .fvr-panel {
        display: grid;
      }
      #free-voice-reader-overlay:not(.fvr-open) .fvr-panel {
        display: none;
      }
      #free-voice-reader-overlay .fvr-settings {
        display: grid;
        grid-template-columns: 1fr 88px;
        gap: 6px;
        align-items: center;
      }
      #free-voice-reader-overlay .fvr-settings-labels {
        display: grid;
        grid-template-columns: 1fr 88px;
        gap: 6px;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: rgba(42, 34, 28, 0.74);
      }
      #free-voice-reader-overlay .fvr-actions {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 4px;
      }
      #free-voice-reader-overlay .fvr-status {
        font-size: 11px;
        min-height: 16px;
      }
      #free-voice-reader-overlay .fvr-icon {
        min-width: 0;
        height: 28px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        padding: 0 8px;
      }
      #free-voice-reader-overlay .fvr-icon:disabled,
      #free-voice-reader-overlay .fvr-play:disabled {
        opacity: 0.45;
        cursor: default;
      }
      #free-voice-reader-overlay .fvr-voice {
        width: 100%;
        border: 1px solid rgba(98, 67, 48, 0.2);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.9);
        padding: 4px 6px;
        font-size: 11px;
        color: #2a221c;
      }
      #free-voice-reader-overlay .fvr-speed {
        width: 100%;
        border: 1px solid rgba(98, 67, 48, 0.2);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.9);
        padding: 4px 6px;
        font-size: 11px;
        color: #2a221c;
      }
      .fvr-reading-target {
        outline: 3px solid rgba(166, 73, 38, 0.9) !important;
        background: rgba(255, 229, 214, 0.72) !important;
        border-radius: 6px;
        box-shadow: 0 0 0 6px rgba(166, 73, 38, 0.14);
        transition: background 160ms ease, box-shadow 160ms ease;
      }
    </style>
    <div class="fvr-shell">
      <div class="fvr-main">
        <div class="fvr-topbar">
          <button class="fvr-play" type="button">Read</button>
          <button class="fvr-pause" type="button" title="Pause">Pause</button>
          <button class="fvr-expand-main" type="button" title="Open full settings">Set</button>
        </div>
        <div class="fvr-panel">
          <span class="fvr-status">Ready</span>
          <div class="fvr-settings-labels">
            <span>Voice</span>
            <span>Speed</span>
          </div>
          <div class="fvr-settings">
            <select class="fvr-voice" title="Choose voice"></select>
            <select class="fvr-speed" title="Choose speed"></select>
          </div>
          <div class="fvr-actions">
            <button class="fvr-icon fvr-back" type="button" title="Previous paragraph"><<</button>
            <button class="fvr-icon fvr-play-inline" type="button" title="Play or resume">Play</button>
            <button class="fvr-icon fvr-pause-inline" type="button" title="Pause">Pause</button>
            <button class="fvr-icon fvr-next" type="button" title="Next paragraph">>></button>
            <button class="fvr-icon fvr-stop" type="button" title="Stop">[]</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlayRoot);
  overlayStatus = overlayRoot.querySelector(".fvr-status");
  overlayPlayButton = overlayRoot.querySelector(".fvr-play");
  overlayPauseButton = overlayRoot.querySelector(".fvr-pause");
  overlayExpandButton = overlayRoot.querySelector(".fvr-expand-main");
  overlayBackButton = overlayRoot.querySelector(".fvr-back");
  overlayNextButton = overlayRoot.querySelector(".fvr-next");
  overlayStopButton = overlayRoot.querySelector(".fvr-stop");
  overlayVoiceSelect = overlayRoot.querySelector(".fvr-voice");
  overlaySpeedSelect = overlayRoot.querySelector(".fvr-speed");
  overlayInlinePlayButton = overlayRoot.querySelector(".fvr-play-inline");
  overlayInlinePauseButton = overlayRoot.querySelector(".fvr-pause-inline");

  overlayRoot.addEventListener("mouseenter", () => {
    if (!overlayPinnedOpen) {
      overlayRoot.classList.add("fvr-open");
    }
  });

  overlayRoot.addEventListener("mouseleave", () => {
    if (!overlayPinnedOpen) {
      overlayRoot.classList.remove("fvr-open");
    }
  });

  const handlePlay = async () => {
    if (currentPlayback.status === "paused") {
      resumeSpeech();
      return;
    }

    const settings = await getStoredSettings();
    const selection = getSelectedText();
    if (selection) {
      beginReading(buildSelectionResult(selection), settings, "selection");
      return;
    }

    const main = await resolveMainContentResult();
    beginReading(main, settings, "main");
  };

  overlayPlayButton.addEventListener("click", handlePlay);
  overlayInlinePlayButton.addEventListener("click", handlePlay);

  const handlePause = () => {
    pauseSpeech();
  };

  overlayPauseButton.addEventListener("click", handlePause);
  overlayInlinePauseButton.addEventListener("click", handlePause);

  overlayBackButton.addEventListener("click", () => {
    skipBackward();
  });

  overlayVoiceSelect.addEventListener("change", async () => {
    await saveOverlaySettings({ voiceName: overlayVoiceSelect.value });
    renderOverlayState();
  });

  overlaySpeedSelect.addEventListener("change", async () => {
    await saveOverlaySettings({ rate: Number(overlaySpeedSelect.value) });
    renderOverlayState();
  });

  overlayExpandButton.addEventListener("click", () => {
    overlayPinnedOpen = !overlayPinnedOpen;
    renderOverlayState();
  });

  overlayNextButton.addEventListener("click", () => {
    skipForward();
  });

  overlayStopButton.addEventListener("click", () => {
    stopSpeech();
  });

  renderOverlayVoices();
  renderOverlaySpeeds();
  renderOverlayState();
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

      sendResponse(beginReading(buildSelectionResult(text), settings, "selection"));
      return;
    }

    if (message.type === "READ_MAIN_CONTENT") {
      const result = await resolveMainContentResult();
      sendResponse(beginReading(result, settings, "main"));
      return;
    }

    if (message.type === "STOP_READING") {
      stopSpeech();
      sendResponse({ ok: true, message: "Reading stopped." });
      return;
    }

    if (message.type === "PAUSE_READING") {
      sendResponse(pauseSpeech());
      return;
    }

    if (message.type === "RESUME_READING") {
      sendResponse(resumeSpeech());
      return;
    }

    if (message.type === "PREVIEW_TEXT") {
      const selection = getSelectedText();
      const main = await resolveMainContentResult();
      const langHints = collectLanguageHintsForBlocks(
        main.blocks?.length ? main.blocks : [main.text]
      );
      const autoVoice = FreeVoiceReaderVoice.chooseVoiceForLanguage(
        availableVoices,
        langHints.length ? langHints : main.lang || document.documentElement.lang,
        main.text
      );
      sendResponse({
        ok: true,
        selection,
        selectionLength: selection.length,
        mainContent: main.text.slice(0, 600),
        mainConfidence: main.confidence,
        playback: currentPlayback,
        autoVoiceLabel: autoVoice
          ? `${autoVoice.name} (${autoVoice.lang})`
          : "Browser default"
      });
      return;
    }

    if (message.type === "GET_PLAYBACK_STATE") {
      sendResponse({
        ok: true,
        playback: currentPlayback
      });
      return;
    }

    if (message.type === "SKIP_FORWARD") {
      sendResponse(skipForward());
      return;
    }

    if (message.type === "SKIP_BACKWARD") {
      sendResponse(skipBackward());
      return;
    }
  })();

  return true;
});

injectOverlay();
renderOverlayVoices();
