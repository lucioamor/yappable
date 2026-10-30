# Page reader implementation — 2026-10-23

Target: the `yappable/` chat extension, not the separate Lovable build.

1. Reuse Download as Markdown's extraction helpers and its vendored Mozilla
   Readability, including heading and paragraph fixes for Substack. Extract from
   a clone of the currently loaded DOM. Remove images, controls and URLs; keep
   descriptive link text as prose. No inference, summary, translation or model
   language detection in this path. Readability is a deterministic heuristic.
2. Add a context-menu entry and popup action using activeTab/scripting, without
   persistent access to every website. Chrome controls ordering relative to
   other extensions' menu entries. Open the existing floating player. Default
   to explicit Play; optional autoplay applies only after opening this reader.
3. Reuse native speech and ElevenLabs streaming/cache. Synthesize sequential
   blocks (about 1,200 characters), starting the first before generating the
   rest. Native speech is free of ElevenLabs usage; ElevenLabs still performs
   paid speech synthesis when selected. Replay can use the existing cache.
4. Show total text-based duration/progress as approximate (~150 words/minute).
   Native positions depend on speech boundary events; streamed audio duration
   is unknown until available. Seek operates within the current audio block,
   not across the entire article. Stop cancels the reading; Read aloud restarts.
5. Expose Read aloud for an already loaded latest AI reply, without requiring
   a new generation or clicking the site's own control. Manual reading bypasses
   the existing automatic reply interpretation path.
6. Fix hidden waveform CSS and prevent the MAIN-world media hook from adopting
   Yappable-owned audio as site audio, which can stop its original source.

Validation: automated local tests, syntax checks, ZIP inspection, and a manual
Chrome gate. No live ElevenLabs calls are required for local validation.

Manual Chrome acceptance after reloading the extension and refreshing chat tabs:

- Empty chat: no waveform. Existing reply: Read aloud visible.
- ChatGPT native read-aloud: pause/resume retains position; stop then read again.
- Yappable voice: pause/resume without a second synthesis request.
- Substack: right-click and popup extraction; title/headings/prose preserved,
  images and URLs silent. Paywalled/unloaded text is not available.
- Autoplay off/on, pause during a block, stop while preparing, repeated opens,
  long articles, cross-tab FIFO, cached replay and network failure.
- Check a generic article and a protected Chrome page (clear failure).

Limits: top-frame DOM only; no paywall bypass, iframe extraction, OCR or automatic
reading on navigation. Third-party site audio implementations require live QA.

## Structured delivery (1.1.3)

The extractor retains headings, bold runs, explicit line breaks and paragraphs.
Native speech slows headings and bold runs slightly and inserts timed pauses.
ElevenLabs v2 models receive SSML breaks; v3/v4 receive short/long pause tags.
Reference pauses: line 350 ms, paragraph 650 ms, heading 1000 ms. Tags on v3/v4
are qualitative, not exact timers. Short bold phrases receive capitalization as
an emphasis cue; voice/model behavior remains approximate. No LLM rewrites text.
Requests keep paragraph boundaries where possible and at most six boundary cues
per chunk to limit excessive pause tags. Long runs remain bounded; existing
streaming and cache are reused. Native fallback never speaks ElevenLabs markup.

Language comes from article/page metadata, with an editable Reading language
selector. Missing metadata leaves ElevenLabs language automatic; native speech
falls back to the configured narration language. Language enforcement does not
change the accent of a chosen voice. Test delivery with the actual chosen voice.

The supplied Elena Verna article was fetched for local extraction QA: English,
10 headings including title, 2 bold runs, full text preserved through chunking.
Tests use simulated API responses; no paid synthesis or audible quality validation
was performed.
