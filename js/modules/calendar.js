window.Warman = window.Warman || {};
(function () {
  const U = () => Warman.utils;
  let cursor = new Date();
  let zoom = "month";

  function render(view, z) {
    zoom = z || zoom || "month";
    const st = Warman.store.get();
    const tasks = st.tasks.filter((t) => !t.archived && t.status !== "cancelled");
    const undated = tasks.filter((t) => !t.due_date);
    view.innerHTML = `
      <div class="view-head">
        <div><h1>Takvim</h1><p>Tarihsiz görevler kaybolmaz; yan listede durur.</p></div>
        <div class="view-actions">
          <div class="seg">
            <button data-z="day" class="${zoom==="day"?"active":""}">Gün</button>
            <button data-z="week" class="${zoom==="week"?"active":""}">Hafta</button>
            <button data-z="month" class="${zoom==="month"?"active":""}">Ay</button>
          </div>
          <button class="btn" id="calPrev">‹</button>
          <strong id="calLabel"></strong>
          <button class="btn" id="calNext">›</button>
        </div>
      </div>
      <div class="dash-grid">
        <div id="calMain"></div>
        <aside class="card panel-pad">
          <h3 class="panel-title">Tarihsiz</h3>
          ${undated.length ? undated.map((t)=>`<div class="kanban-card" draggable="true" data-id="${t.id}">${U().escapeHtml(t.title)}</div>`).join("") : "<p style='color:var(--text-muted)'>Tarihsiz görev yok.</p>"}
        </aside>
      </div>
    `;
    view.querySelectorAll("[data-z]").forEach((b) => b.onclick = () => { zoom = b.dataset.z; render(view, zoom); });
    view.querySelector("#calPrev").onclick = () => { shift(-1); render(view, zoom); };
    view.querySelector("#calNext").onclick = () => { shift(1); render(view, zoom); };
    const main = view.querySelector("#calMain");
    if (zoom === "month") month(main, tasks);
    else if (zoom === "week") week(main, tasks);
    else day(main, tasks);
    view.querySelectorAll(".kanban-card[data-id]").forEach((el) => {
      el.addEventListener("dragstart", (e) => e.dataTransfer.setData("id", el.dataset.id));
    });
  }

  function shift(n) {
    if (zoom === "month") cursor.setMonth(cursor.getMonth() + n);
    else if (zoom === "week") cursor.setDate(cursor.getDate() + n * 7);
    else cursor.setDate(cursor.getDate() + n);
  }

  function month(el, tasks) {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    document.getElementById("calLabel").textContent = `${U().MONTHS[m]} ${y}`;
    const first = new Date(y, m, 1);
    const startDay = (first.getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(`<div class="cal-cell out"></div>`);
    for (let d = 1; d <= days; d++) {
      const date = U().toDotDate(new Date(y, m, d));
      const items = tasks.filter((t) => t.due_date === date);
      const today = date === U().todayStr() ? "today" : "";
      cells.push(`<div class="cal-cell ${today}" data-date="${date}">
        <div class="cal-day">${d}</div>
        ${items.map((t)=>`<div class="cal-pill" draggable="true" data-id="${t.id}">${U().escapeHtml(t.title)}</div>`).join("")}
      </div>`);
    }
    el.innerHTML = `<div class="cal-grid">${["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"].map((d)=>`<strong style="text-align:center;font-size:12px;color:var(--text-muted)">${d}</strong>`).join("")}${cells.join("")}</div>`;
    bindDrop(el);
  }

  function week(el, tasks) {
    const start = new Date(cursor);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
    document.getElementById("calLabel").textContent = `${U().toDotDate(start)} — ${U().toDotDate(U().addDays(start, 6))}`;
    const cols = [];
    for (let i = 0; i < 7; i++) {
      const d = U().addDays(start, i);
      const date = U().toDotDate(d);
      const items = tasks.filter((t) => t.due_date === date);
      cols.push(`<div class="cal-cell ${date===U().todayStr()?"today":""}" data-date="${date}"><div class="cal-day">${d.toLocaleDateString("tr-TR",{weekday:"short", day:"numeric"})}</div>${items.map((t)=>`<div class="cal-pill" data-id="${t.id}">${U().escapeHtml(t.title)}</div>`).join("")}</div>`);
    }
    el.innerHTML = `<div class="cal-grid">${cols.join("")}</div>`;
    bindDrop(el);
  }

  function day(el, tasks) {
    const date = U().toDotDate(cursor);
    document.getElementById("calLabel").textContent = U().formatDetailedDate(date);
    const items = U().sortTasks(tasks.filter((t) => t.due_date === date));
    el.innerHTML = `<div class="card" data-date="${date}" style="min-height:240px;padding:8px">
      ${items.map((t)=>`<div class="task-row" data-id="${t.id}"><div class="title">${U().escapeHtml(t.due_time || "—")} · ${U().escapeHtml(t.title)}</div></div>`).join("") || "<p style='padding:16px;color:var(--text-muted)'>Bu günde görev yok. Tarihsizleri sürükleyin.</p>"}
    </div>`;
    bindDrop(el);
    el.querySelectorAll(".task-row").forEach((r) => r.onclick = () => Warman.tasks.openDetail(r.dataset.id));
  }

  function bindDrop(el) {
    el.querySelectorAll("[data-date]").forEach((cell) => {
      cell.addEventListener("dragover", (e) => e.preventDefault());
      cell.addEventListener("drop", async (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("id");
        const t = Warman.store.taskById(id);
        if (!t) return;
        t.due_date = cell.dataset.date;
        if (t.status === "inbox") t.status = "planned";
        await Warman.tasks.persist(t);
        Warman.router.refresh();
      });
    });
    el.querySelectorAll("[data-id]").forEach((pill) => {
      pill.draggable = true;
      pill.addEventListener("dragstart", (e) => e.dataTransfer.setData("id", pill.dataset.id));
      pill.addEventListener("click", () => Warman.tasks.openDetail(pill.dataset.id));
    });
  }

  Warman.calendar = { render };
})();
