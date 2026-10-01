# Changelog

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
