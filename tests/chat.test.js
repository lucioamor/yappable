"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("manifest is internally consistent", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);

  const referenced = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((entry) => entry.js),
    ...Object.values(manifest.icons)
  ];
  for (const relative of referenced) {
    assert.ok(fs.existsSync(path.join(root, relative)), `missing manifest file: ${relative}`);
  }
});

test("manifest asks only for chat sites, ElevenLabs is optional, with no Lovable or network-rule leftovers", () => {
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.ok(manifest.name.length <= 75, "store name over 75 chars");
  assert.ok(manifest.description.length <= 132, "store description over 132 chars");
  const hosts = new Set(manifest.host_permissions.map((h) => h.replace(/^https:\/\/|\/\*$/g, "")));
  assert.deepEqual([...hosts].sort(), ["chat.openai.com", "chatgpt.com", "claude.ai", "gemini.google.com", "grok.com"]);
  assert.deepEqual(manifest.optional_host_permissions, ["https://api.elevenlabs.io/*"]);
  assert.equal(manifest.declarative_net_request, undefined);
  assert.doesNotMatch(JSON.stringify(manifest), /lovable/i);
});

test("changelog contains the manifest release", () => {
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, new RegExp(`\\[${manifest.version.replaceAll(".", "\\.")}\\]`));
});

test("ElevenLabs verification uses the current voices endpoint and distinguishes forbidden keys", async () => {
  let requestedUrl = "";
  const context = {
    AbortController,
    clearTimeout,
    setTimeout,
    fetch: async (url) => {
      requestedUrl = url;
      return { ok: false, status: 403 };
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "src", "tts-provider.js"), "utf8"), context);
  const result = await context.YapTts.verify("test-key");
  assert.equal(requestedUrl, "https://api.elevenlabs.io/v2/voices?page_size=100");
  assert.equal(result.reason, "forbidden");
});

test("ElevenLabs verification does not call the API without the optional permission", async () => {
  let called = false;
  const context = {
    AbortController, clearTimeout, setTimeout,
    chrome: { runtime: {}, permissions: { contains: (_o, cb) => cb(false) } },
    fetch: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "src", "tts-provider.js"), "utf8"), context);
  assert.equal((await context.YapTts.verify("k")).reason, "no_permission");
  assert.equal(await context.YapTts.quota("k"), null);
  assert.equal(called, false);
});

test("Flash v2.5 defaults to API-safe automatic text normalization", () => {
  for (const relative of ["popup/popup.js", "src/chat-narrator.js"]) {
    const source = fs.readFileSync(path.join(root, relative), "utf8");
    assert.match(source, /elevenTextNormalization:\s*"auto"/, relative);
  }
});

test("default popup does not load remote executable or flag assets", () => {
  const html = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");
  const js = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:\/\//i);
  assert.doesNotMatch(js, /flagcdn\.com/i);
});

test("background seeds defaults and opens onboarding once", () => {
  let onInstalled;
  const syncWrites = [];
  const createdTabs = [];
  const context = {
    chrome: {
      i18n: { getUILanguage: () => "pt-BR" },
      runtime: {
        getURL: (relative) => `chrome-extension://test/${relative}`,
        onInstalled: { addListener: (fn) => { onInstalled = fn; } }
      },
      storage: {
        local: { get: (_defaults, cb) => cb({ onboardingDone: false }), set: (_val, cb) => { if (cb) cb(); } },
        sync: {
          get: (keys, cb) => {
            if (Array.isArray(keys)) cb({});
            else if (Object.prototype.hasOwnProperty.call(keys, "elevenModel")) cb({ elevenModel: "eleven_turbo_v2_5" });
            else cb({ lang: "" });
          },
          set: (value) => syncWrites.push(value)
        }
      },
      tabs: {
        create: (value) => createdTabs.push(value),
        query: (_query, cb) => cb([{ id: 1 }, { id: 2 }])
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "src", "background.js"), "utf8"), context);

  onInstalled({ reason: "install" });
  assert.ok(syncWrites.some((value) => value.lang === "pt-BR"));
  assert.ok(syncWrites.some((value) => value.enabled === true && value.mode === "beginner"));
  assert.ok(syncWrites.some((value) => value.elevenModel === "eleven_flash_v2_5"));
  assert.equal(createdTabs.length, 1);
  assert.equal(createdTabs[0].url, "chrome-extension://test/popup/onboarding.html");
});

