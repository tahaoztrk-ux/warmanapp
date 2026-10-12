window.Warman = window.Warman || {};
(function () {
  const U = () => Warman.utils;
  let undoTimer = null;
  let undoAction = null;

  function toast(message, type, action) {
    const stack = document.getElementById("toastStack");
    const el = document.createElement("div");
    el.className = `toast ${type || ""}`;
    el.innerHTML = `<div class="msg">${U().escapeHtml(message)}</div>`;
    if (action) {
      const b = document.createElement("button");
      b.textContent = action.label;
      b.onclick = () => { action.onClick(); el.remove(); };
      el.appendChild(b);
    }
    stack.appendChild(el);
    setTimeout(() => el.remove(), action ? 8000 : 4200);
  }

  function confirm(opts) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
        <h3>${U().escapeHtml(opts.title || "Onay")}</h3>
        <p>${U().escapeHtml(opts.message || "")}</p>
        <div class="modal-actions">
          <button class="btn" data-no>Vazgeç</button>
          <button class="btn ${opts.danger ? "btn-danger" : "btn-primary"}" data-yes>${U().escapeHtml(opts.ok || "Onayla")}</button>
        </div>
      </div>`;
      overlay.querySelector("[data-no]").onclick = () => { overlay.remove(); resolve(false); };
      overlay.querySelector("[data-yes]").onclick = () => { overlay.remove(); resolve(true); };
      overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
      document.body.appendChild(overlay);
      overlay.querySelector("[data-yes]").focus();
    });
  }

  function offerUndo(message, restore) {
    undoAction = restore;
    clearTimeout(undoTimer);
    toast(message, "", {
      label: "Geri al",
      onClick: async () => {
        if (undoAction) await undoAction();
        undoAction = null;
      }
    });
    undoTimer = setTimeout(() => { undoAction = null; }, 8000);
  }

  function setThemeIcon() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const icon = document.getElementById("themeIcon");
    if (icon) icon.className = dark ? "ph ph-sun" : "ph ph-moon";
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    Warman.store.saveSettings({ theme: cur });
    setThemeIcon();
  }

  function openNav() { document.body.classList.add("nav-open"); }
  function closeNav() { document.body.classList.remove("nav-open"); }

  function openDetail(html) {
    document.getElementById("appShell").classList.add("detail-open");
    document.getElementById("detailBody").innerHTML = html;
  }
  function closeDetail() {
    document.getElementById("appShell").classList.remove("detail-open");
    Warman.store.set({ selectedTaskId: null });
  }
  function setDetailTitle(t) {
    document.getElementById("detailTitle").textContent = t;
  }

  function commandPalette() {
    const existing = document.getElementById("commandOverlay");
    if (existing) { existing.remove(); return; }
    const overlay = document.createElement("div");
    overlay.id = "commandOverlay";
    overlay.className = "command-overlay";
    const items = [
      { id: "task", label: "Görev ekle", hint: "N", run: () => Warman.tasks.quickCreate() },
      { id: "project", label: "Proje oluştur", run: () => Warman.router.go("projects") || Warman.projects.promptCreate() },
      { id: "search", label: "Görev ara", run: () => document.getElementById("globalSearch").focus() },
      { id: "overview", label: "Genel Bakış", run: () => Warman.router.go("overview") },
      { id: "inbox", label: "Gelen Kutusu", run: () => Warman.router.go("inbox") },
      { id: "tasks", label: "Görevlerim", run: () => Warman.router.go("tasks") },
      { id: "projects", label: "Projeler", run: () => Warman.router.go("projects") },
      { id: "flow", label: "Akış Yönetimi", run: () => Warman.router.go("projects") },
      { id: "work", label: "İş ve Mesai Takibi", run: () => Warman.router.go("work") },
      { id: "calendar", label: "Takvim", run: () => Warman.router.go("calendar") },
      { id: "theme", label: "Tema değiştir", run: toggleTheme }
    ];
    overlay.innerHTML = `<div class="command-box"><input id="commandInput" placeholder="Komut yazın veya arayın..." autocomplete="off"><div class="command-list" id="commandList"></div></div>`;
    function render(q) {
      const qn = (q || "").toLowerCase();
      const list = items.filter((i) => i.label.toLowerCase().includes(qn));
      document.getElementById("commandList").innerHTML = list.map((i, idx) =>
        `<button class="command-item ${idx === 0 ? "active" : ""}" data-id="${i.id}"><i class="ph ph-arrow-right"></i> ${U().escapeHtml(i.label)}${i.hint ? `<small>${i.hint}</small>` : ""}</button>`
      ).join("") || `<div class="command-item">Sonuç yok</div>`;
    }
    document.body.appendChild(overlay);
    render("");
    const input = document.getElementById("commandInput");
    input.focus();
    input.oninput = () => render(input.value);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
      const btn = e.target.closest("[data-id]");
      if (btn) {
        const item = items.find((i) => i.id === btn.dataset.id);
        overlay.remove();
        item?.run();
      }
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") overlay.remove();
      if (e.key === "Enter") {
        const first = overlay.querySelector(".command-item[data-id]");
        if (first) first.click();
      }
    });
  }

  function bindChrome() {
    if (Warman.ui._bound) return;
    Warman.ui._bound = true;
    document.getElementById("navToggle")?.addEventListener("click", () => {
      if (window.innerWidth <= 1100) openNav();
      else document.getElementById("appShell").classList.toggle("collapsed");
    });
    document.getElementById("mobileBackdrop")?.addEventListener("click", closeNav);
    document.getElementById("themeBtn")?.addEventListener("click", toggleTheme);
    document.getElementById("logoutBtn")?.addEventListener("click", Warman.auth.logout);
    document.getElementById("detailClose")?.addEventListener("click", closeDetail);
    document.getElementById("quickAddBtn")?.addEventListener("click", () => Warman.tasks.quickCreate());
    document.getElementById("notifyBtn")?.addEventListener("click", () => {
      const s = Warman.store.get().settings;
      if (!s.notifications) return toast("Bildirimler kapalı. Ayarlardan açabilirsiniz.");
      toast("Yalnızca tarihli görevler için tarayıcı açıkken hatırlatma yapılır.");
    });
    document.getElementById("globalSearch")?.addEventListener("input", (e) => {
      Warman.store.set({ search: e.target.value });
      Warman.router.refresh();
    });
    document.querySelectorAll(".nav-item[data-route]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeNav();
        Warman.router.go(btn.dataset.route);
      });
    });
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        commandPalette();
      }
      if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey && !/input|textarea|select/i.test(e.target.tagName)) {
        e.preventDefault();
        Warman.tasks.quickCreate();
      }
      if (e.key === "Escape") {
        closeDetail();
        document.getElementById("commandOverlay")?.remove();
      }
    });
    setThemeIcon();
  }

  function markNav(route) {
    document.querySelectorAll(".nav-item[data-route]").forEach((b) => {
      b.classList.toggle("active", b.dataset.route === route || (route === "project" && b.dataset.route === "projects") || (route === "flow" && b.dataset.route === "flow"));
    });
  }

  function badge(type, id) {
    const label = type === "status" ? U().statusLabel(id) : U().priorityLabel(id);
    return `<span class="badge badge-${U().escapeHtml(id || "")}">${U().escapeHtml(label)}</span>`;
  }

  Warman.ui = {
    toast, confirm, offerUndo, toggleTheme, setThemeIcon, openNav, closeNav,
    openDetail, closeDetail, setDetailTitle, commandPalette, bindChrome, markNav, badge
  };
})();
