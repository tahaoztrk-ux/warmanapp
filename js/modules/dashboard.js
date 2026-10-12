window.Warman = window.Warman || {};
(function () {
  const U = () => Warman.utils;

  function render(view) {
    const st = Warman.store.get();
    const tasks = st.tasks.filter((t) => !t.archived);
    const projects = st.projects.filter((p) => p.status !== "archived");
    const today = U().todayStr();
    const month = today.slice(3);
    const workMonth = st.work.filter((w) => !w.archive_id && (w.date || "").endsWith(month) || (!w.archive_id && (w.date || "").slice(3) === month));
    const activeWork = st.work.filter((w) => !w.archive_id);
    const overtime = activeWork.reduce((s, r) => s + (r.overtime === "Mesai yaptım" ? U().parseHours(r.overtime_hours) : 0), 0);
    const todayTasks = tasks.filter((t) => t.due_date === today && t.status !== "cancelled");
    const overdue = tasks.filter(U().isOverdue);
    const inbox = tasks.filter((t) => !t.due_date && t.status !== "done" && t.status !== "cancelled");
    const done = tasks.filter((t) => t.completed || t.status === "done");
    const widgets = st.settings.widgets || {};

    const focus = U().sortTasks(todayTasks.filter((t) => t.status !== "done")).slice(0, 6);
    const recentProjects = [...projects].slice(0, 4);
    const activity = st.activity.slice(0, 8);

    view.innerHTML = `
      <div class="view-head">
        <div><h1>Genel Bakış</h1><p>Bugün neye bakmanız gerektiği burada.</p></div>
        <button class="btn" id="customizeDash">Widget'lar</button>
      </div>
      ${widgets.stats !== false ? `<div class="stat-grid">
        ${card("Aktif projeler", projects.filter((p)=>p.status==="active"||p.status==="planning").length, "Devam eden işler")}
        ${card("Devam eden görevler", tasks.filter((t)=>t.status==="in_progress"||t.status==="planned").length)}
        ${card("Bugün", todayTasks.filter((t)=>!t.completed).length)}
        ${card("Gecikmiş", overdue.length)}
        ${card("Tamamlanan", done.length)}
        ${card("Bu dönem mesai", U().formatHours(overtime) + " sa")}
      </div>` : ""}
      <div class="dash-grid" style="margin-top:16px">
        <div class="stack">
          ${widgets.focus !== false ? `<section class="card panel-pad">
            <h3 class="panel-title">Günün öncelikleri</h3>
            ${focus.length ? focus.map((t) => `<div class="prio-item">
              <input class="check" type="checkbox" ${t.completed?"checked":""} data-done="${t.id}">
              <div style="flex:1">
                <strong>${U().escapeHtml(t.title)}</strong>
                <div style="font-size:12px;color:var(--text-muted)">${t.due_time || "Saatsiz"} · ${U().priorityLabel(t.priority)}</div>
              </div>
            </div>`).join("") : `<p style="color:var(--text-muted)">Bugün planlı görev yok. Tarihsiz işleri güne ekleyebilirsiniz.</p>`}
            ${inbox.length ? `<div style="margin-top:12px"><p style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Tarihsiz gelen kutusu</p>
              ${inbox.slice(0,5).map((t)=>`<button class="chip" data-plan="${t.id}">${U().escapeHtml(t.title)} → Bugün</button>`).join("")}
            </div>` : ""}
          </section>` : ""}
          ${widgets.progress !== false ? `<section class="card panel-pad">
            <h3 class="panel-title">Proje ilerlemesi</h3>
            ${projects.slice(0,5).map((p) => {
              const pr = Warman.projects.progressFor(p);
              return `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px"><strong>${U().escapeHtml(p.title)}</strong><span>${pr.pct}%</span></div><div class="progress-bar"><span style="width:${pr.pct}%"></span></div></div>`;
            }).join("") || `<p style="color:var(--text-muted)">Proje yok.</p>`}
          </section>` : ""}
        </div>
        <div class="stack">
          ${widgets.continuing !== false ? `<section class="card panel-pad">
            <h3 class="panel-title">Devam ettiğim işler</h3>
            ${recentProjects.length ? recentProjects.map((p)=>`<button class="chip" data-go="${p.id}" style="width:100%;justify-content:flex-start;margin-bottom:6px">${U().escapeHtml(p.title)}</button>`).join("") : `<p style="color:var(--text-muted)">Henüz proje yok.</p>`}
          </section>` : ""}
          ${widgets.activity !== false ? `<section class="card panel-pad">
            <h3 class="panel-title">Son etkinlikler</h3>
            <ul class="activity">${activity.map((a)=>`<li><i class="ph ph-dot"></i> ${U().escapeHtml(a.text)}</li>`).join("") || "<li>Henüz etkinlik yok.</li>"}</ul>
          </section>` : ""}
        </div>
      </div>
    `;
    view.querySelectorAll("[data-done]").forEach((el) => el.onchange = () => Warman.tasks.toggleDone(el.dataset.done));
    view.querySelectorAll("[data-plan]").forEach((el) => el.onclick = async () => {
      const t = Warman.store.taskById(el.dataset.plan);
      if (!t) return;
      t.due_date = today;
      t.status = t.status === "inbox" ? "planned" : t.status;
      await Warman.tasks.persist(t);
      Warman.router.refresh();
    });
    view.querySelectorAll("[data-go]").forEach((el) => el.onclick = () => Warman.router.go("project", { id: el.dataset.go }));
    view.querySelector("#customizeDash").onclick = () => {
      const w = { ...st.settings.widgets };
      Warman.settings.renderWidgets(w);
    };
  }

  function card(k, v, h) {
    return `<article class="card stat-card"><div class="k">${k}</div><div class="v">${v}</div>${h?`<div class="h">${h}</div>`:""}</article>`;
  }

  Warman.dashboard = { render };
})();