// Loads background.js in a sandbox and returns fake ports that record what the
// coordinator sends them. `granted(port)` filters YAP_AUDIO_GRANTED job ids.
function loadCoordinator() {
  let onConnect;
  const context = {
    Date,
    clearTimeout,
    setTimeout,
    chrome: {
      runtime: {
        lastError: null,
        onInstalled: { addListener() {} },
        onMessage: { addListener() {} },
        onConnect: { addListener: (fn) => { onConnect = fn; } }
      },
      storage: {
        local: { get: (_defaults, cb) => cb({ auth: { v: 1 } }), set() {} },
        sync: { get: (_defaults, cb) => cb({ elevenModel: "eleven_flash_v2_5" }), set() {} }
      },
      tabs: { query: (_query, cb) => cb([]) }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "src", "background.js"), "utf8"), context);
  const fakePort = () => {
    let receive;
    let disconnect;
    return {
      name: "yappable-chat-audio",
      sent: [],
      onMessage: { addListener: (fn) => { receive = fn; } },
      onDisconnect: { addListener: (fn) => { disconnect = fn; } },
      postMessage(message) { this.sent.push(message); },
      emit(message) { receive(message); },
      disconnect() { disconnect(); },
      of(type) { return this.sent.filter((m) => m.type === type); },
      granted() { return this.of("YAP_AUDIO_GRANTED").map((m) => m.jobId); },
      last(type) { const l = this.of(type); return JSON.parse(JSON.stringify(l[l.length - 1])); } // clone: vm realm objects fail deepEqual
    };
  };
  const connect = (platform) => {
    const port = fakePort();
    onConnect(port);
    port.emit({ type: "YAP_HELLO", jobId: "hello", platform, state: "idle" });
    return port;
  };
  return { connect };
}

test("cross-tab audio coordinator grants ready replies in enqueue order", () => {
  const { connect } = loadCoordinator();
  const first = connect("chatgpt");
  const second = connect("claude");
  first.emit({ type: "YAP_AUDIO_ENQUEUE", jobId: "first", platform: "chatgpt" });
  second.emit({ type: "YAP_AUDIO_ENQUEUE", jobId: "second", platform: "claude" });
  second.emit({ type: "YAP_AUDIO_READY", jobId: "second" });
  assert.deepEqual(second.granted(), [], "later reply must not bypass an unready head");
  first.emit({ type: "YAP_AUDIO_READY", jobId: "first" });
  assert.deepEqual(first.granted(), ["first"]);
  assert.deepEqual(second.granted(), []);
  first.emit({ type: "YAP_AUDIO_DONE", jobId: "first" });
  assert.deepEqual(second.granted(), ["second"]);
});

test("a reading the user started keeps the floor: queued replies wait, never talk over it", () => {
  const { connect } = loadCoordinator();
  const grok = connect("grok");
  const gemini = connect("gemini");
  // The user clicks Grok's own read-aloud button (not a queued job).
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "playing" });
  // Gemini finishes a reply while Grok is still talking.
  gemini.emit({ type: "YAP_AUDIO_ENQUEUE", jobId: "g1", platform: "gemini" });
  gemini.emit({ type: "YAP_AUDIO_READY", jobId: "g1" });
  assert.deepEqual(gemini.granted(), [], "must wait for the reading already playing");
  assert.equal(grok.of("YAP_PAUSE_NOW").length, 0, "the playing tab is never paused by a queued reply");
  // The modal in Gemini's tab shows what plays elsewhere and what is next.
  const view = gemini.last("YAP_QUEUE");
  assert.deepEqual(view.others, [{ platform: "grok", state: "playing" }]);
  assert.deepEqual(view.next, [{ platform: "gemini", ready: true }]);
  // Grok finishes on its own: the queue moves on.
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "idle" });
  assert.deepEqual(gemini.granted(), ["g1"]);
});

test("a paused reading still holds the floor until it ends", () => {
  const { connect } = loadCoordinator();
  const grok = connect("grok");
  const gemini = connect("gemini");
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "playing" });
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "paused" });
  gemini.emit({ type: "YAP_AUDIO_ENQUEUE", jobId: "g1", platform: "gemini" });
  gemini.emit({ type: "YAP_AUDIO_READY", jobId: "g1" });
  assert.deepEqual(gemini.granted(), [], "paused Grok reading must not be replaced");
  assert.deepEqual(gemini.last("YAP_QUEUE").others, [{ platform: "grok", state: "paused" }]);
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "idle" });
  assert.deepEqual(gemini.granted(), ["g1"]);
});

