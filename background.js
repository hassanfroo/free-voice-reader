const MENU_IDS = {
  readSelection: "free-voice-reader-read-selection",
  readPage: "free-voice-reader-read-page",
  back: "free-voice-reader-back",
  next: "free-voice-reader-next",
  stop: "free-voice-reader-stop"
};

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_IDS.readSelection,
      title: "Read selected text",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: MENU_IDS.readPage,
      title: "Read main page content",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: MENU_IDS.stop,
      title: "Stop reading",
      contexts: ["page", "selection"]
    });
    chrome.contextMenus.create({
      id: MENU_IDS.next,
      title: "Next paragraph",
      contexts: ["page", "selection"]
    });
    chrome.contextMenus.create({
      id: MENU_IDS.back,
      title: "Previous paragraph",
      contexts: ["page", "selection"]
    });
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

async function sendToTab(tabId, type) {
  if (!tabId) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type });
  } catch (error) {
    // Ignore pages that do not allow content scripts.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_IDS.readSelection) {
    sendToTab(tab?.id, "READ_SELECTION");
    return;
  }

  if (info.menuItemId === MENU_IDS.readPage) {
    sendToTab(tab?.id, "READ_MAIN_CONTENT");
    return;
  }

  if (info.menuItemId === MENU_IDS.stop) {
    sendToTab(tab?.id, "STOP_READING");
    return;
  }

  if (info.menuItemId === MENU_IDS.next) {
    sendToTab(tab?.id, "SKIP_FORWARD");
    return;
  }

  if (info.menuItemId === MENU_IDS.back) {
    sendToTab(tab?.id, "SKIP_BACKWARD");
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const tab = await getActiveTab();

  if (command === "read-page") {
    sendToTab(tab?.id, "READ_MAIN_CONTENT");
    return;
  }

  if (command === "stop-reading") {
    sendToTab(tab?.id, "STOP_READING");
    return;
  }

  if (command === "next-paragraph") {
    sendToTab(tab?.id, "SKIP_FORWARD");
    return;
  }

  if (command === "previous-paragraph") {
    sendToTab(tab?.id, "SKIP_BACKWARD");
  }
});
