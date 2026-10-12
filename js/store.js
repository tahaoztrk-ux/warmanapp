window.Warman = window.Warman || {};
(function () {
  const state = {
    user: null,
    projects: [],
    tasks: [],
    work: [],
    settings: {},
    activity: [],
    selectedTaskId: null,
    selectedProjectId: null,
    search: "",
    filters: { status: "", priority: "", project: "", date: "", tag: "" },
    loading: true
  };
  const listeners = {};

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
    return () => { listeners[event] = (listeners[event] || []).filter((x) => x !== fn); };
  }
  function emit(event, payload) {
    (listeners[event] || []).forEach((fn) => fn(payload, state));
    (listeners["*"] || []).forEach((fn) => fn(event, payload, state));
  }
  function get() { return state; }

  function set(patch) {
    Object.assign(state, patch);
    emit("change", patch);
  }

  function defaultSettings() {
    return {
      theme: localStorage.getItem("theme") || "light",
      defaultView: "overview",
      defaultPriority: "normal",
      defaultDue: "none",
      weekStartsOn: 1,
      defaultLocation: "Merkez",
      density: "comfortable",
      notifications: false,
      hourlyRate: "",
      overtimeRate: "",
      widgets: {
        stats: true, focus: true, continuing: true, activity: true, progress: true
      }
    };
  }

  function loadSettings() {
    const uid = state.user?.id || "local";
    try {
      const raw = localStorage.getItem(`warman.settings.${uid}`);
      state.settings = { ...defaultSettings(), ...(raw ? JSON.parse(raw) : {}) };
    } catch (e) {
      state.settings = defaultSettings();
    }
    applyTheme();
  }

  function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    const uid = state.user?.id || "local";
    localStorage.setItem(`warman.settings.${uid}`, JSON.stringify(state.settings));
    if (patch.theme) applyTheme();
    if (patch.density) document.documentElement.setAttribute("data-density", state.settings.density);
    emit("settings", state.settings);
  }

  function applyTheme() {
    const pref = state.settings.theme || "light";
    let theme = pref;
    if (pref === "system") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme === "dark" ? "dark" : "light");
    document.documentElement.setAttribute("data-density", state.settings.density || "comfortable");
  }

  function log(text, type) {
    state.activity.unshift({ id: Date.now(), text, type: type || "info", at: new Date().toISOString() });
    state.activity = state.activity.slice(0, 40);
    try { localStorage.setItem("warman.activity", JSON.stringify(state.activity)); } catch (e) {}
    emit("activity", state.activity);
  }

  function loadActivity() {
    try { state.activity = JSON.parse(localStorage.getItem("warman.activity") || "[]"); } catch (e) { state.activity = []; }
  }

  function taskById(id) { return state.tasks.find((t) => Number(t.id) === Number(id)); }
  function projectById(id) { return state.projects.find((p) => Number(p.id) === Number(id)); }

  Warman.store = {
    get, set, on, emit, loadSettings, saveSettings, applyTheme, log, loadActivity, taskById, projectById, defaultSettings
  };
})();