test("starting to play in one tab pauses (not stops) the others; pause is per tab", () => {
  const { connect } = loadCoordinator();
  const grok = connect("grok");
  const gemini = connect("gemini");
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "playing" });
  // User clicks Gemini's own icon: override. Only Grok is asked to pause.
  gemini.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "playing" });
  assert.equal(grok.of("YAP_PAUSE_NOW").length, 1);
  assert.equal(gemini.of("YAP_PAUSE_NOW").length, 0);
  // Grok obeys and reports paused; that must not pause Gemini.
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "paused" });
  assert.equal(gemini.of("YAP_PAUSE_NOW").length, 0);
  // Pressing play in Grok's own modal resumes Grok and pauses Gemini.
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "playing" });
  assert.equal(gemini.of("YAP_PAUSE_NOW").length, 1);
  assert.equal(grok.of("YAP_PAUSE_NOW").length, 1, "Grok was only paused once, by the Gemini override");
});

test("play-next starts the queue head now, pausing whatever sounds", () => {
  const { connect } = loadCoordinator();
  const grok = connect("grok");
  const gemini = connect("gemini");
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "playing" });
  gemini.emit({ type: "YAP_AUDIO_ENQUEUE", jobId: "g1", platform: "gemini" });
  gemini.emit({ type: "YAP_AUDIO_READY", jobId: "g1" });
  assert.deepEqual(gemini.granted(), []);
  grok.emit({ type: "YAP_AUDIO_PLAY_NEXT", jobId: "playnext" });
  assert.deepEqual(gemini.granted(), ["g1"]);
  assert.equal(grok.of("YAP_PAUSE_NOW").length, 1);
});

test("play-next continues a paused queued reading instead of skipping it", () => {
  const { connect } = loadCoordinator();
  const grok = connect("grok");
  const gemini = connect("gemini");
  grok.emit({ type: "YAP_AUDIO_ENQUEUE", jobId: "k1", platform: "grok" });
  grok.emit({ type: "YAP_AUDIO_READY", jobId: "k1" });
  assert.deepEqual(grok.granted(), ["k1"]);
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "playing" });
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "paused" });
  gemini.emit({ type: "YAP_AUDIO_PLAY_NEXT", jobId: "playnext" });
  assert.equal(grok.of("YAP_RESUME_NOW").length, 1);
});

test("a closed tab releases the floor", () => {
  const { connect } = loadCoordinator();
  const grok = connect("grok");
  const gemini = connect("gemini");
  grok.emit({ type: "YAP_PLAYBACK", jobId: "playback", state: "paused" });
  gemini.emit({ type: "YAP_AUDIO_ENQUEUE", jobId: "g1", platform: "gemini" });
  gemini.emit({ type: "YAP_AUDIO_READY", jobId: "g1" });
  assert.deepEqual(gemini.granted(), []);
  grok.disconnect();
  assert.deepEqual(gemini.granted(), ["g1"]);
});

test("modal is per tab: waveform follows real sound, speech cancel is guarded, queue is shown", () => {
  const player = fs.readFileSync(path.join(root, "src", "player-ui.js"), "utf8");
  const narrator = fs.readFileSync(path.join(root, "src", "chat-narrator.js"), "utf8");
  const hook = fs.readFileSync(path.join(root, "src", "media-hook.js"), "utf8");
  // waveform animates on "playing", not on "active"
  assert.match(player, /classList\.toggle\("paused", !live\)/);
  assert.match(hook, /const playing = !!el && !el\.paused && !el\.ended && el\.readyState >= 3/);
  // the shared browser speech queue is only cancelled when this tab is speaking
  assert.doesNotMatch(narrator.replace(/const cancelSpeech[^\n]*\n/, ""), /speechSynthesis\.cancel\(\)/);
  assert.match(narrator, /inFlight > 0/);
  // queue + play-next are surfaced in the modal
  assert.match(player, /Up next:/);
  assert.match(player, /data-a="playnext"/);
});

