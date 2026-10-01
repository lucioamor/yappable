# Chrome Web Store: Listing Copy

Copy/paste source for the Yappable for your AI listing. Keep in sync with `manifest.json`, `README.md`, `CHANGELOG.md`.

## Name (max 75 chars)

```
Yappable: read ChatGPT, Claude, Gemini & Grok replies aloud
```

## Short description (max 132 chars)

```
Hear every AI reply aloud: ChatGPT, Claude, Gemini, Grok. One voice at a time across tabs. Native or ElevenLabs voices.
```

## Detailed description

**Hear every AI reply, hands-free.** Yappable reads finished ChatGPT, Claude, Gemini and Grok replies aloud the
moment they land, so you can keep working, cooking or thinking without staring at the screen.

**Ask several AIs, then just listen.** Send the same question to a few chats. Each AI introduces itself and answers
in turn, in completion order, with one voice at a time across all your tabs. Starting one pauses the others, never
cuts them off.

### What it does

- **Reads replies automatically** as soon as the AI finishes.
- **Says who is speaking.** Every reply starts with "Claude's reply:" (or a casual intro), in your language.
- **One voice at a time across tabs**, with an "Up next" queue in the player.
- **Three voices:** your system voice, ElevenLabs (bring your own key) or each site's own read-aloud voice.
- **A different ElevenLabs voice per AI**, to tell them apart by ear.
- **Floating player** per tab: play/pause, speed, Alt+K shortcut, waveform.
- **Summary levels:** Fast, Beginner, Advanced or Full, using Chrome's on-device AI when available.
- **Local daily stats.** No analytics.

### Privacy

100% local by default. Native speech and on-device summaries run in your browser. ElevenLabs is optional: if you
enable it, only the reply text to be read is sent to generate audio, and your key stays in local storage, never synced.
Runs only on ChatGPT, Claude, Gemini and Grok.

*Independent extension. Not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google or xAI.*

## Category / privacy

Category: Productivity. Single purpose: read AI chat replies aloud. Data collection: none by the developer.
Host permission justification: the four chat sites (read the latest finished reply, show the player) and
`api.elevenlabs.io` (optional host permission, requested only when the user turns on ElevenLabs, for voice generation with the user's own key).
