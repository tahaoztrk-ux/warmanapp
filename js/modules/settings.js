window.Warman = window.Warman || {};
(function () {
  const U = () => Warman.utils;

  function render(view) {
    const s = Warman.store.get().settings;
    const user = Warman.store.get().user;
    view.innerHTML = `
      <div class="view-head"><div><h1>Ayarlar</h1><p>Bu seçenekler gerçekten uygulanır.</p></div></div>
      <div class="settings-grid">
        <section class="card panel-pad">
          <h3 class="panel-title">Görünüm</h3>
          <div class="field"><label>Tema</label>
            <select id="sTheme">
              <option value="light" ${s.theme==="light"?"selected":""}>Açık</option>
              <option value="dark" ${s.theme==="dark"?"selected":""}>Koyu</option>
              <option value="system" ${s.theme==="system"?"selected":""}>Sistem</option>
            </select>
          </div>
          <div class="field"><label>Yoğunluk</label>
            <select id="sDensity">
              <option value="comfortable" ${s.density==="comfortable"?"selected":""}>Rahat</option>
              <option value="compact" ${s.density==="compact"?"selected":""}>Kompakt</option>
            </select>
          </div>
          <div class="field"><label>Açılış sayfası</label>
            <select id="sHome">
              ${["overview","inbox","tasks","projects","work","calendar"].map((v)=>`<option value="${v}" ${s.defaultView===v?"selected":""}>${v}</option>`).join("")}
            </select>
          </div>
        </section>
        <section class="card panel-pad">
          <h3 class="panel-title">Görev varsayılanları</h3>
          <div class="field"><label>Varsayılan öncelik</label>
            <select id="sPri">${Warman.config.priorities.map((p)=>`<option value="${p.id}" ${s.defaultPriority===p.id?"selected":""}>${p.label}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Yeni görev tarihi</label>
            <select id="sDue">
              <option value="none" ${s.defaultDue==="none"?"selected":""}>Tarihsiz</option>
              <option value="today" ${s.defaultDue==="today"?"selected":""}>Bugün</option>
            </select>
          </div>
          <div class="field"><label>Haftanın ilk günü</label>
            <select id="sWeek">
              <option value="1" ${Number(s.weekStartsOn)===1?"selected":""}>Pazartesi</option>
              <option value="0" ${Number(s.weekStartsOn)===0?"selected":""}>Pazar</option>
            </select>
          </div>
        </section>
        <section class="card panel-pad">
          <h3 class="panel-title">İş takibi</h3>
          <div class="field"><label>Varsayılan çalışma yeri</label>
            <select id="sLoc">${Warman.config.locations.map((l)=>`<option ${s.defaultLocation===l?"selected":""}>${l}</option>`).join("")}</select>
          </div>
          <p class="work-help">Maaş, vardiya, mola ve fazla mesai katsayısını iş ve mesai bölümünden ay bazında ayarlayabilirsin.</p>
          <button class="btn work-spaced" id="openPayrollSettings">Maaş ve mesai hesabına git</button>
        </section>
        <section class="card panel-pad">
          <h3 class="panel-title">Bildirimler ve profil</h3>
          <label class="chip"><input type="checkbox" id="sNotif" ${s.notifications?"checked":""}> Tarayıcı hatırlatmaları (sayfa açıkken)</label>
          <p style="margin-top:10px;color:var(--text-muted);font-size:13px">${U().escapeHtml(user?.email || "")}</p>
          <button class="btn" id="exportAll">Veriyi JSON dışa aktar</button>
        </section>
        <section class="card panel-pad">
          <h3 class="panel-title">Kısayollar</h3>
          <div class="shortcut-list">
            <div><span>Komut paneli</span><kbd>Ctrl</kbd> + <kbd>K</kbd></div>
            <div><span>Hızlı görev</span><kbd>N</kbd></div>
            <div><span>Akışı kaydet</span><kbd>Ctrl</kbd> + <kbd>S</kbd></div>
            <div><span>Kapat</span><kbd>Esc</kbd></div>
          </div>
        </section>
      </div>
    `;
    const bind = (id, key, transform) => {
      view.querySelector(id).addEventListener("change", (e) => {
        const val = transform ? transform(e.target) : e.target.value;
        Warman.store.saveSettings({ [key]: val });
        Warman.ui.setThemeIcon();
        Warman.ui.toast("Ayar kaydedildi.");
      });
    };
    bind("#sTheme", "theme");
    bind("#sDensity", "density");
    bind("#sHome", "defaultView");
    bind("#sPri", "defaultPriority");
    bind("#sDue", "defaultDue");
    bind("#sWeek", "weekStartsOn", (el) => Number(el.value));
    bind("#sLoc", "defaultLocation");
    view.querySelector("#openPayrollSettings").onclick = () => Warman.router.go("work");
    view.querySelector("#sNotif").onchange = async (e) => {
      if (e.target.checked && "Notification" in window) {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          e.target.checked = false;
          return Warman.ui.toast("Bildirim izni verilmedi.");
        }
      }
      Warman.store.saveSettings({ notifications: e.target.checked });
    };
    view.querySelector("#exportAll").onclick = () => {
      const st = Warman.store.get();
      U().download("warman-backup.json", JSON.stringify({ projects: st.projects, tasks: st.tasks, work: st.work, settings: st.settings }, null, 2), "application/json");
    };
  }

  function renderWidgets(w) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal"><h3>Dashboard widget'ları</h3>
      ${Object.entries({ stats: "Özet kartlar", focus: "Günün öncelikleri", continuing: "Devam ettiğim işler", activity: "Etkinlik", progress: "İlerleme" }).map(([k,l]) =>
        `<label class="chip" style="display:flex;margin:6px 0"><input type="checkbox" data-w="${k}" ${w[k]!==false?"checked":""}> ${l}</label>`).join("")}
      <div class="modal-actions"><button class="btn btn-primary" data-ok>Kaydet</button></div></div>`;
    overlay.querySelector("[data-ok]").onclick = () => {
      const widgets = {};
      overlay.querySelectorAll("[data-w]").forEach((el) => widgets[el.dataset.w] = el.checked);
      Warman.store.saveSettings({ widgets });
      overlay.remove();
      Warman.router.refresh();
    };
    document.body.appendChild(overlay);
  }

  Warman.settings = { render, renderWidgets };
})();
