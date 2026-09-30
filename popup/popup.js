const DEFAULTS = {
  enabled: true,
  chatgptEnabled: true,
  claudeEnabled: true,
  geminiEnabled: true,
  grokEnabled: true,
  chatAnnouncementStyle: "concise",
  chatgptVoiceId: "",
  claudeVoiceId: "",
  geminiVoiceId: "",
  grokVoiceId: "",
  engine: "native", // "native" | "elevenlabs"
  lang: "auto", // "auto" = detect from browser, fallback en-US (resolved by resolveLang)
  rate: 1.05,
  pitch: 1.0,
  volume: 1.0,
  nativeVoice: "",
  mode: "beginner", // fast | beginner | advanced | completo
  waveformEnabled: true, // barra animada no topo durante a fala
  elevenKey: "",
  elevenVoiceId: "cgSgspJ2msm6clMCkdW9", // Jessica (default voice, expressiva/playful)
  elevenModel: "eleven_flash_v2_5",
  elevenOutputFormat: "mp3_44100_64",
  elevenStability: 0.2,
  elevenSimilarity: 0.2,
  elevenStyle: 0.5,
  elevenSpeed: 1.1,
  elevenTextNormalization: "auto",
  elevenSeedRandom: true,
  elevenSeed: null
};

// modelos que aceitam language_code (enforce). Multilingual v2 auto-detecta.
const LANG_MODELS = /flash_v2_5|eleven_v3|eleven_v4/;
const langCode = (l) => (l || "").split("-")[0];

// idiomas: [BCP-47, country-code exibido localmente, nome].
const LANGS = [
  ["pt-BR", "br", "Português (Brasil)"],
  ["pt-PT", "pt", "Português (Portugal)"],
  ["en-US", "us", "English (US)"],
  ["en-GB", "gb", "English (UK)"],
  ["es-ES", "es", "Español (España)"],
  ["es-MX", "mx", "Español (México)"],
  ["fr-FR", "fr", "Français"],
  ["de-DE", "de", "Deutsch"],
  ["it-IT", "it", "Italiano"],
  ["nl-NL", "nl", "Nederlands"],
  ["pl-PL", "pl", "Polski"],
  ["ru-RU", "ru", "Русский"],
  ["tr-TR", "tr", "Türkçe"],
  ["ar-SA", "sa", "العربية"],
  ["hi-IN", "in", "हिन्दी"],
  ["ja-JP", "jp", "日本語"],
  ["ko-KR", "kr", "한국어"],
  ["zh-CN", "cn", "中文"]
];

// "auto" -> melhor match com o idioma do navegador; fallback en-US.
const SUPPORTED_LANGS = LANGS.map((l) => l[0]);
function resolveLang(l) {
  if (l && l !== "auto") return l;
  const navs = (navigator.languages && navigator.languages.length)
    ? navigator.languages : [navigator.language || ""];
  for (const nav of navs) {
    const n = String(nav).toLowerCase().replace(/_/g, "-");
    let hit = SUPPORTED_LANGS.find((c) => c.toLowerCase() === n);
    if (hit) return hit;
    const base = n.split("-")[0];
    hit = SUPPORTED_LANGS.find((c) => c.toLowerCase().split("-")[0] === base);
    if (hit) return hit;
  }
  return "en-US";
}

// field groups for the Reset button
const GROUPS = {
  native: ["nativeVoice", "rate", "pitch", "volume"],
  eleven: [
    "elevenModel", "elevenOutputFormat", "elevenStability", "elevenSimilarity",
    "elevenStyle", "elevenSpeed",
    "elevenTextNormalization", "elevenSeedRandom", "elevenSeed"
  ]
};

const SAMPLE = "Yappable is active. This is the selected voice.";
const VOICE_CACHE_KEY = "elevenVoicesCache"; // chrome.storage.local: { key, at, voices:[{id,name,lang}] }
const REQUEST_TIMEOUT_MS = 15000;
const PLATFORM_URLS = {
  chatgptEnabled: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
  claudeEnabled: ["https://claude.ai/*"],
  geminiEnabled: ["https://gemini.google.com/*"],
  grokEnabled: ["https://grok.com/*"]
};
const PLATFORM_VOICE_KEYS = ["chatgptVoiceId", "claudeVoiceId", "geminiVoiceId", "grokVoiceId"];
const MODES = ["fast", "beginner", "advanced", "completo"];
const LEGACY_TO_MODE = {
  raw: "completo", full: "completo", technical: "completo",
  resumo: "beginner", summary: "beginner", title: "beginner",
  concise: "beginner", briefing: "beginner", body: "beginner"
};
const normalizeMode = (m) =>
  (MODES.includes(m) ? m : (LEGACY_TO_MODE[m] || DEFAULTS.mode));

