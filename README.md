# Free Voice Reader

Free Voice Reader is a Chrome extension that reads either selected text or the main readable content of a page aloud using free built-in browser and operating-system voices.

## What it does

- Reads highlighted text on the current page
- Reads the main article or content area while skipping common navigation and sidebar elements
- Lets users choose a voice and set a comfortable reading speed
- Adds right-click actions and keyboard shortcuts for faster use
- Works without API keys, paid services, or external voice providers

## Why this approach

This version uses the browser's native `speechSynthesis` voices, which keeps the extension free, simple to install, and privacy-friendly. It does not send page text to a third-party service.

## Project structure

- `manifest.json`: Chrome extension manifest
- `background.js`: context-menu and keyboard-shortcut actions
- `extraction-core.js`, `speech-core.js`, `ui-core.js`: shared logic for extraction, playback chunking, and popup decisions
- `popup.html`, `popup.css`, `popup.js`: extension popup UI and controls
- `content.js`: text selection, content extraction, and speech playback
- `tests/`: lightweight Node-based behavioral tests

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click `Load unpacked`
4. Select this project folder

## How to use

1. Open any article or text-heavy page
2. Highlight text and click the main button to read the selection, or let the extension read the main page automatically
3. Pick a different voice or adjust the reading speed in the popup
4. Use `Stop` to cancel playback
5. Optional: right-click for quick actions or use keyboard shortcuts

## Shortcuts

- `Ctrl+Shift+S`: read selected text
- `Ctrl+Shift+P`: read the main page content
- `Ctrl+Shift+X`: stop reading

## Notes

- The exact available voices depend on the user's browser and operating system
- Some special Chrome pages do not allow content scripts, so the extension will not run there
- Main-content extraction is heuristic based, so some sites may still need tuning
- On dynamic pages, the extension briefly retries weak extractions before giving up

## Future improvements

- Keyboard shortcuts
- Context-menu actions for selected text
- Better article extraction with a dedicated readability parser
- Optional offline voice engines for higher-quality free voices
