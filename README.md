# Free Voice Reader

Free Voice Reader is a Chrome extension that reads either selected text or the main readable content of a page aloud using free built-in browser and operating-system voices.

## What it does

- Reads highlighted text on the current page
- Reads the main article or content area while skipping common navigation and sidebar elements
- Lets users choose a voice and adjust rate, pitch, and volume
- Works without API keys, paid services, or external voice providers

## Why this approach

This version uses the browser's native `speechSynthesis` voices, which keeps the extension free, simple to install, and privacy-friendly. It does not send page text to a third-party service.

## Project structure

- `manifest.json`: Chrome extension manifest
- `popup.html`, `popup.css`, `popup.js`: extension popup UI and controls
- `content.js`: text selection, content extraction, and speech playback

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click `Load unpacked`
4. Select this project folder

## How to use

1. Open any article or text-heavy page
2. Highlight text and click `Read Selection`, or click `Read Main Content`
3. Pick a different voice or adjust speech settings in the popup
4. Use `Stop` to cancel playback

## Notes

- The exact available voices depend on the user's browser and operating system
- Some special Chrome pages do not allow content scripts, so the extension will not run there
- Main-content extraction is heuristic based, so some sites may still need tuning

## Future improvements

- Keyboard shortcuts
- Context-menu actions for selected text
- Better article extraction with a dedicated readability parser
- Optional offline voice engines for higher-quality free voices