// No structured logger in this extension; keep the call shape as a no-op.
const L = { ok() {}, info() {}, fallback() {}, fail() {}, start: () => () => {} };

const $ = (id) => document.getElementById(id);
const msg = (t) => { $("msg").textContent = t || ""; };
const fmt = (v, digits) => digits === 0 ? String(Math.round(v)) : Number(v).toFixed(digits);
// Mostra valor interno (0–1) como percentual. Não altera o valor salvo.
const fmtPct = (v) => Math.round(Number(v) * 100) + "%";
// Speed: percentual relativo a 100% (1.0). Ex.: 0.9 -> "-10%", 1.2 -> "+20%". Não altera o valor salvo.
const fmtSpeedPct = (v) => { const d = Math.round((Number(v) - 1) * 100); return (d > 0 ? "+" : "") + d + "%"; };

let cfg = { ...DEFAULTS };

function set(key, value) {
  cfg[key] = value;
  // elevenKey is stored in local (credentials stay off sync).
  if (key === "elevenKey") {
    chrome.storage.local.set({ [key]: value });
    // Phase 5: mirror elevenKey into the auth credential object
    if (key === "elevenKey") {
      chrome.storage.local.get({ auth: null }, (st) => {
        if (chrome.runtime.lastError) return;
        const authBase = st.auth || {
          v: 1, activeEngine: cfg.engine || "native",
          providers: { elevenlabs: { credential: null, status: "unconfigured", account: null, voices: [], voicesAt: null } }
        };
        const auth = JSON.parse(JSON.stringify(authBase));
        if (!auth.providers) auth.providers = {};
        if (!auth.providers.elevenlabs) auth.providers.elevenlabs = { credential: null, status: "unconfigured" };
        const prev = auth.providers.elevenlabs.credential;
        auth.providers.elevenlabs.credential = value ? {
          type: "apiKey", value,
          addedAt: (prev && prev.addedAt) || Date.now(),
          lastVerifiedAt: null
        } : null;
        auth.providers.elevenlabs.status = value ? "unverified" : "unconfigured";
        cfg._authStatus = auth.providers.elevenlabs.status;
        chrome.storage.local.set({ auth });
        reflectKeyStatus();
      });
    }
  } else {
    chrome.storage.sync.set({ [key]: value });
  }
}

// ---------------------------------------------------------------------------
// Stop-anterior
// ---------------------------------------------------------------------------
let currentAudio = null;
let currentAudioUrl = "";
function stopAll() {
  try { speechSynthesis.cancel(); } catch (_) {}
  if (currentAudio) {
    try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (_) {}
    currentAudio = null;
  }
  if (currentAudioUrl) {
    try { URL.revokeObjectURL(currentAudioUrl); } catch (_) {}
    currentAudioUrl = "";
  }
}

// ---------------------------------------------------------------------------
// Bind helpers (salvam na hora)
// ---------------------------------------------------------------------------
const bindToggle = (id) => $(id).addEventListener("change", () => set(id, $(id).checked));
const bindSelect = (id) => $(id).addEventListener("change", () => set(id, $(id).value));
const bindNumber = (id) => $(id).addEventListener("change", () => {
  const raw = $(id).value;
  set(id, raw === "" ? null : Number(raw));
});
function bindRange(id, outId, fmtArg = 2) {
  const el = $(id);
  const fmtFn = typeof fmtArg === "function" ? fmtArg : (v) => fmt(v, fmtArg);
  el.addEventListener("input", () => { $(outId).textContent = fmtFn(el.value); });
  el.addEventListener("change", () => set(id, Number(el.value)));
}

// master on/off
function reflectEnabledState() {
  const on = $("enabled").checked;
  const el = $("enabledState");
  el.textContent = on ? "Enabled" : "Disabled";
  el.classList.toggle("on", on);
  el.classList.toggle("off", !on);
  $("masterCard").classList.toggle("on", on);
  document.body.classList.toggle("narr-off", !on);
}

