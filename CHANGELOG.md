# Changelog

All notable changes to **Yappable for your AI** are documented here.
This project adheres to [Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-09-30

First release. Split out of Yappable for Lovable (`yappable-for-lovable@546012c`, 1.3.0 development
line) so the chat narration lives in its own extension with its own permissions.

### Added
- Reads finished ChatGPT, Claude, Gemini and Grok replies aloud, in three voice modes: the system
  voice, ElevenLabs (bring your own key) or the site's own read-aloud voice.
- One voice at a time across tabs: replies queue in completion order; whoever starts playing pauses
  the others, and a paused reading keeps its turn for up to 10 minutes.
- Floating per-tab player with play/pause, speed, Alt+K shortcut and an "Up next" queue.
- Every reply is introduced by its AI (concise or casual intro, localized).
- One ElevenLabs voice per AI, on-device summary levels (Fast, Beginner, Advanced, Full),
  daily local statistics, onboarding with platform selection.
