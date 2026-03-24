const STORAGE_KEY = "freeVoiceReaderSettings";

const DEFAULT_SETTINGS = {
  voiceName: "",
  rate: 1,
  pitch: 1,
  volume: 1
};

const voiceSelect = document.getElementById("voiceSelect");
const rateInput = document.getElementById("rateInput");
const pitchInput = document.getElementById("pitchInput");
const volumeInput = document.getElementById("volumeInput");
const rateValue = document.getElementById("rateValue");
const pitchValue = document.getElementById("pitchValue");
const volumeValue = document.getElementById("volumeValue");
const readSelectionButton = document.getElementById("readSelectionButton");
const readMainButton = document.getElementById("readMainButton");
const stopButton = document.getElementById("stopButton");
const status = document.getElementById("status");
const selectionPreview = document.getElementById("selectionPreview");
const mainPreview = document.getElementById("mainPreview");

function setStatus(message) {
  status.textContent = message || "";
}

function updateSliderLabels() {
  rateValue.textContent = Number(rateInput.value).toFixed(1);
  pitchValue.textContent = Number(pitchInput.value).toFixed(1);
  volumeValue.textContent = Number(volumeInput.value).toFixed(1);
}

function getCurrentSettings() {
  return {
    voiceName: voiceSelect.value,
    rate: Number(rateInput.value),
    pitch: Number(pitchInput.value),
    volume: Number(volumeInput.value)
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

  voices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  if (selectedVoiceName && voices.some((voice) => voice.name === selectedVoiceName)) {
    voiceSelect.value = selectedVoiceName;
  } else if (voices.length) {
    const preferredVoice =
      voices.find((voice) => voice.default) ||
      voices.find((voice) => voice.lang.startsWith("en")) ||
      voices[0];
    voiceSelect.value = preferredVoice.name;
  }
}

async function initialize() {
  const [voices, settings] = await Promise.all([getVoices(), loadSettings()]);

  renderVoices(voices, settings.voiceName);
  rateInput.value = String(settings.rate);
  pitchInput.value = String(settings.pitch);
  volumeInput.value = String(settings.volume);
  updateSliderLabels();
  await saveSettings();

  try {
    const preview = await sendTabMessage("PREVIEW_TEXT");
    selectionPreview.textContent = preview.selection || "Nothing selected yet.";
    mainPreview.textContent = preview.mainContent || "No main content detected.";
  } catch (error) {
    setStatus("Open a normal web page to use the reader.");
    selectionPreview.textContent = "Unavailable on this page.";
    mainPreview.textContent = "Unavailable on this page.";
  }
}

async function runAction(type) {
  setStatus("Working…");
  await saveSettings();

  try {
    const result = await sendTabMessage(type);
    setStatus(result?.message || "Done.");
  } catch (error) {
    setStatus("This page does not allow reading actions.");
  }
}

[rateInput, pitchInput, volumeInput].forEach((input) => {
  input.addEventListener("input", () => {
    updateSliderLabels();
    saveSettings();
  });
});

voiceSelect.addEventListener("change", saveSettings);
readSelectionButton.addEventListener("click", () => runAction("READ_SELECTION"));
readMainButton.addEventListener("click", () => runAction("READ_MAIN_CONTENT"));
stopButton.addEventListener("click", () => runAction("STOP_READING"));

initialize().catch(() => {
  setStatus("Unable to initialize the extension on this page.");
});