function stopTabs(urls = Object.values(PLATFORM_URLS).flat()) {
  if (!chrome.tabs?.query) return;
  chrome.tabs.query({ url: urls }, (tabs) => {
    for (const tab of tabs || []) {
      if (!tab?.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: "LN_STOP_NOW" }, () => void chrome.runtime.lastError);
    }
  });
}

$("enabled").addEventListener("change", () => {
  reflectEnabledState();
  if (!$("enabled").checked) stopTabs();
});
$("stopBtn").addEventListener("click", () => {
  stopAll();
  stopTabs();
  setTimeout(refreshStopState, 300);
  msg("Audio stopped.");
});

// engine
function reflectEngine() {
  const eleven = cfg.engine === "elevenlabs";
  $("segNative").classList.toggle("on", !eleven);
  $("segEleven").classList.toggle("on", eleven);
  $("panelNative").hidden = eleven;
  $("panelEleven").hidden = !eleven;
  const badge = $("engineBadge");
  if (badge) badge.textContent = eleven ? "☁️ ElevenLabs" : "🔊 Native";
  reflectSummaries();
}

function reflectSummaries() {
  const vs = $("voiceState");
  if (vs) {
    const eng = cfg.engine === "elevenlabs" ? "☁️ ElevenLabs" : "🔊 Native";
    const cc = (LANGS.find((l) => l[0] === resolveLang(cfg.lang)) || LANGS[0])[1].toUpperCase();
    vs.textContent = `${eng} · ${cc}`;
  }
}
function setEngine(engine) {
  if (cfg.engine === engine) return;
  set("engine", engine);
  reflectEngine();
}
$("segNative").addEventListener("click", () => setEngine("native"));
$("segEleven").addEventListener("click", () => setEngine("elevenlabs"));