test("chat narration has mandatory identities, per-LLM voices, and full-width waveform", () => {
  const narrator = fs.readFileSync(path.join(root, "src", "chat-narrator.js"), "utf8");
  const player = fs.readFileSync(path.join(root, "src", "player-ui.js"), "utf8");
  const popup = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");
  assert.match(narrator, /Resposta do \$\{s\}/);
  assert.match(narrator, /Oi, agora é o \$\{s\} falando/);
  assert.doesNotMatch(narrator, /if \(!cfg\.chatAnnounce\) return/);
  for (const id of ["chatgptVoiceId", "claudeVoiceId", "geminiVoiceId", "grokVoiceId"]) {
    assert.match(popup, new RegExp(`id=["']${id}["']`));
  }
  assert.match(player, /class="screenwave"/);
  assert.match(player, /position:fixed; top:0; left:0; right:0/);
});

test("popup loads and explicitly saves a local ElevenLabs key", async () => {
  class FakeClassList {
    constructor() { this.values = new Set(); }
    toggle(name, force) {
      if (force === false) this.values.delete(name);
      else if (force === true) this.values.add(name);
      else if (this.values.has(name)) this.values.delete(name);
      else this.values.add(name);
    }
    contains(name) { return this.values.has(name); }
  }
  class FakeElement {
    constructor(tagName = "div") {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.classList = new FakeClassList();
      this.dataset = {};
      this.listeners = {};
      this.hidden = false;
      this.checked = false;
      this.disabled = false;
      this.value = "";
      this.textContent = "";
      this.style = {};
    }
    get options() { return this.children.filter((child) => child.tagName === "OPTION"); }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this[name] = value; }
    querySelectorAll(selector) {
      if (selector === ".dd-opt") return this.children.filter((child) => child.classList.contains("dd-opt"));
      return [];
    }
    scrollIntoView() {}
  }

  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id.includes("Voice") ? "select" : "div"));
    return elements.get(id);
  };
  const modeInputs = ["fast", "beginner", "advanced", "completo"].map((value) => {
    const input = new FakeElement("input");
    input.value = value;
    return input;
  });
  const storageEvents = [];
  const context = {
    AbortController,
    Audio: class { play() { return Promise.resolve(); } pause() {} },
    SpeechSynthesisUtterance: class {},
    URL,
    clearTimeout,
    fetch: async () => { throw new Error("unexpected network call"); },
    navigator: { language: "en-US", languages: ["en-US"] },
    setTimeout,
    setInterval: () => 0,
    speechSynthesis: {
      cancel() {}, getVoices() { return []; }, pause() {}, resume() {}, speak() {}
    },
    addEventListener() {},
    document: {
      body: new FakeElement("body"),
      addEventListener() {},
      createElement: (tag) => new FakeElement(tag),
      getElementById: element,
      querySelector: () => new FakeElement("label"),
      querySelectorAll: (selector) => selector === 'input[name="mode"]' ? modeInputs : []
    },
    chrome: {
      runtime: { getURL: (value) => value, lastError: null },
      tabs: {
        query: (query, cb) => cb(query.active ? [{ id: 1 }] : []),
        sendMessage: (_id, _message, cb) => cb && cb(null)
      },
      storage: {
        onChanged: { addListener() {} },
        sync: {
          get: (_defaults, cb) => cb({ enabled: true, engine: "elevenlabs", lang: "en-US" }),
          remove: (key) => storageEvents.push(["remove-sync", key]),
          set: (value) => storageEvents.push(["set-sync", value])
        },
        local: {
          get: (key, cb) => {
            if (key === "elevenVoicesCache") {
              cb({ elevenVoicesCache: { key: "local-secret", voices: [{ id: "v1", name: "Voice" }] } });
            } else {
              cb({ elevenKey: "local-secret", debug: false });
            }
          },
          set: (value, cb) => { storageEvents.push(["set-local", value]); if (cb) cb(); }
        }
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8"), context);

  assert.equal(element("keyTxt").textContent, "Configured");
  assert.equal(element("elevenVoiceId").options.length, 1);
  assert.equal(element("elevenVoiceId").options[0].value, "v1");
  assert.equal(storageEvents.some(([type, value]) => type === "remove-sync" && value === "elevenKey"), false);

  context.YapTts = { verify: async () => ({ valid: false, reason: "network_error" }), requestAccess: async () => true, hasAccess: async () => true };
  element("elevenKey").value = "new-local-secret";
  await element("saveElevenKey").listeners.click();
  assert.ok(storageEvents.some(([type, value]) => type === "set-local" && value.elevenKey === "new-local-secret"));
  assert.match(element("msg").textContent, /Key saved/);
});

test("onboarding saves the ElevenLabs key before verification completes", async () => {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: "", disabled: false, hidden: false, type: "password",
        textContent: "", className: "", style: {}, listeners: {},
        addEventListener(type, fn) { this.listeners[type] = fn; }
      });
    }
    return elements.get(id);
  };
  const localWrites = [];
  const context = {
    AbortController,
    clearTimeout,
    setTimeout,
    document: { getElementById: element },
    chrome: {
      runtime: { lastError: null },
      storage: {
        local: { set: (value, cb) => { localWrites.push(value); if (cb) cb(); } },
        sync: { set: (_value, cb) => { if (cb) cb(); } }
      },
      tabs: {}
    },
    YapTts: { verify: async () => ({ valid: false, reason: "network_error" }), requestAccess: async () => true, hasAccess: async () => true }
  };
  context.self = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "popup", "onboarding.js"), "utf8"), context);

  element("key").value = "onboarding-secret";
  await element("activate").listeners.click();
  assert.ok(localWrites.some((value) => value.elevenKey === "onboarding-secret"));
  assert.equal(localWrites.find((value) => value.elevenKey === "onboarding-secret").auth.providers.elevenlabs.status, "verifying");
  assert.match(element("statusTxt").textContent, /saved/);
});

