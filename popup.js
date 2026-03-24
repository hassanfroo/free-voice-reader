const STORAGE_KEY = "freeVoiceReaderSettings";

const DEFAULT_SETTINGS = {
  voiceName: "auto",
  rate: 1,
  pitch: 1,
  volume: 1
};

const voiceSelect = document.getElementById("voiceSelect");
const rateInput = document.getElementById("rateInput");
const rateValue = document.getElementById("rateValue");
const readButton = document.getElementById("readButton");
const readMainButton = document.getElementById("readMainButton");
const nextButton = document.getElementById("nextButton");
const stopButton = document.getElementById("stopButton");
const refreshButton = document.getElementById("refreshButton");
const status = document.getElementById("status");
const mainPreview = document.getElementById("mainPreview");
const actionSummary = document.getElementById("actionSummary");
const previewSourceLabel = document.getElementById("previewSourceLabel");
const confidenceBadge = document.getElementById("confidenceBadge");
const autoVoiceHint = document.getElementById("autoVoiceHint");
const speedPresets = Array.from(document.querySelectorAll(".speed-pill"));

let latestPreview = null;
let playbackPollHandle = null;

function setStatus(message) {
  status.textContent = message || "";
}

function updateSliderLabels() {
  const rate = Number(rateInput.value);
  rateValue.textContent = `${FreeVoiceReaderUi.getSpeedLabel(rate)} (${rate.toFixed(2)}x)`;
  speedPresets.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.rate) === rate);
  });
}

function getCurrentSettings() {
  return {
    voiceName: voiceSelect.value,
    rate: Number(rateInput.value),
    pitch: DEFAULT_SETTINGS.pitch,
    volume: DEFAULT_SETTINGS.volume
  };
}

function saveSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.set(
      {
        [STORAGE_KEY]: getCurrentSettings()
      },
      resolve
    );
  });
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] || {}) });
    });
  });
}

function getVoices() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) {
      resolve(voices);
      return;
    }

    speechSynthesis.onvoiceschanged = () => {
      resolve(speechSynthesis.getVoices());
    };

    window.setTimeout(() => {
      resolve(speechSynthesis.getVoices());
    }, 800);
  });
}

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  return tab.id;
}

async function sendTabMessage(type) {
  const tabId = await getActiveTabId();
  return chrome.tabs.sendMessage(tabId, { type });
}

function renderVoices(voices, selectedVoiceName) {
  voiceSelect.innerHTML = "";

  const autoOption = document.createElement("option");
  autoOption.value = "auto";
  autoOption.textContent = "Auto";
  voiceSelect.appendChild(autoOption);

  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  if (selectedVoiceName === "auto") {
    voiceSelect.value = "auto";
    return;
  }

  if (selectedVoiceName && voices.some((voice) => voice.name === selectedVoiceName)) {
    voiceSelect.value = selectedVoiceName;
    return;
  }

  voiceSelect.value = "auto";
}

function applyPreview(preview) {
  latestPreview = preview;
  const mode = FreeVoiceReaderUi.derivePageMode(preview);
  readButton.textContent = mode.actionLabel;
  actionSummary.textContent = mode.helperText;
  previewSourceLabel.textContent = mode.sourceLabel;
  confidenceBadge.textContent = preview.mainConfidence || "unknown";
  mainPreview.textContent =
    (mode.actionType === "READ_SELECTION" ? preview.selection : preview.mainContent) ||
    "No readable text detected.";
  autoVoiceHint.textContent =
    voiceSelect.value === "auto"
      ? `Auto voice: ${preview.autoVoiceLabel || "Browser default"}`
      : "Manual voice override is active.";
}

function formatPlaybackStatus(playback) {
  if (!playback || playback.status === "idle") {
    return "";
  }

  if (playback.status === "countdown") {
    return `Starting in ${playback.countdownRemaining} seconds at ${Number(rateInput.value).toFixed(2)}x.`;
  }

  const sourceLabel = playback.source === "selection" ? "selection" : "page";
  return `Reading ${sourceLabel}: paragraph ${playback.blockIndex} of ${playback.totalBlocks}.`;
}

async function refreshPreview() {
  const preview = await sendTabMessage("PREVIEW_TEXT");
  applyPreview(preview);
}

async function refreshPlaybackState() {
  try {
    const result = await sendTabMessage("GET_PLAYBACK_STATE");
    const playbackMessage = formatPlaybackStatus(result.playback);
    nextButton.disabled = !result.playback || result.playback.status === "idle";
    if (playbackMessage) {
      setStatus(playbackMessage);
      return;
    }

    if (status.textContent.startsWith("Reading ")) {
      setStatus("");
    }
  } catch (error) {
    // Ignore pages that cannot answer playback state.
  }
}

function startPlaybackPolling() {
  if (playbackPollHandle) {
    window.clearInterval(playbackPollHandle);
  }

  playbackPollHandle = window.setInterval(() => {
    refreshPlaybackState();
  }, 1200);
}

async function initialize() {
  const [voices, settings] = await Promise.all([getVoices(), loadSettings()]);

  renderVoices(voices, settings.voiceName);
  rateInput.value = String(settings.rate);
  updateSliderLabels();
  await saveSettings();

  try {
    await refreshPreview();
    startPlaybackPolling();
    nextButton.disabled = true;
  } catch (error) {
    setStatus("Open a normal web page to use the reader.");
    mainPreview.textContent = "Unavailable on this page.";
  }
}

async function runAction(type) {
  setStatus("Working...");
  await saveSettings();

  try {
    const result = await sendTabMessage(type);
    setStatus(result?.message || "Done.");
    await refreshPlaybackState();
    await refreshPreview();
  } catch (error) {
    setStatus("This page does not allow reading actions.");
  }
}

rateInput.addEventListener("input", async () => {
  updateSliderLabels();
  await saveSettings();
});

voiceSelect.addEventListener("change", async () => {
  await saveSettings();
  if (latestPreview) {
    applyPreview(latestPreview);
  }
});

readButton.addEventListener("click", () => {
  const mode = FreeVoiceReaderUi.derivePageMode(
    latestPreview || { selectionLength: 0, mainContent: "" }
  );
  runAction(mode.actionType);
});

readMainButton.addEventListener("click", () => runAction("READ_MAIN_CONTENT"));
nextButton.addEventListener("click", () => runAction("SKIP_FORWARD"));
stopButton.addEventListener("click", () => runAction("STOP_READING"));
refreshButton.addEventListener("click", async () => {
  setStatus("Refreshing preview...");

  try {
    await refreshPreview();
    setStatus("Preview refreshed.");
  } catch (error) {
    setStatus("Could not refresh this page.");
  }
});

speedPresets.forEach((button) => {
  button.addEventListener("click", async () => {
    rateInput.value = button.dataset.rate;
    updateSliderLabels();
    await saveSettings();
  });
});

initialize().catch(() => {
  setStatus("Unable to initialize the extension on this page.");
});