$("engineBadge").addEventListener("click", () => {
  const d = $("cfgVoice");
  if (d) {
    d.open = true;
    d.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

document.querySelectorAll('input[name="mode"]').forEach((r) => {
  r.addEventListener("change", () => { if (r.checked) set("mode", r.value); });
});

function reflectSeed() { $("elevenSeed").disabled = cfg.elevenSeedRandom; }

// ---------------------------------------------------------------------------
// Dropdown de idioma
// ---------------------------------------------------------------------------
function makeFlagPill(cc) {
  const span = document.createElement("span");
  span.className = "flag-pill";
  span.textContent = cc.toUpperCase();
  span.setAttribute("aria-hidden", "true");
  return span;
}

function buildLangDropdown() {
  const list = $("langList");
  list.replaceChildren();
  for (const [code, cc, name] of LANGS) {
    const o = document.createElement("div");
    o.className = "dd-opt";
    o.dataset.code = code;
    const label = document.createElement("span");
    label.textContent = name;
    o.append(makeFlagPill(cc), label);
    o.addEventListener("click", () => { set("lang", code); reflectLang(); $("langList").hidden = true; });
    list.appendChild(o);
  }
}
function reflectLang() {
  const resolved = resolveLang(cfg.lang);
  const [, cc] = LANGS.find((l) => l[0] === resolved) || LANGS[0];
  $("langBtn").replaceChildren(makeFlagPill(cc));
  $("langBtn").title = (LANGS.find((l) => l[0] === resolved) || LANGS[0])[2];
  $("langList").querySelectorAll(".dd-opt").forEach((o) => o.classList.toggle("sel", o.dataset.code === resolved));
  populateNativeVoices();
  reflectSummaries();
}
$("langBtn").addEventListener("click", (e) => { e.stopPropagation(); $("langList").hidden = !$("langList").hidden; });
document.addEventListener("click", () => { $("langList").hidden = true; });

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------
// Phase 5: auth status labels
const AUTH_STATUS_LABELS = {
  unconfigured: "No API key",
  unverified: "Configured",
  verifying: "Verifying…",
  valid: "Verified ✓",
  invalid: "Invalid key",
  quota_exceeded: "Quota exceeded",
  network_error: "Network error"
};

function reflectKeyStatus() {
  const has = !!cfg.elevenKey;
  const status = cfg._authStatus || (has ? "unverified" : "unconfigured");
  const isOk = status === "valid";
  const isBad = ["invalid", "quota_exceeded", "network_error"].includes(status);
  const dot = $("keyDot");
  dot.classList.toggle("ok", isOk);
  dot.classList.toggle("bad", isBad);
  $("keyTxt").textContent = AUTH_STATUS_LABELS[status] || (has ? "Configured" : "No API key");
  $("keyAffiliate").hidden = has;
}
$("openSettings").addEventListener("click", () => {
  $("elevenKey").value = cfg.elevenKey;
  $("elevenKey").type = "password";
  $("settingsModal").hidden = false;
});
function loadTodayStats() {
  const key = globalThis.YapStats ? globalThis.YapStats.dayKey() : new Date().toISOString().slice(0, 10);
  chrome.storage.local.get({ yappableStatsV1: { v: 1, days: {} } }, (st) => {
    const day = st.yappableStatsV1?.days?.[key] || { words: 0, seconds: 0, narrations: 0 };
    $("statsWords").textContent = Math.round(day.words || 0).toLocaleString();
    $("statsMinutes").textContent = Math.round((day.seconds || 0) / 60).toLocaleString();
    $("statsNarrations").textContent = Math.round(day.narrations || 0).toLocaleString();
  });
}
// Stop button: grey when idle, red only while a Yappable tab is making sound.
function refreshStopState() {
  if (!chrome.tabs?.query) return;
  chrome.tabs.query({ url: Object.values(PLATFORM_URLS).flat(), audible: true }, (tabs) => {
    void chrome.runtime.lastError;
    const live = Array.isArray(tabs) && tabs.length > 0;
    $("stopBtn").classList.toggle("live", live);
    $("stopBtn").title = live ? "Stop audio on every Yappable platform" : "Nothing playing";
  });
}
loadTodayStats();
refreshStopState();
setInterval(refreshStopState, 700);
if (chrome.tabs?.onUpdated) chrome.tabs.onUpdated.addListener((_id, change) => { if ("audible" in change) refreshStopState(); });
$("settingsClose").addEventListener("click", () => { $("settingsModal").hidden = true; });
$("settingsModal").addEventListener("click", (e) => { if (e.target === $("settingsModal")) $("settingsModal").hidden = true; });
$("keyReveal").addEventListener("click", () => {
  const el = $("elevenKey");
  el.type = el.type === "password" ? "text" : "password";
});
async function saveAndVerifyElevenKey() {
  const k = $("elevenKey").value.trim();
  const changed = k !== cfg.elevenKey;
  set("elevenKey", k);
  reflectKeyStatus();
  L.info("config", "elevenKey", "chave ElevenLabs atualizada", { hasKey: !!k, changed });
  if (!k) {
    msg("ElevenLabs key removed.");
    return;
  }

  const button = $("saveElevenKey");
  button.disabled = true;
  cfg._authStatus = "verifying";
  reflectKeyStatus();
  msg("Key saved locally. Verifying…");
  try {
    const result = await globalThis.YapTts.verify(k);
    if (!result.valid) {
      const status = result.reason === "invalid_key" || result.reason === "forbidden" ? "invalid" : "network_error";
      cfg._authStatus = status;
      chrome.storage.local.get({ auth: null }, (st) => {
        const auth = st.auth || { v: 1, activeEngine: cfg.engine || "native", providers: {} };
        if (!auth.providers) auth.providers = {};
        if (!auth.providers.elevenlabs) auth.providers.elevenlabs = {};
        auth.providers.elevenlabs.status = status;
        chrome.storage.local.set({ auth });
      });
      reflectKeyStatus();
      msg(result.reason === "invalid_key"
        ? "Key saved, but ElevenLabs rejected it."
        : result.reason === "forbidden"
          ? "Key saved, but it cannot list voices. Enable Voices read access."
          : "Key saved. Verification could not reach ElevenLabs.");
      return;
    }

    const voices = result.voices || [];
    const now = Date.now();
    chrome.storage.local.get({ auth: null }, (st) => {
      const auth = st.auth || { v: 1, activeEngine: cfg.engine || "native", providers: {} };
      if (!auth.providers) auth.providers = {};
      auth.providers.elevenlabs = {
        credential: { type: "apiKey", value: k, addedAt: now, lastVerifiedAt: now },
        status: "valid",
        account: auth.providers.elevenlabs?.account || null,
        voices,
        voicesAt: now
      };
      chrome.storage.local.set({
        auth,
        [VOICE_CACHE_KEY]: { key: k, at: now, voices }
      });
    });
    cfg._authStatus = "valid";
    reflectKeyStatus();
    populateElevenVoices(voices);
    msg(`Key saved and verified — ${voices.length} voices available.`);
  } catch (e) {
    cfg._authStatus = "network_error";
    reflectKeyStatus();
    msg("Key saved. Verification failed: " + (e && e.message || String(e)));
  } finally {
    button.disabled = false;
  }
}
$("saveElevenKey").addEventListener("click", saveAndVerifyElevenKey);
$("elevenKey").addEventListener("keydown", (event) => {
  if (event.key === "Enter") saveAndVerifyElevenKey();
});

// ---------------------------------------------------------------------------
// Vozes nativas
// ---------------------------------------------------------------------------
const normLang = (l) => String(l || "").toLowerCase().replace(/_/g, "-");
function rankVoice(v) {
  if (/google/i.test(v.name)) return 0;
  if (/microsoft|natural/i.test(v.name)) return 1;
  return 2;
}
function populateNativeVoices() {
  const sel = $("nativeVoice");
  if (!sel) return;
  const cur = cfg.nativeVoice;
  const all = speechSynthesis.getVoices();
  const want = normLang(resolveLang(cfg.lang));
  const base = want.split("-")[0];

  const exactRegion = all.filter((v) => normLang(v.lang) === want);
  const sameBase = all.filter((v) => normLang(v.lang).split("-")[0] === base);
  let list = exactRegion.length ? exactRegion : sameBase;
  let noMatch = false;
  if (!list.length) { list = all; noMatch = true; }
  list = [...list].sort((a, b) => rankVoice(a) - rankVoice(b));

  sel.replaceChildren();
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = "Auto (best match)";
  sel.appendChild(auto);
  for (const v of list) {
    const o = document.createElement("option");
    o.value = v.name;
    o.textContent = noMatch ? `${v.name} (${v.lang})` : v.name;
    sel.appendChild(o);
  }
  sel.value = list.some((v) => v.name === cur) ? cur : "";
}
speechSynthesis.onvoiceschanged = populateNativeVoices;

// ---------------------------------------------------------------------------
// Vozes ElevenLabs
// ---------------------------------------------------------------------------
function populateElevenVoices(voices) {
  const sel = $("elevenVoiceId");
  sel.replaceChildren();
  for (const v of voices) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.lang ? `${v.name} — ${v.lang}` : v.name;
    sel.appendChild(o);
  }
  if (cfg.elevenVoiceId) sel.value = cfg.elevenVoiceId;
  if (!sel.value && sel.options.length) { sel.value = sel.options[0].value; set("elevenVoiceId", sel.value); }

  for (const key of PLATFORM_VOICE_KEYS) {
    const platform = $(key);
    platform.replaceChildren();
    platform.disabled = false;
    platform.title = "ElevenLabs voice for this AI";
    const fallback = document.createElement("option");
    fallback.value = "";
    fallback.textContent = "Use default ElevenLabs voice";
    platform.appendChild(fallback);
    for (const voice of voices) {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.lang ? `${voice.name} — ${voice.lang}` : voice.name;
      platform.appendChild(option);
    }
    const valid = voices.some((voice) => voice.id === cfg[key]);
    platform.value = valid ? cfg[key] : "";
    if (cfg[key] && !valid) set(key, "");
  }
}

async function fetchElevenVoices() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", {
      headers: { "xi-api-key": cfg.elevenKey },
      signal: controller.signal
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return (data.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      lang: v.labels?.language || v.labels?.accent || ""
    }));
  } catch (err) {
    if (controller.signal.aborted) throw new Error("request timed out");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Without an ElevenLabs key the per-AI voice pickers have nothing to offer: say so
// instead of showing empty dropdowns.
function showPlatformVoicesOff() {
  for (const key of PLATFORM_VOICE_KEYS) {
    const platform = $(key);
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Native voice";
    platform.replaceChildren(option);
    platform.disabled = true;
    platform.title = "Add an ElevenLabs key in ⚙ to pick a voice for this AI.";
  }
}

function loadElevenVoices(force) {
  if (!cfg.elevenKey) {
    const sel = $("elevenVoiceId");
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "— configure the API key (⚙) —";
    sel.replaceChildren(option);
    showPlatformVoicesOff();
    return;
  }
  chrome.storage.local.get(VOICE_CACHE_KEY, async (st) => {
    const cache = st[VOICE_CACHE_KEY];
    if (!force && cache && cache.key === cfg.elevenKey && cache.voices?.length) {
      populateElevenVoices(cache.voices);
      return;
    }
    msg("Loading voices…");
    const endDbg = L.start("engine", "loadElevenVoices", "GET /v2/voices (ElevenLabs)", { force });
    try {
      const voices = await fetchElevenVoices();
      chrome.storage.local.set({ [VOICE_CACHE_KEY]: { key: cfg.elevenKey, at: Date.now(), voices } });
      populateElevenVoices(voices);
      endDbg("ok", { count: voices.length });
      msg(`${voices.length} voices cached.`);
    } catch (e) {
      endDbg("fail", { err: e });
      msg("Failed to load voices: " + e.message);
    }
  });
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
function resetGroup(group) {
  const keys = GROUPS[group] || [];
  const patch = {};
  for (const k of keys) { cfg[k] = DEFAULTS[k]; patch[k] = DEFAULTS[k]; }
  chrome.storage.sync.set(patch);
  reflectUI();
  msg("Settings for '" + group + "' reset.");
}

// ---------------------------------------------------------------------------
// Testes de voz
// ---------------------------------------------------------------------------
function testNative() {
  stopAll();
  if (!("speechSynthesis" in window)) { msg("speechSynthesis not supported."); return; }
  const u = new SpeechSynthesisUtterance(SAMPLE);
  u.lang = resolveLang(cfg.lang);
  u.rate = cfg.rate;
  u.pitch = cfg.pitch;
  u.volume = cfg.volume;
  const v = speechSynthesis.getVoices().find((x) => x.name === cfg.nativeVoice);
  if (v) u.voice = v;
  speechSynthesis.speak(u);
  msg("Playing native voice…");
  u.onend = () => msg("");
}

// ---------------------------------------------------------------------------
// Refletir cfg -> UI
// ---------------------------------------------------------------------------
function reflectUI() {
  $("enabled").checked = cfg.enabled;
  reflectEnabledState();
  reflectLang();
  reflectEngine();
  document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === normalizeMode(cfg.mode); });
  $("waveformEnabled").checked = cfg.waveformEnabled;
  for (const key of Object.keys(PLATFORM_URLS)) $(key).checked = cfg[key] !== false;
  $("chatAnnouncementStyle").value = cfg.chatAnnouncementStyle;

  // nativa
  $("nativeVoice").value = cfg.nativeVoice;
  $("rate").value = cfg.rate; $("rateOut").textContent = fmt(cfg.rate, 2);
  $("pitch").value = cfg.pitch; $("pitchOut").textContent = fmt(cfg.pitch, 2);
  $("volume").value = cfg.volume; $("volumeOut").textContent = fmt(cfg.volume, 2);

  // eleven
  $("elevenModel").value = cfg.elevenModel;
  $("elevenOutputFormat").value = cfg.elevenOutputFormat;
  $("elevenStability").value = cfg.elevenStability; $("stabOut").textContent = fmtPct(cfg.elevenStability);
  $("elevenSimilarity").value = cfg.elevenSimilarity; $("simOut").textContent = fmtPct(cfg.elevenSimilarity);
  $("elevenStyle").value = cfg.elevenStyle; $("styleOut").textContent = fmtPct(cfg.elevenStyle);
  $("elevenSpeed").value = cfg.elevenSpeed; $("elevenSpeedOut").textContent = fmtSpeedPct(cfg.elevenSpeed);
  $("elevenTextNormalization").value = cfg.elevenTextNormalization;
  $("elevenSeedRandom").checked = cfg.elevenSeedRandom;
  $("elevenSeed").value = cfg.elevenSeed == null ? "" : cfg.elevenSeed;
  reflectSeed();
  reflectKeyStatus();
}

