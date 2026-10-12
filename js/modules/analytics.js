window.Warman = window.Warman || {};
(function () {
  const U = () => Warman.utils;

  function render(view) {
    const tasks = Warman.store.get().tasks;
    const work = Warman.store.get().work.filter((w) => !w.archive_id);
    const projects = Warman.store.get().projects;
    const now = new Date();
    const weekAgo = U().addDays(now, -7);
    const completedWeek = tasks.filter((t) => t.completed_at && new Date(t.completed_at) >= weekAgo).length;
    const overdue = tasks.filter(U().isOverdue).length;
    const statusCounts = {};
    Warman.config.statuses.forEach((s) => { statusCounts[s.id] = tasks.filter((t) => t.status === s.id).length; });
    const monthBars = lastMonths(tasks, 6);
    const workHours = lastWorkMonths(work, 6);
    const loc = {};
    work.forEach((w) => { loc[w.location] = (loc[w.location] || 0) + 1; });
    const durations = tasks.filter((t) => t.created_at && t.completed_at).map((t) => (new Date(t.completed_at) - new Date(t.created_at)) / 86400000);
    const avg = durations.length ? (durations.reduce((a, b) => a + b, 0) / durations.length) : null;

    view.innerHTML = `
      <div class="view-head">
        <div><h1>Analizler</h1><p>Yalnızca gerçek kayıtlardan üretilir. Veri yoksa uydurma sayı gösterilmez.</p></div>
      </div>
      <div class="stat-grid">
        ${metric("Bu hafta tamamlanan", completedWeek)}
        ${metric("Geciken", overdue)}
        ${metric("Ort. tamamlanma", avg == null ? "Veri yok" : avg.toFixed(1) + " gün")}
        ${metric("Aktif dönem mesai", U().formatHours(work.reduce((s,r)=>s+(r.overtime==="Mesai yaptım"?U().parseHours(r.overtime_hours):0),0)) + " sa")}
      </div>
      <div class="dash-grid" style="margin-top:16px">
        <section class="card panel-pad">
          <h3 class="panel-title">Aylık tamamlanan görevler</h3>
          ${chart(monthBars)}
        </section>
        <section class="card panel-pad">
          <h3 class="panel-title">Durum dağılımı</h3>
          ${Object.entries(statusCounts).map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span>${U().escapeHtml(U().statusLabel(k))}</span><strong>${v}</strong></div>`).join("")}
        </section>
        <section class="card panel-pad">
          <h3 class="panel-title">Mesai saatleri</h3>
          ${chart(workHours)}
        </section>
        <section class="card panel-pad">
          <h3 class="panel-title">Çalışma yeri</h3>
          ${Object.keys(loc).length ? Object.entries(loc).map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0"><span>${U().escapeHtml(k)}</span><strong>${v}</strong></div>`).join("") : "<p style='color:var(--text-muted)'>Kayıt yok.</p>"}
        </section>
        <section class="card panel-pad">
          <h3 class="panel-title">Proje tamamlanma</h3>
          ${projects.map((p) => { const pr = Warman.projects.progressFor(p); return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><span>${U().escapeHtml(p.title)}</span><span>${pr.pct}%</span></div><div class="progress-bar"><span style="width:${pr.pct}%"></span></div></div>`; }).join("") || "<p style='color:var(--text-muted)'>Proje yok.</p>"}
        </section>
      </div>
    `;
  }

  function metric(k, v) {
    return `<article class="card stat-card"><div class="k">${k}</div><div class="v">${v}</div></article>`;
  }

  function lastMonths(tasks, n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getMonth()+1}.${d.getFullYear()}`;
      const count = tasks.filter((t) => {
        if (!t.completed_at) return false;
        const x = new Date(t.completed_at);
        return x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear();
      }).length;
      out.push({ label: U().MONTHS[d.getMonth()].slice(0, 3), value: count });
    }
    return out;
  }

  function lastWorkMonths(work, n) {
    const now = new Date();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const sum = work.filter((w) => {
        const x = U().parseDotDate(w.date);
        return x && x.getMonth() === d.getMonth() && x.getFullYear() === d.getFullYear();
      }).reduce((s, r) => s + (r.overtime === "Mesai yaptım" ? U().parseHours(r.overtime_hours) : 0), 0);
      out.push({ label: U().MONTHS[d.getMonth()].slice(0, 3), value: sum });
    }
    return out;
  }

  function chart(items) {
    const max = Math.max(1, ...items.map((i) => i.value));
    return `<div class="chart-box">${items.map((i) => `<div class="chart-col"><div class="bar" style="height:${Math.round((i.value / max) * 100)}%"></div><span>${U().escapeHtml(i.label)}</span></div>`).join("")}</div>`;
  }

  Warman.analytics = { render };
})();