test("popup platform controls and content-script coverage stay aligned", () => {
  const page = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");
  const adapters = fs.readFileSync(path.join(root, "src", "chat-adapters.js"), "utf8");
  const expected = [
    ["ChatGPT", "chatgpt.com"],
    ["Claude", "claude.ai"],
    ["Gemini", "gemini.google.com"],
    ["Grok", "grok.com"]
  ];
  const manifestMatches = manifest.content_scripts.flatMap((entry) => entry.matches);
  for (const [name, host] of expected) {
    assert.match(page, new RegExp(name, "i"));
    assert.ok(fs.existsSync(path.join(root, "assets", "platforms", `${name.toLowerCase()}.png`)));
    assert.ok(manifestMatches.some((match) => match.includes(host)), `${host} missing from content scripts`);
    assert.match(adapters, new RegExp(`id: ["']${name.toLowerCase()}["']`));
  }
});

test("current ElevenLabs speech models are visible and deprecated Turbo v2.5 is removed", () => {
  const html = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");
  for (const id of ["eleven_v4", "eleven_v4_turbo", "eleven_v3", "eleven_v3_conversational", "eleven_multilingual_v2", "eleven_flash_v2_5"]) {
    assert.match(html, new RegExp(`value=["']${id}["']`));
  }
  assert.doesNotMatch(html, /value=["']eleven_turbo_v2_5["']/);
});

test("local narration stats accumulate daily words and estimated time", () => {
  let stored = { yappableStatsV1: { v: 1, days: {} } };
  const context = {
    Date,
    chrome: { storage: { local: {
      get: (_defaults, cb) => cb(stored),
      set: (patch) => { stored = { ...stored, ...patch }; }
    } } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "src", "stats.js"), "utf8"), context);
  context.YapStats.record("one two three four five", "chatgpt");
  const day = stored.yappableStatsV1.days[context.YapStats.dayKey()];
  assert.equal(day.words, 5);
  assert.equal(day.narrations, 1);
  assert.equal(day.platforms.chatgpt.words, 5);
  assert.equal(day.seconds, 2);
});

test("platforms are the main screen; stop button is grey until audio plays", () => {
  const html = fs.readFileSync(path.join(root, "popup", "popup.html"), "utf8");
  for (const id of ["chatgptEnabled", "claudeEnabled", "geminiEnabled", "grokEnabled"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /lovable|tabPlatforms|platformsModal/i);
  assert.match(html, /\.stop-btn\.live \{[^}]*var\(--danger\)/);
  assert.doesNotMatch(html, /\.stop-btn \{[^}]*color: var\(--danger\)/);
  const js = fs.readFileSync(path.join(root, "popup", "popup.js"), "utf8");
  assert.match(js, /audible: true/);
});