// ---------------------------------------------------------------------------
// Carregar config
// ---------------------------------------------------------------------------
function load() {
  chrome.storage.sync.get({ ...DEFAULTS, mode: "", announce: "", lens: "" }, (stored) => {
    const legacyElevenKey = stored.elevenKey || "";
    cfg = { ...DEFAULTS, ...stored };
    delete cfg.announce;
    delete cfg.lens;
    cfg.mode = normalizeMode(stored.mode || stored.announce);
    cfg.elevenKey = "";
    if (!cfg.lang || cfg.lang === "auto") {
      cfg.lang = resolveLang("auto");
      chrome.storage.sync.set({ lang: cfg.lang });
    }
    if (stored.mode !== cfg.mode) chrome.storage.sync.set({ mode: cfg.mode });
    if (stored.announce || stored.lens) chrome.storage.sync.remove(["announce", "lens"]);

    // Resolve local data after sync. This prevents a slower sync callback from
    // overwriting the credential that a faster local callback just loaded.
    chrome.storage.local.get(["elevenKey", "auth"], (local) => {
      // Phase 5: prefer auth credential; fall back to legacy elevenKey
      const auth = local.auth;
      const authKey = auth && auth.providers && auth.providers.elevenlabs
        && auth.providers.elevenlabs.credential && auth.providers.elevenlabs.credential.value;
      cfg.elevenKey = authKey || local.elevenKey || legacyElevenKey;
      cfg._authStatus = auth && auth.providers && auth.providers.elevenlabs
        && auth.providers.elevenlabs.status || null;

      buildLangDropdown();
      populateNativeVoices();
      reflectUI();
      if (!cfg.enabled) stopTabs();
      const sel = $("elevenVoiceId");
      if (!sel.options.length || sel.options[0].value === "") {
        const option = document.createElement("option");
        option.value = cfg.elevenVoiceId;
        option.textContent = `${cfg.elevenVoiceId} (current)`;
        sel.replaceChildren(option);
      }
      if (cfg.elevenKey) loadElevenVoices(false);

      // Copy first, delete second: a failed local write must not destroy the
      // legacy sync credential during extension upgrades.
      if (legacyElevenKey && !local.elevenKey) {
        chrome.storage.local.set({ elevenKey: legacyElevenKey }, () => {
          if (!chrome.runtime.lastError) chrome.storage.sync.remove("elevenKey");
        });
      } else if (legacyElevenKey) {
        chrome.storage.sync.remove("elevenKey");
      }
    });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.elevenKey) {
      cfg.elevenKey = changes.elevenKey.newValue || "";
      reflectKeyStatus();
    }
    // Phase 5: sync auth status and credential from storage changes
    if (changes.auth) {
      const auth = changes.auth.newValue;
      const authKey = auth && auth.providers && auth.providers.elevenlabs
        && auth.providers.elevenlabs.credential && auth.providers.elevenlabs.credential.value;
      if (authKey !== undefined) cfg.elevenKey = authKey || cfg.elevenKey;
      cfg._authStatus = auth && auth.providers && auth.providers.elevenlabs
        && auth.providers.elevenlabs.status || null;
      reflectKeyStatus();
    }
  }
});

