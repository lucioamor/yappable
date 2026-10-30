# Changelog

## [1.1.3] - 2026-10-23

- Preserve page headings, bold text, line breaks and paragraphs in a deterministic
  speech plan. Add model-compatible pause cues and short bold emphasis; native
  speech uses slower heading/emphasis delivery and timed pauses.
- Show the article language with a manual override. Prefer article/page metadata;
  do not treat browser UI language as the article language. Send explicit language
  to compatible ElevenLabs models, or leave it automatic when metadata is missing.
- Keep speech markup out of native fallback and history text. Cache keys include
  the formatted synthesis text and language so older flat audio is not reused.

## [1.1.2] - 2026-10-23

- Explain unsupported internal pages and missing reader responses; preserve browser
  errors in the popup and context-menu failure tooltip. Read from the original
  article, not Chrome's built-in Reading mode interface.

## [1.1.1] - 2026-10-23

- Color both player waveforms by source: ChatGPT green, Claude orange, Gemini
  blue, Grok gold, and Substack/other pages pink, for both site and Yappable voices.

## [1.1.0] - 2026-10-23

- Read pages from the context menu or popup with local Readability extraction,
  optional autoplay, streaming speech blocks and estimated total progress.
- Read an existing latest chat reply directly from the floating player.
- Honor hidden player elements and keep Yappable audio out of the site bridge.
- Add activeTab, scripting and contextMenus permissions for explicit page reads.

All notable changes to **Yappable** are documented here.
This project adheres to [Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-10-01

First release. Split out of Yappable for Lovable (`yappable-for-lovable@546012c`, 1.3.0 development
line) so the chat narration lives in its own extension with its own permissions.

### Added
- Streaming ElevenLabs playback (`/stream` + MediaSource): audio starts on the first chunks instead of
  after the whole MP3, with any model (Flash v2.5, v3, v3 Conversational, v4, v4 Turbo). The finished MP3
  still goes to the cache. Falls back to the full download for non-MP3 qualities or when MediaSource is
  missing; a stalled stream (15 s without data) is aborted. Toggle: Settings → Stream audio.
- Persistent ElevenLabs audio cache (IndexedDB, 50 MB, least-recently-used eviction): the same text with
  the same voice and settings is never generated or billed twice.
- Narration history in Settings: replay, download MP3, copy text, open source page, delete audio and
  record independently. Toggles to turn the cache and the history off; buttons to clear them.
- `api.elevenlabs.io` is an optional host permission, requested only when ElevenLabs is turned on.
- Reads finished ChatGPT, Claude, Gemini and Grok replies aloud, in three voice modes: the system
  voice, ElevenLabs (bring your own key) or the site's own read-aloud voice.
- One voice at a time across tabs: replies queue in completion order; whoever starts playing pauses
  the others, and a paused reading keeps its turn for up to 10 minutes.
- Floating per-tab player with play/pause, speed, Alt+K shortcut and an "Up next" queue.
- Every reply is introduced by its AI (concise or casual intro, localized).
- One ElevenLabs voice per AI, on-device summary levels (Fast, Beginner, Advanced, Full),
  daily local statistics, onboarding with platform selection.
