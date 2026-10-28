window.Warman = window.Warman || {};
(function () {
  const U = () => Warman.utils;
  let lastProjectId = null;
  let selected = new Set();

  function defaultsForNew() {
    const s = Warman.store.get().settings;
    const due = s.defaultDue === "today" ? U().todayStr() : "";
    return {
      id: U().uid(),
      title: "",
      description: "",
      status: due ? "planned" : "inbox",
      priority: s.defaultPriority || "normal",
      project_id: lastProjectId,
      tags: [],
      due_date: due,
      due_time: "",
      subtasks: [],
      notes: "",
      completed: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      history: [{ at: new Date().toISOString(), text: "Oluşturuldu" }]
    };
  }

  function visible(mode) {
    const st = Warman.store.get();
    const q = (st.search || "").toLowerCase();
    return st.tasks.filter((t) => {
      if (t.archived && mode !== "archive") return false;
      if (mode === "inbox") return !t.due_date && t.status !== "done" && t.status !== "cancelled";
      if (mode === "today") return t.due_date === U().todayStr() && t.status !== "cancelled";
      if (st.filters.status && t.status !== st.filters.status) return false;
      if (st.filters.priority && t.priority !== st.filters.priority) return false;
      if (st.filters.project && String(t.project_id) !== String(st.filters.project)) return false;
      if (st.filters.date === "none" && t.due_date) return false;
      if (st.filters.date === "today" && t.due_date !== U().todayStr()) return false;
      if (st.filters.date === "overdue" && !U().isOverdue(t)) return false;
      if (st.filters.tag && !(t.tags || []).includes(st.filters.tag)) return false;
      if (q) {
        const hay = `${t.title} ${t.description} ${(t.tags || []).join(" ")} ${(Warman.store.projectById(t.project_id)?.title || "")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  async function persist(task, silent) {
    task.updated_at = new Date().toISOString();
    const saved = await Warman.api.saveTask(task);
    const list = [...Warman.store.get().tasks];
    const idx = list.findIndex((t) => Number(t.id) === Number(task.id));
    const confirmed = { ...task, ...saved };
    if (idx >= 0) list[idx] = confirmed;
    else list.unshift(confirmed);
    Warman.store.set({ tasks: list });
    if (!silent) Warman.store.log(`Görev güncellendi: ${task.title}`, "task");
    Warman.projects.syncFromTask(confirmed);
    return confirmed;
  }

  async function createFromTitle(rawTitle, extras) {
    const parsed = U().parseNaturalTask(rawTitle);
    const task = { ...defaultsForNew(), title: parsed.title, ...(extras || {}) };
    if (parsed.matched) {
      if (parsed.suggestion.due_date && !task.due_date) {
        task.due_date = parsed.suggestion.due_date;
        if (task.status === "inbox") task.status = "planned";
      }
      if (parsed.suggestion.due_time) task.due_time = parsed.suggestion.due_time;
      if (parsed.suggestion.priority) task.priority = parsed.suggestion.priority;
    }
    if (!task.title) return null;
    try {
      const saved = await persist(task, true);
      Warman.store.log(`Görev eklendi: ${task.title}`, "task");
      return saved;
    } catch (err) {
      Warman.ui.toast("Görev kaydedilemedi: " + err.message, "error");
      return null;
    }
  }

  async function remove(id) {
    const task = Warman.store.taskById(id);
    if (!task) return;
    const list = Warman.store.get().tasks.filter((t) => Number(t.id) !== Number(id));
    Warman.store.set({ tasks: list });
    Warman.ui.closeDetail();
    try {
      await Warman.api.deleteTask(id);
      Warman.ui.offerUndo("Görev silindi.", async () => {
        await persist(task, true);
        Warman.router.refresh();
      });
      Warman.router.refresh();
    } catch (err) {
      Warman.store.set({ tasks: Warman.store.get().tasks.concat([task]) });
      Warman.ui.toast("Silinemedi: " + err.message, "error");
      Warman.router.refresh();
    }
  }

  async function toggleDone(id) {
    const task = Warman.store.taskById(id);
    if (!task) return;
    const blocked = isBlocked(task);
    if (blocked && !task.completed) {
      Warman.ui.toast("Bu görev önceki adıma bağlı. Önce bağımlılığı tamamlayın.");
      return;
    }
    task.completed = !task.completed;
    task.status = task.completed ? "done" : (task.due_date ? "planned" : "inbox");
    task.completed_at = task.completed ? new Date().toISOString() : null;
    task.history = [...(task.history || []), { at: new Date().toISOString(), text: task.completed ? "Tamamlandı" : "Yeniden açıldı" }];
    try {
      await persist(task);
      if (task.completed && task.recurrence) await spawnRecurrence(task);
      Warman.router.refresh();
      if (document.getElementById("appShell").classList.contains("detail-open") && Warman.store.get().selectedTaskId == id) {
        openDetail(id);
      }
    } catch (err) {
      Warman.ui.toast("Durum kaydedilemedi: " + err.message, "error");
    }
  }

  function isBlocked(task) {
    const deps = task.depends_on || [];
    if (!deps.length) return false;
    return deps.some((id) => {
      const t = Warman.store.taskById(id);
      return t && !t.completed && t.status !== "done";
    });
  }

  async function setStatus(id, status) {
    const task = Warman.store.taskById(id);
    if (!task) return;
    task.status = status;
    task.completed = status === "done";
    if (status === "done") task.completed_at = new Date().toISOString();
    if (status === "planned" && !task.due_date) task.due_date = U().todayStr();
    try {
      await persist(task);
      Warman.router.refresh();
    } catch (err) {
      Warman.ui.toast("Durum güncellenemedi: " + err.message, "error");
    }
  }

  async function spawnRecurrence(task) {
    const stamp = task.completed_at || new Date().toISOString();
    if (task.last_spawned_from === stamp) return;
    const base = U().parseDotDate(task.due_date) || new Date();
    if (task.recurrence === "daily") base.setDate(base.getDate() + 1);
    else if (task.recurrence === "weekly") base.setDate(base.getDate() + 7);
    else if (task.recurrence === "monthly") base.setMonth(base.getMonth() + 1);
    else return;
    const nextDate = U().toDotDate(base);
    const exists = Warman.store.get().tasks.some((t) => t.title === task.title && t.due_date === nextDate && t.recurrence === task.recurrence && !t.completed);
    if (exists) return;
    task.last_spawned_from = stamp;
    await persist(task, true);
    await createFromTitle(task.title, {
      description: task.description,
      priority: task.priority,
      project_id: task.project_id,
      tags: [...(task.tags || [])],
      due_date: nextDate,
      due_time: task.due_time,
      recurrence: task.recurrence,
      status: "planned"
    });
  }

  async function duplicate(id) {
    const t = Warman.store.taskById(id);
    if (!t) return;
    await createFromTitle(t.title + " (kopya)", {
      description: t.description,
      priority: t.priority,
      project_id: t.project_id,
      tags: [...(t.tags || [])],
      due_date: t.due_date,
      due_time: t.due_time
    });
    Warman.ui.toast("Görev çoğaltıldı.", "success");
    Warman.router.refresh();
  }

  function quickCreate() {
    const input = document.getElementById("quickTaskInput");
    if (input) { input.focus(); return; }
    Warman.router.go("inbox");
    setTimeout(() => document.getElementById("quickTaskInput")?.focus(), 50);
  }

  function bindQuick(root, extras) {
    const input = root.querySelector("#quickTaskInput");
    if (!input) return;
    const hint = root.querySelector("#nlHint");
    input.addEventListener("input", () => {
      const p = U().parseNaturalTask(input.value);
      if (!hint) return;
      if (p.matched) {
        const bits = [];
        if (p.suggestion.due_date) bits.push("Tarih: " + p.suggestion.due_date);
        if (p.suggestion.due_time) bits.push("Saat: " + p.suggestion.due_time);
        if (p.suggestion.priority) bits.push("Öncelik: " + U().priorityLabel(p.suggestion.priority));
        hint.textContent = "Öneri — " + bits.join(" · ") + " (Enter ile onaylanır)";
      } else hint.textContent = "";
    });
    async function submit(more) {
      const title = input.value.trim();
      if (!title) return;
      const extra = { ...(extras || {}) };
      if (more && more.due_date !== undefined) extra.due_date = more.due_date;
      const task = await createFromTitle(title, extra);
      if (task) {
        input.value = "";
        if (hint) hint.textContent = "";
        input.focus();
        Warman.router.refresh();
      }
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    root.querySelectorAll("[data-due]").forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.dataset.due;
        let due = "";
        if (v === "today") due = U().todayStr();
        if (v === "tomorrow") due = U().toDotDate(U().addDays(new Date(), 1));
        if (v === "week") {
          const d = new Date();
          const day = d.getDay() || 7;
          due = U().toDotDate(U().addDays(d, 8 - day));
        }
        if (v === "pick") {
          const val = prompt("Tarih (gg.aa.yyyy)", U().todayStr());
          if (!val) return;
          due = val;
        }
        if (v === "repeat") {
          Warman.ui.toast("Görev oluştuktan sonra detay panelinden tekrar ayarlayın.");
          return;
        }
        root.querySelectorAll("[data-due]").forEach((x) => x.classList.toggle("active", x === b));
        input.dataset.due = due;
      });
    });
    root.querySelector("#quickTaskBtn")?.addEventListener("click", () => {
      const due = input.dataset.due || "";
      submit({ due_date: due, status: due ? "planned" : "inbox" });
    });
  }

  function openDetail(id) {
    const t = Warman.store.taskById(id);
    if (!t) return;
    Warman.store.set({ selectedTaskId: id });
    const projects = Warman.store.get().projects;
    Warman.ui.setDetailTitle("Görev");
    const sub = (t.subtasks || []).map((s) => `
      <div class="prio-item ${s.completed ? "done" : ""}" data-sub="${s.id}">
        <input class="check" type="checkbox" ${s.completed ? "checked" : ""} data-toggle-sub="${s.id}">
        <span class="title" style="flex:1;${s.completed ? "text-decoration:line-through;color:var(--text-muted)" : ""}">${U().escapeHtml(s.text)}</span>
        <button class="icon-btn" data-del-sub="${s.id}" style="width:28px;height:28px"><i class="ph ph-x"></i></button>
      </div>`).join("");
    Warman.ui.openDetail(`
      <div class="field"><label>Başlık</label><input id="dTitle" value="${U().escapeHtml(t.title)}"></div>
      <div class="field"><label>Durum</label>
        <select id="dStatus">${Warman.config.statuses.map((s) => `<option value="${s.id}" ${t.status===s.id?"selected":""}>${s.label}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Öncelik</label>
        <select id="dPriority">${Warman.config.priorities.map((s) => `<option value="${s.id}" ${t.priority===s.id?"selected":""}>${s.label}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Proje</label>
        <select id="dProject"><option value="">Bağlı değil</option>${projects.map((p) => `<option value="${p.id}" ${String(t.project_id)===String(p.id)?"selected":""}>${U().escapeHtml(p.title)}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Tarih (isteğe bağlı)</label><input id="dDate" value="${U().escapeHtml(t.due_date || "")}" placeholder="gg.aa.yyyy veya boş"></div>
      <div class="field"><label>Saat (isteğe bağlı)</label><input id="dTime" value="${U().escapeHtml(t.due_time || "")}" placeholder="14:30"></div>
      <div class="field"><label>Etiketler</label><input id="dTags" value="${U().escapeHtml((t.tags||[]).join(", "))}" placeholder="virgülle ayırın"></div>
      <div class="field"><label>Açıklama</label><textarea id="dDesc">${U().escapeHtml(t.description || "")}</textarea></div>
      <div class="field"><label>Notlar</label><textarea id="dNotes">${U().escapeHtml(t.notes || "")}</textarea></div>
      <div class="field"><label>Tahmini süre (dk)</label><input id="dEst" value="${U().escapeHtml(t.estimated_minutes || "")}"></div>
      <div class="field"><label>Tekrar</label>
        <select id="dRec">
          <option value="">Yok</option>
          <option value="daily" ${t.recurrence==="daily"?"selected":""}>Günlük</option>
          <option value="weekly" ${t.recurrence==="weekly"?"selected":""}>Haftalık</option>
          <option value="monthly" ${t.recurrence==="monthly"?"selected":""}>Aylık</option>
        </select>
      </div>
      <div>
        <label class="field" style="margin-bottom:8px">Alt görevler</label>
        ${sub || '<p style="color:var(--text-muted);font-size:12px">Henüz alt görev yok.</p>'}
        <div class="add-subtask-row" style="display:flex;gap:6px;margin-top:8px">
          <input id="dSubInput" placeholder="Alt görev ekle" style="flex:1;border:1px dashed var(--border);border-radius:8px;padding:8px;background:var(--surface-2)">
          <button class="btn btn-sm" id="dSubAdd"><i class="ph ph-plus"></i></button>
        </div>
      </div>
      <div class="chip-row">
        <button class="chip ${t.pinned?"active":""}" id="dPin"><i class="ph ph-push-pin"></i> Sabitle</button>
        <button class="chip ${t.favorite?"active":""}" id="dFav"><i class="ph ph-star"></i> Favori</button>
        <button class="chip" id="dDup">Çoğalt</button>
        <button class="chip" id="dFocus">Odak</button>
        <button class="chip" id="dArch">${t.archived ? "Geri yükle" : "Arşivle"}</button>
      </div>
      <button class="btn btn-danger" id="dDel">Sil</button>
      <p style="font-size:11px;color:var(--text-soft)">Oluşturma: ${t.created_at ? new Date(t.created_at).toLocaleString("tr-TR") : "—"}</p>
    `);
    const save = async (patch) => {
      Object.assign(t, patch);
      if (patch.status === "done") { t.completed = true; t.completed_at = new Date().toISOString(); }
      if (patch.status && patch.status !== "done") t.completed = false;
      try { await persist(t); Warman.router.refresh(); }
      catch (err) { Warman.ui.toast("Kaydedilemedi: " + err.message, "error"); }
    };
    document.getElementById("dTitle").onchange = (e) => save({ title: e.target.value.trim() || t.title });
    document.getElementById("dStatus").onchange = (e) => save({ status: e.target.value });
    document.getElementById("dPriority").onchange = (e) => save({ priority: e.target.value });
    document.getElementById("dProject").onchange = (e) => { lastProjectId = e.target.value || null; save({ project_id: e.target.value || null }); };
    document.getElementById("dDate").onchange = (e) => save({ due_date: e.target.value.trim() });
    document.getElementById("dTime").onchange = (e) => save({ due_time: e.target.value.trim() });
    document.getElementById("dTags").onchange = (e) => save({ tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) });
    document.getElementById("dDesc").onchange = (e) => save({ description: e.target.value });
    document.getElementById("dNotes").onchange = (e) => save({ notes: e.target.value });
    document.getElementById("dEst").onchange = (e) => save({ estimated_minutes: e.target.value });
    document.getElementById("dRec").onchange = (e) => save({ recurrence: e.target.value || null });
    document.getElementById("dPin").onclick = () => save({ pinned: !t.pinned }).then(() => openDetail(id));
    document.getElementById("dFav").onclick = () => save({ favorite: !t.favorite }).then(() => openDetail(id));
    document.getElementById("dDup").onclick = () => duplicate(id);
    document.getElementById("dFocus").onclick = () => focusMode(id);
    document.getElementById("dArch").onclick = () => save({ archived: !t.archived }).then(() => { Warman.ui.closeDetail(); Warman.router.refresh(); });
    document.getElementById("dDel").onclick = async () => {
      if (await Warman.ui.confirm({ title: "Görevi sil", message: t.title, danger: true, ok: "Sil" })) remove(id);
    };
    document.getElementById("dSubAdd").onclick = async () => {
      const v = document.getElementById("dSubInput").value.trim();
      if (!v) return;
      t.subtasks = [...(t.subtasks || []), { id: U().uid(), text: v, completed: false }];
      await persist(t); openDetail(id);
    };
    document.getElementById("dSubInput").onkeydown = (e) => { if (e.key === "Enter") document.getElementById("dSubAdd").click(); };
    document.querySelectorAll("[data-toggle-sub]").forEach((el) => {
      el.onchange = async () => {
        const sub = t.subtasks.find((s) => String(s.id) === el.dataset.toggleSub);
        if (sub) sub.completed = el.checked;
        await persist(t); openDetail(id);
      };
    });
    document.querySelectorAll("[data-del-sub]").forEach((el) => {
      el.onclick = async () => {
        t.subtasks = t.subtasks.filter((s) => String(s.id) !== el.dataset.delSub);
        await persist(t); openDetail(id);
      };
    });
    if (window.flatpickr && !document.getElementById("dDate")._flatpickr) {
      flatpickr("#dDate", { locale: "tr", dateFormat: "d.m.Y", allowInput: true, allowInvalidPreload: true });
    }
  }

  function focusMode(id) {
    const t = Warman.store.taskById(id);
    if (!t) return;
    let remaining = 25 * 60;
    let timer = null;
    const overlay = document.createElement("div");
    overlay.className = "focus-screen";
    overlay.innerHTML = `
      <button class="btn" id="focusClose" style="position:absolute;top:20px;right:20px">Kapat</button>
      <p style="color:var(--text-muted)">Odak modu</p>
      <h2>${U().escapeHtml(t.title)}</h2>
      <div class="focus-timer" id="focusTimer">25:00</div>
      <div class="view-actions">
        <button class="btn btn-primary" id="focusStart">Başlat</button>
        <button class="btn" id="focusDone">Görevi tamamla</button>
      </div>`;
    document.body.appendChild(overlay);
    const tick = () => {
      const m = String(Math.floor(remaining / 60)).padStart(2, "0");
      const s = String(remaining % 60).padStart(2, "0");
      document.getElementById("focusTimer").textContent = `${m}:${s}`;
    };
    document.getElementById("focusClose").onclick = () => { clearInterval(timer); overlay.remove(); };
    document.getElementById("focusStart").onclick = () => {
      if (timer) return;
      timer = setInterval(() => {
        remaining -= 1;
        tick();
        if (remaining <= 0) { clearInterval(timer); Warman.ui.toast("Pomodoro tamamlandı"); }
      }, 1000);
    };
    document.getElementById("focusDone").onclick = async () => {
      clearInterval(timer); overlay.remove(); await toggleDone(id);
    };
  }

  function filtersHtml() {
    const st = Warman.store.get();
    return `<div class="filters">
      <select class="filter-select" data-filter="status"><option value="">Tüm durumlar</option>${Warman.config.statuses.map((s) => `<option value="${s.id}" ${st.filters.status===s.id?"selected":""}>${s.label}</option>`).join("")}</select>
      <select class="filter-select" data-filter="priority"><option value="">Tüm öncelikler</option>${Warman.config.priorities.map((s) => `<option value="${s.id}" ${st.filters.priority===s.id?"selected":""}>${s.label}</option>`).join("")}</select>
      <select class="filter-select" data-filter="project"><option value="">Tüm projeler</option>${st.projects.map((p) => `<option value="${p.id}" ${String(st.filters.project)===String(p.id)?"selected":""}>${U().escapeHtml(p.title)}</option>`).join("")}</select>
      <select class="filter-select" data-filter="date">
        <option value="">Tüm tarihler</option>
        <option value="none" ${st.filters.date==="none"?"selected":""}>Tarihsiz</option>
        <option value="today" ${st.filters.date==="today"?"selected":""}>Bugün</option>
        <option value="overdue" ${st.filters.date==="overdue"?"selected":""}>Gecikmiş</option>
      </select>
    </div>`;
  }

  function bindFilters(root) {
    root.querySelectorAll("[data-filter]").forEach((el) => {
      el.onchange = () => {
        const f = { ...Warman.store.get().filters, [el.dataset.filter]: el.value };
        Warman.store.set({ filters: f });
        Warman.router.refresh();
      };
    });
  }

  function rowHtml(t) {
    const proj = Warman.store.projectById(t.project_id);
    const blocked = isBlocked(t);
    return `<div class="task-row ${t.completed ? "done" : ""}" data-id="${t.id}">
      <input class="check" type="checkbox" ${t.completed ? "checked" : ""} data-done="${t.id}">
      <input class="check" type="checkbox" data-sel="${t.id}" ${selected.has(Number(t.id)) ? "checked" : ""} title="Seç" style="opacity:.55">
      <div class="title">${t.pinned ? "📌 " : ""}${U().escapeHtml(t.title)}${blocked ? ' <span class="badge badge-waiting">Engelli</span>' : ""}</div>
      <div class="meta">
        ${Warman.ui.badge("status", t.status)}
        ${Warman.ui.badge("priority", t.priority)}
        ${t.due_date ? `<span class="badge badge-planned">${U().escapeHtml(U().formatShortDate(t.due_date))}${t.due_time ? " " + U().escapeHtml(t.due_time) : ""}</span>` : `<span class="badge badge-inbox">Tarihsiz</span>`}
        ${proj ? `<span class="badge badge-inbox">${U().escapeHtml(proj.title)}</span>` : ""}
      </div>
    </div>`;
  }

  function renderList(list) {
    const pinned = list.filter((t) => t.pinned);
    const rest = U().sortTasks(list.filter((t) => !t.pinned));
    const ordered = [...pinned, ...rest];
    if (!ordered.length) return `<div class="empty"><i class="ph ph-tray"></i><p>Görev yok. Yukarıdan ad yazıp Enter'a basın.</p></div>`;
    return `<div class="card">${ordered.map(rowHtml).join("")}</div>`;
  }

  function renderKanban(list) {
    const cols = Warman.config.statuses.map((s) => {
      const items = list.filter((t) => t.status === s.id);
      return `<div class="kanban-col"><h3>${s.label} <span>${items.length}</span></h3>
        <div class="kanban-drop" data-status="${s.id}">
          ${items.map((t) => `<div class="kanban-card" draggable="true" data-id="${t.id}"><h4>${U().escapeHtml(t.title)}</h4>${t.due_date ? `<small>${U().escapeHtml(U().formatShortDate(t.due_date))}</small>` : ""}</div>`).join("")}
        </div></div>`;
    }).join("");
    return `<div class="kanban">${cols}</div>`;
  }

  function bindList(root) {
    root.querySelectorAll(".task-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-done],[data-sel]")) return;
        openDetail(row.dataset.id);
      });
    });
    root.querySelectorAll("[data-done]").forEach((el) => el.addEventListener("change", () => toggleDone(el.dataset.done)));
    root.querySelectorAll("[data-sel]").forEach((el) => {
      el.addEventListener("change", () => {
        const id = Number(el.dataset.sel);
        if (el.checked) selected.add(id); else selected.delete(id);
        Warman.router.refresh();
      });
    });
    root.querySelectorAll(".kanban-card").forEach((card) => {
      card.addEventListener("dragstart", (e) => e.dataTransfer.setData("id", card.dataset.id));
      card.addEventListener("click", () => openDetail(card.dataset.id));
    });
    root.querySelectorAll(".kanban-drop").forEach((col) => {
      col.addEventListener("dragover", (e) => e.preventDefault());
      col.addEventListener("drop", async (e) => {
        e.preventDefault();
        await setStatus(e.dataTransfer.getData("id"), col.dataset.status);
      });
    });
  }

  function bulkBar() {
    if (!selected.size) return "";
    return `<div class="bulk-bar">${selected.size} seçili
      <button class="btn btn-sm" data-bulk="done">Tamamla</button>
      <button class="btn btn-sm" data-bulk="inbox">Gelen kutusuna</button>
      <button class="btn btn-sm" data-bulk="clear">Seçimi temizle</button>
    </div>`;
  }

  function render(view, opts) {
    opts = opts || {};
    const mode = opts.mode || "all";
    const v = opts.view || "list";
    const list = visible(mode);
    const title = mode === "inbox" ? "Gelen Kutusu" : "Görevlerim";
    const sub = mode === "inbox" ? "Tarihsiz işler burada bekler. Sadece ad yazmanız yeterli." : "Liste, kanban ve proje bağlama tek kayıttan çalışır.";
    view.innerHTML = `
      <div class="view-head">
        <div><h1>${title}</h1><p>${sub}</p></div>
        <div class="view-actions">
          ${mode !== "inbox" ? `<div class="seg">
            <button data-view="list" class="${v==="list"?"active":""}">Liste</button>
            <button data-view="kanban" class="${v==="kanban"?"active":""}">Kanban</button>
            <button data-view="project" class="${v==="project"?"active":""}">Proje</button>
          </div>` : ""}
        </div>
      </div>
      <div class="inbox-cta">
        <div class="quick-add">
          <i class="ph ph-plus"></i>
          <input id="quickTaskInput" placeholder="Görev adı yazın ve Enter'a basın">
          <button class="btn btn-primary btn-sm" id="quickTaskBtn">Ekle</button>
        </div>
        <div class="chip-row" style="margin-top:8px">
          <button class="chip" data-due="none">Tarihsiz</button>
          <button class="chip" data-due="today">Bugün</button>
          <button class="chip" data-due="tomorrow">Yarın</button>
          <button class="chip" data-due="week">Bu hafta</button>
          <button class="chip" data-due="pick">Tarih seç</button>
          <button class="chip" data-due="repeat">Tekrar et</button>
        </div>
        <div id="nlHint" class="quick-add-hint" style="margin-top:6px"></div>
      </div>
      ${filtersHtml()}
      ${v === "kanban" ? renderKanban(list) : v === "project" ? renderByProject(list) : renderList(list)}
      ${bulkBar()}
    `;
    bindQuick(view);
    bindFilters(view);
    bindList(view);
    view.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => Warman.router.go("tasks", { view: b.dataset.view }));
    view.querySelector("[data-bulk='done']")?.addEventListener("click", async () => {
      for (const id of [...selected]) await setStatus(id, "done");
      selected.clear(); Warman.router.refresh();
    });
    view.querySelector("[data-bulk='inbox']")?.addEventListener("click", async () => {
      for (const id of [...selected]) await setStatus(id, "inbox");
      selected.clear(); Warman.router.refresh();
    });
    view.querySelector("[data-bulk='clear']")?.addEventListener("click", () => { selected.clear(); Warman.router.refresh(); });
  }

  function renderByProject(list) {
    const groups = new Map();
    list.forEach((t) => {
      const key = t.project_id || "none";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
    let html = "";
    groups.forEach((items, key) => {
      const name = key === "none" ? "Projeye bağlı değil" : (Warman.store.projectById(key)?.title || "Proje");
      html += `<h3 style="margin:16px 0 8px">${U().escapeHtml(name)}</h3>` + renderList(items);
    });
    return html || `<div class="empty"><i class="ph ph-folders"></i><p>Görev yok.</p></div>`;
  }

  Warman.tasks = {
    render, visible, createFromTitle, persist, remove, toggleDone, setStatus, openDetail,
    quickCreate, isBlocked, defaultsForNew, duplicate
  };
})();
