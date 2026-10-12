window.Warman = window.Warman || {};
(function () {
  const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[c]));
  }

  function uid() { return Date.now() + Math.floor(Math.random() * 1000); }

  function todayStr() {
    const d = new Date();
    return toDotDate(d);
  }

  function toDotDate(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${d.getFullYear()}`;
  }

  function parseDotDate(str) {
    if (!str || typeof str !== "string") return null;
    const parts = str.trim().split(".");
    if (parts.length !== 3) return null;
    const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function formatDetailedDate(dateStr) {
    if (!dateStr) return "Tarihsiz";
    const d = parseDotDate(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
  }

  function formatShortDate(dateStr) {
    if (!dateStr) return "Tarihsiz";
    const d = parseDotDate(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  }

  function isToday(dateStr) {
    return dateStr === todayStr();
  }

  function isOverdue(task) {
    if (!task || task.completed || task.status === "done" || task.status === "cancelled") return false;
    const d = parseDotDate(task.due_date);
    if (!d) return false;
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    return d < end;
  }

  function parseHours(val) {
    if (val == null || val === "") return 0;
    const s = String(val).trim().toLowerCase().replace(",", ".").replace("saat", "").trim();
    if (/^\d+:\d{1,2}$/.test(s)) {
      const [h, m] = s.split(":").map(Number);
      return h + (m / 60);
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function formatHours(n) {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ",");
  }

  function parseEnvelope(raw) {
    try {
      const parsed = JSON.parse(raw || "[]");
      if (Array.isArray(parsed)) return { items: parsed, meta: {} };
      if (parsed && typeof parsed === "object") {
        return {
          items: Array.isArray(parsed.items) ? parsed.items : [],
          meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {}
        };
      }
    } catch (e) { /* keep empty */ }
    return { items: [], meta: {} };
  }

  function encodeEnvelope(items, meta) {
    return JSON.stringify({ v: 2, items: items || [], meta: meta || {} });
  }

  function statusLabel(id) {
    return (Warman.config.statuses.find((s) => s.id === id) || {}).label || id || "";
  }

  function priorityLabel(id) {
    return (Warman.config.priorities.find((s) => s.id === id) || {}).label || id || "";
  }

  function projectStatusLabel(id) {
    return (Warman.config.projectStatuses.find((s) => s.id === id) || {}).label || id || "";
  }

  function parseNaturalTask(input) {
    let title = String(input || "").trim();
    const suggestion = { due_date: null, due_time: null, priority: null };
    if (!title) return { title, suggestion, matched: false };

    const applyDate = (d) => { suggestion.due_date = toDotDate(d); };
    const patterns = [
      { re: /\b(bugün|bugun)\b/gi, fn: () => applyDate(new Date()) },
      { re: /\b(yarın|yarin)\b/gi, fn: () => applyDate(addDays(new Date(), 1)) },
      { re: /\b(bu hafta)\b/gi, fn: () => {
        const d = new Date();
        const day = d.getDay() || 7;
        applyDate(addDays(d, 8 - day));
      }},
      { re: /\b(acil)\b/gi, fn: () => { suggestion.priority = "urgent"; } },
      { re: /\b(önemli|yüksek)\b/gi, fn: () => { suggestion.priority = "high"; } }
    ];
    let matched = false;
    patterns.forEach((p) => {
      if (p.re.test(title)) {
        matched = true;
        title = title.replace(p.re, " ").replace(/\s+/g, " ").trim();
        p.fn();
      }
    });
    const timeMatch = title.match(/\b([01]?\d|2[0-3])[:\.]([0-5]\d)\b/);
    if (timeMatch) {
      suggestion.due_time = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
      title = title.replace(timeMatch[0], "").replace(/\s+/g, " ").trim();
      matched = true;
    }
    return { title: title || String(input).trim(), suggestion, matched };
  }

  function sortTasks(list) {
    return [...(list || [])].sort((a, b) => {
      const ad = parseDotDate(a.due_date);
      const bd = parseDotDate(b.due_date);
      if (!ad && !bd) return (a.title || "").localeCompare(b.title || "", "tr");
      if (!ad) return 1;
      if (!bd) return -1;
      const at = a.due_time || "99:99";
      const bt = b.due_time || "99:99";
      return (ad - bd) || at.localeCompare(bt);
    });
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function initials(email) {
    const s = String(email || "W").trim();
    return s.slice(0, 1).toUpperCase();
  }

  Warman.utils = {
    MONTHS, escapeHtml, uid, todayStr, toDotDate, parseDotDate, addDays,
    formatDetailedDate, formatShortDate, isToday, isOverdue, parseHours, formatHours,
    parseEnvelope, encodeEnvelope, statusLabel, priorityLabel, projectStatusLabel,
    parseNaturalTask, sortTasks, download, csvEscape, debounce, initials
  };
})();