// ---------------------------------------------------------------------------
// Binds
// ---------------------------------------------------------------------------
bindToggle("enabled");
bindToggle("waveformEnabled");
for (const key of Object.keys(PLATFORM_URLS)) {
  bindToggle(key);
  $(key).addEventListener("change", () => {
    if (!$(key).checked) stopTabs(PLATFORM_URLS[key]);
  });
}
bindToggle("elevenSeedRandom");
bindSelect("nativeVoice");
bindSelect("elevenVoiceId");
bindSelect("chatAnnouncementStyle");
for (const key of PLATFORM_VOICE_KEYS) bindSelect(key);
bindSelect("elevenModel");
bindSelect("elevenOutputFormat");
bindSelect("elevenTextNormalization");
bindNumber("elevenSeed");
bindRange("rate", "rateOut", 2);
bindRange("pitch", "pitchOut", 2);
bindRange("volume", "volumeOut", 2);
bindRange("elevenStability", "stabOut", fmtPct);
bindRange("elevenSimilarity", "simOut", fmtPct);
bindRange("elevenStyle", "styleOut", fmtPct);
bindRange("elevenSpeed", "elevenSpeedOut", fmtSpeedPct);

$("elevenSeedRandom").addEventListener("change", reflectSeed);
$("refreshVoices").addEventListener("click", () => loadElevenVoices(true));
$("resetNative").addEventListener("click", () => resetGroup("native"));
$("resetEleven").addEventListener("click", () => resetGroup("eleven"));
$("testNative").addEventListener("click", testNative);

window.addEventListener("unload", stopAll);

load();
