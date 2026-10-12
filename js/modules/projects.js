window.Warman = window.Warman || {};
(function () {
  const U = () => Warman.utils;

  function progressFor(project) {
    const tasks = Warman.store.get().tasks.filter((t) => String(t.project_id) === String(project.id) && t.status !== "cancelled");
    const nodeTasks = linkedFromFlow(project);
    const all = new Map();
    tasks.forEach((t) => all.set(String(t.id), t));
    nodeTasks.forEach((t) => { if (t) all.set(String(t.id), t); });
    const list = [...all.values()];
    if (!list.length) {
      const subs = project.subtasks || [];
      if (!subs.length) return { pct: 0, done: 0, total: 0 };
      const done = subs.filter((s) => s.completed).length;
      return { pct: Math.round((done / subs.length) * 100), done, total: subs.length };
    }
    const done = list.filter((t) => t.completed || t.status === "done").length;
    return { pct: Math.round((done / list.length) * 100), done, total: list.length };
  }

  function linkedFromFlow(project) {
    try {
      const data = typeof project.flow_data === "string" ? JSON.parse(project.flow_data || "null") : project.flow_data;
      const nodes = Object.values(data?.drawflow?.Home?.data || {});
      return nodes.map((n) => n.data?.taskId ? Warman.store.taskById(n.data.taskId) : null).filter(Boolean);
    } catch (e) { return []; }
  }

  async function persist(project) {
    project.updated_at = new Date().toISOString();
    const saved = await Warman.api.saveProject(project);
    const list = Warman.store.get().projects;
    const idx = list.findIndex((p) => Number(p.id) === Number(project.id));
    if (idx >= 0) list[idx] = { ...list[idx], ...saved, ...project };
    else list.unshift(project);
    Warman.store.set({ projects: list });
    return project;
  }

  async function create(title, extras) {
    extras = extras || {};
    const project = {
      id: U().uid(),
      title,
      date: extras.date || "",
      description: extras.description || "",
      subtasks: extras.subtasks || [],
      flow_data: "",
      status: "planning",
      priority: "normal",
      notes: "",
      start_date: extras.date || "",
      end_date: ""
    };
    Warman.store.get().projects.unshift(project);
    Warman.store.set({ projects: Warman.store.get().projects });
    try {
      await persist(project);
      if (extras.templateTasks) {
        for (const name of extras.templateTasks) {
          await Warman.tasks.createFromTitle(name, { project_id: project.id, status: "planned" });
        }
        project.subtasks = extras.templateTasks.map((text) => ({ id: U().uid(), text, completed: false }));
        await persist(project);
      }
      Warman.store.log("Proje oluşturuldu: " + title, "project");
      return project;
    } catch (err) {
      Warman.store.set({ projects: Warman.store.get().projects.filter((p) => p.id !== project.id) });
      Warman.ui.toast("Proje kaydedilemedi: " + err.message, "error");
      return null;
    }
  }

  async function promptCreate() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal">
      <h3>Yeni proje</h3>
      <p>Sadece ad yeter. Şablon ve tarih isteğe bağlı.</p>
      <div class="field"><label>Proje adı</label><input id="npTitle" placeholder="Yeni web sitesi"></div>
      <div class="field"><label>Şablon</label>
        <select id="npTpl"><option value="">Yok</option>
          <option value="software">Yazılım Geliştirme</option>
          <option value="website">Web Sitesi</option>
          <option value="bugfix">Hata Düzeltme</option>
          <option value="general">Genel Proje</option>
        </select>
      </div>
      <div class="modal-actions"><button class="btn" data-no>Vazgeç</button><button class="btn btn-primary" data-ok>Oluştur</button></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-no]").onclick = () => overlay.remove();
    overlay.querySelector("[data-ok]").onclick = async () => {
      const title = overlay.querySelector("#npTitle").value.trim();
      if (!title) return Warman.ui.toast("Proje adı yazın.");
      const tpl = overlay.querySelector("#npTpl").value;
      overlay.remove();
      const extra = {};
      if (tpl) extra.templateTasks = Warman.config.templates[tpl].tasks;
      const p = await create(title, extra);
      if (p) Warman.router.go("project", { id: p.id });
    };
    overlay.querySelector("#npTitle").focus();
  }

  function renderList(view) {
    const projects = Warman.store.get().projects.filter((p) => p.status !== "archived");
    view.innerHTML = `
      <div class="view-head">
        <div><h1>Projeler</h1><p>Çalışma alanına girin, görev ve akış aynı yerde.</p></div>
        <button class="btn btn-primary" id="newProject"><i class="ph ph-plus"></i> Yeni proje</button>
      </div>
      ${projects.length ? `<div class="project-grid">${projects.map((p) => {
        const pr = progressFor(p);
        return `<article class="card project-card" data-open="${p.id}">
          <div style="display:flex;justify-content:space-between;gap:8px">
            <strong>${U().escapeHtml(p.title)}</strong>
            <span class="badge badge-planned">${U().escapeHtml(U().projectStatusLabel(p.status))}</span>
          </div>
          <p style="color:var(--text-muted);margin:8px 0;font-size:13px">${U().escapeHtml((p.description || "Açıklama yok").slice(0, 90))}</p>
          <div class="progress-bar"><span style="width:${pr.pct}%"></span></div>
          <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:var(--text-muted)">
            <span>${pr.done}/${pr.total} iş</span>
            <span>${p.date ? U().formatShortDate(p.date) : "Tarihsiz"}</span>
          </div>
        </article>`;
      }).join("")}</div>` : `<div class="empty"><i class="ph ph-folder-dashed"></i><p>Henüz proje yok.</p><button class="btn btn-primary" id="newProjectEmpty" style="margin-top:12px">İlk projeyi oluştur</button></div>`}
    `;
    view.querySelector("#newProject")?.addEventListener("click", promptCreate);
    view.querySelector("#newProjectEmpty")?.addEventListener("click", promptCreate);
    view.querySelectorAll("[data-open]").forEach((el) => el.onclick = () => Warman.router.go("project", { id: el.dataset.open }));
  }

  function renderWorkspace(view, id, tab) {
    const p = Warman.store.projectById(id);
    if (!p) {
      view.innerHTML = `<div class="empty"><p>Proje bulunamadı veya yetkiniz yok.</p></div>`;
      return;
    }
    Warman.store.set({ selectedProjectId: Number(id) });
    const pr = progressFor(p);
    const tasks = Warman.store.get().tasks.filter((t) => String(t.project_id) === String(p.id) && !t.archived);
    tab = tab || "tasks";
    view.innerHTML = `
      <div class="view-head">
        <div>
          <p style="color:var(--text-muted);font-size:12px;margin-bottom:4px"><a href="#/projects">Projeler</a> / ${U().escapeHtml(p.title)}</p>
          <h1 contenteditable="true" id="pTitle">${U().escapeHtml(p.title)}</h1>
          <p>${pr.pct}% tamamlandı · ${pr.done}/${pr.total}</p>
        </div>
        <div class="view-actions">
          <select id="pStatus">${Warman.config.projectStatuses.map((s) => `<option value="${s.id}" ${p.status===s.id?"selected":""}>${s.label}</option>`).join("")}</select>
          <button class="btn" id="openFlow"><i class="ph ph-git-merge"></i> Akış</button>
          <button class="btn btn-danger" id="delProject">Sil</button>
        </div>
      </div>
      <div class="progress-bar" style="margin-bottom:16px"><span style="width:${pr.pct}%"></span></div>
      <div class="tabs">
        <button data-tab="tasks" class="${tab==="tasks"?"active":""}">Görevler</button>
        <button data-tab="flow" class="${tab==="flow"?"active":""}">Akış Şeması</button>
        <button data-tab="notes" class="${tab==="notes"?"active":""}">Notlar</button>
        <button data-tab="progress" class="${tab==="progress"?"active":""}">İlerleme</button>
      </div>
      <div id="wsBody"></div>
    `;
    const body = view.querySelector("#wsBody");
    if (tab === "flow") {
      Warman.flow.render(body, p.id, { embedded: true });
    } else if (tab === "notes") {
      body.innerHTML = `<div class="field"><label>Açıklama</label><textarea id="pDesc">${U().escapeHtml(p.description || "")}</textarea></div>
        <div class="field"><label>Notlar</label><textarea id="pNotes">${U().escapeHtml(p.notes || "")}</textarea></div>`;
      body.querySelector("#pDesc").onchange = async (e) => { p.description = e.target.value; await persist(p); };
      body.querySelector("#pNotes").onchange = async (e) => { p.notes = e.target.value; await persist(p); };
    } else if (tab === "progress") {
      body.innerHTML = `<div class="card panel-pad">
        <h3 class="panel-title">İlerleme</h3>
        <p style="font-size:32px;font-weight:750">${pr.pct}%</p>
        <p style="color:var(--text-muted)">${pr.done} / ${pr.total} bağlı görev tamamlandı. Bu yüzde tüm ekranlarda aynı kural ile hesaplanır.</p>
      </div>`;
    } else {
      body.innerHTML = `
        <div class="quick-add"><i class="ph ph-plus"></i><input id="quickTaskInput" placeholder="Bu projeye görev ekle ve Enter'a bas"><button class="btn btn-primary btn-sm" id="quickTaskBtn">Ekle</button></div>
        <div id="nlHint" class="quick-add-hint" style="margin-top:6px"></div>
        <div style="margin-top:14px" id="projTasks"></div>`;
      const q = body.querySelector("#quickTaskInput");
      const add = async () => {
        const title = q.value.trim();
        if (!title) return;
        await Warman.tasks.createFromTitle(title, { project_id: p.id, status: "planned" });
        q.value = "";
        Warman.router.go("project", { id: p.id, tab: "tasks" });
      };
      q.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
      body.querySelector("#quickTaskBtn").onclick = add;
      body.querySelector("#projTasks").innerHTML = tasks.length
        ? `<div class="card">${U().sortTasks(tasks).map((t) => `<div class="task-row ${t.completed?"done":""}" data-id="${t.id}"><input class="check" type="checkbox" ${t.completed?"checked":""} data-done="${t.id}"><div class="title">${U().escapeHtml(t.title)}</div>${Warman.ui.badge("status", t.status)}</div>`).join("")}</div>`
        : `<div class="empty"><p>Bu projede görev yok.</p></div>`;
      body.querySelectorAll(".task-row").forEach((row) => row.onclick = (e) => { if (!e.target.closest("[data-done]")) Warman.tasks.openDetail(row.dataset.id); });
      body.querySelectorAll("[data-done]").forEach((el) => el.onchange = () => Warman.tasks.toggleDone(el.dataset.done));
    }
    view.querySelectorAll("[data-tab]").forEach((b) => {
      b.onclick = () => {
        if (b.dataset.tab === "flow") Warman.router.go("flow", { id: p.id });
        else Warman.router.go("project", { id: p.id, tab: b.dataset.tab });
      };
    });
    view.querySelector("#openFlow").onclick = () => Warman.router.go("flow", { id: p.id });
    view.querySelector("#pStatus").onchange = async (e) => { p.status = e.target.value; await persist(p); };
    view.querySelector("#pTitle").onblur = async (e) => {
      const title = e.target.textContent.trim();
      if (title && title !== p.title) { p.title = title; await persist(p); }
    };
    view.querySelector("#delProject").onclick = async () => {
      if (!await Warman.ui.confirm({ title: "Projeyi sil", message: "Akış verisi de silinir.", danger: true, ok: "Sil" })) return;
      const copy = { ...p };
      try {
        await Warman.api.deleteProject(p.id);
        Warman.store.set({ projects: Warman.store.get().projects.filter((x) => Number(x.id) !== Number(p.id)) });
        Warman.ui.offerUndo("Proje silindi.", async () => { await persist(copy); Warman.router.go("project", { id: copy.id }); });
        Warman.router.go("projects");
      } catch (err) { Warman.ui.toast("Silinemedi: " + err.message, "error"); }
    };
  }

  function syncFromTask(task) {
    if (!task.project_id) return;
    const p = Warman.store.projectById(task.project_id);
    if (!p || !p.flow_data) return;
    try {
      const data = typeof p.flow_data === "string" ? JSON.parse(p.flow_data) : p.flow_data;
      const nodes = data?.drawflow?.Home?.data || {};
      let changed = false;
      Object.values(nodes).forEach((n) => {
        if (n.data && Number(n.data.taskId) === Number(task.id)) {
          n.data.completed = !!task.completed || task.status === "done";
          n.data.status = task.completed ? "done" : (n.data.status === "done" ? "in_progress" : n.data.status);
          changed = true;
        }
      });
      if (changed) {
        p.flow_data = JSON.stringify(data);
        persist(p).catch((err) => console.error(err));
      }
    } catch (e) { /* ignore malformed flow */ }
  }

  Warman.projects = { renderList, renderWorkspace, create, promptCreate, persist, progressFor, syncFromTask };
})();
