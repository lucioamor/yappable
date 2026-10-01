# Yappable: read ChatGPT, Claude, Gemini & Grok replies aloud

Hear every AI reply aloud. Yappable reads finished **ChatGPT**, **Claude**, **Gemini** and **Grok**
replies the moment they land, one voice at a time, even when you have several chats open.

*Independent extension. Not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google or xAI.
The AI names identify the sites the extension works on.*

> Ask the same question to several AIs, then just listen: each one introduces itself and answers in turn.

## Features

- **Reads replies automatically** when the AI finishes, no click needed.
- **One voice at a time across tabs.** Replies queue in completion order; starting one pauses the others
  (never stops them). A paused reading keeps its turn for up to 10 minutes.
- **Every reply says who is speaking** ("Claude's reply:" or the casual "Hi, this is Claude speaking."),
  localized to your narration language.
- **Three voice modes:** your system voice, ElevenLabs (bring your own key) or each site's own read-aloud voice.
- **One ElevenLabs voice per AI**, so you can tell them apart by ear.
- **Floating player** in each chat tab: play/pause, speed, `Alt+K`, waveform and an "Up next" queue.
- **Summary levels** (Fast, Beginner, Advanced, Full) using Chrome's on-device AI when available.
- **Local daily statistics** (words, minutes, replies). Nothing is sent anywhere.
- **Scoped permissions:** only the four chat sites and `api.elevenlabs.io`.

## Install

Chrome Web Store: _link after publication_. To try the source: `chrome://extensions` → Developer mode →
**Load unpacked** → select this folder.

## Privacy

100% local by default. Native speech and on-device summaries run in the browser. ElevenLabs is optional:
when enabled, only the reply text to be read is sent, and your key is stored in `chrome.storage.local`,
never synced. See [docs/privacy-policy.md](docs/privacy-policy.md).

## Development

```bash
npm test               # unit tests (node:test)
npm run qa             # syntax check + tests
npm run package        # yappable-<version>.zip for the Chrome Web Store
npm run check-shared   # compare shared files with ../yappable-for-lovable, if present
```

Layout: `src/` (service worker, adapters, narrator, player), `popup/`, `assets/platforms/`, `docs/`,
`scripts/`, `tests/`. Per-site DOM notes live in [docs/CHAT-SITES-DOM.md](docs/CHAT-SITES-DOM.md).

`src/stats.js` and `src/tts-provider.js` are shared with
[Yappable for Lovable](https://github.com/lucioamor/yappable-for-lovable) and must stay in sync.

## License

Source-available, all rights reserved. Free to use unmodified and to read for verification; no derivatives
or redistribution. See [LICENSE](LICENSE).
