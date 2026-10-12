window.Warman = window.Warman || {};
(function () {
  const U = () => Warman.utils;
  let archiveView = "active";
  const form = {
    date: "", attendance: "İşe geldim", overtime: "Mesai yapmadım",
    hours: "", location: "", description: "", editingId: null
  };

  function filtered() {
    const all = Warman.store.get().work;
    return all.filter((r) => archiveView === "active" ? !r.archive_id : r.archive_id === archiveView);
  }

  function archives() {
    return [...new Set(Warman.store.get().work.map((r) => r.archive_id).filter(Boolean))];
  }

  function stats(records) {
    let geldi = 0, gelmedi = 0, izinli = 0, mesai = 0;
    const loc = {};
    records.forEach((r) => {
      if (r.attendance === "İşe geldim") geldi++;
      if (r.attendance === "Gelmedim") gelmedi++;
      if (r.attendance === "İzinliyim") izinli++;
      if (r.overtime === "Mesai yaptım") mesai += U().parseHours(r.overtime_hours);
      loc[r.location] = (loc[r.location] || 0) + 1;
    });
    return { geldi, gelmedi, izinli, mesai, loc, days: records.length };
  }

  function render(view, opts) {
    opts = opts || {};
    if (opts.archive) archiveView = archiveView === "active" && archives()[0] ? archives()[0] : archiveView;
    const s = Warman.store.get().settings;
    form.date = form.date || U().todayStr();
    form.location = form.location || s.defaultLocation || "Merkez";
    const records = filtered();
    const st = stats(records);
    view.innerHTML = `
      <div class="view-head">
        <div>
          <h1>${archiveView === "active" ? "İş ve mesai takibi" : "Arşiv: " + U().escapeHtml(archiveView)}</h1>
          <p>Görev planlamasından ayrıdır. Tarih varsayılan olarak bugündür.</p>
        </div>
        <div class="view-actions">
          <select id="archiveSelect" class="filter-select">
            <option value="active">Güncel dönem</option>
            ${archives().map((a) => `<option value="${U().escapeHtml(a)}" ${archiveView===a?"selected":""}>${U().escapeHtml(a)}</option>`).join("")}
          </select>
          <button class="btn" id="copyYest">Dünü kopyala</button>
          <button class="btn" id="exportExcel"><i class="ph ph-file-xls"></i> Excel</button>
          <button class="btn" id="showStats">İstatistik</button>
          <button class="btn btn-danger" id="closePeriod">Dönemi kapat</button>
        </div>
      </div>
      <div class="work-quick">
        <section class="card panel-pad">
          <h3 class="panel-title">Hızlı günlük kayıt</h3>
          <div class="field"><label>Tarih</label><input id="wDate" value="${U().escapeHtml(form.date)}"></div>
          <p style="font-size:12px;color:var(--text-muted);margin:8px 0 6px">İşe gelme</p>
          <div class="choice-group">
            ${choice("attendance","İşe geldim","yes","İşe geldim")}
            ${choice("attendance","İzinliyim","leave","İzinliyim")}
            ${choice("attendance","Gelmedim","no","Gelmedim")}
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin:12px 0 6px">Mesai</p>
          <div class="choice-group">
            ${choice("overtime","Mesai yok","no","Mesai yapmadım")}
            ${choice("overtime","Mesai var","yes","Mesai yaptım")}
          </div>
          <div class="field" id="hoursWrap" style="margin-top:10px;${form.overtime==="Mesai yaptım"?"":"display:none"}">
            <label>Kaç saat? (1,5 veya 1:30)</label>
            <input id="wHours" value="${U().escapeHtml(form.hours)}" placeholder="1,5">
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin:12px 0 6px">Çalışma yeri</p>
          <div class="choice-group">
            ${Warman.config.locations.map((l) => `<button class="choice ${form.location===l?"active info":""}" data-k="location" data-v="${U().escapeHtml(l)}">${U().escapeHtml(l)}</button>`).join("")}
          </div>
          <div class="field" style="margin-top:12px"><label>Açıklama (isteğe bağlı)</label><textarea id="wDesc">${U().escapeHtml(form.description)}</textarea></div>
          <button class="btn btn-primary" id="wSave" style="margin-top:12px">Kaydı kaydet</button>
        </section>
        <section class="card panel-pad">
          <h3 class="panel-title">Dönem özeti</h3>
          <div class="stat-grid">
            <article class="stat-card"><div class="k">Çalışılan</div><div class="v">${st.geldi}</div></article>
            <article class="stat-card"><div class="k">Mesai</div><div class="v">${U().formatHours(st.mesai)}</div></article>
            <article class="stat-card"><div class="k">İzinli</div><div class="v">${st.izinli}</div></article>
            <article class="stat-card"><div class="k">Gelmedi</div><div class="v">${st.gelmedi}</div></article>
          </div>
          ${s.hourlyRate ? `<p style="margin-top:12px;font-size:12px;color:var(--text-muted)">Tahmini mesai ücreti (ayarlarınıza göre, kesin maaş değildir): ${estimatePay(st.mesai, s)} ₺</p>` : ""}
        </section>
      </div>
      <div class="card table-wrap" style="margin-top:16px">${table(records)}</div>
    `;
    if (window.flatpickr) flatpickr("#wDate", { locale: "tr", dateFormat: "d.m.Y", defaultDate: form.date || new Date(), allowInput: true });
    view.querySelectorAll(".choice").forEach((b) => {
      b.onclick = () => {
        form[b.dataset.k] = b.dataset.v;
        render(view, opts);
      };
    });
    view.querySelector("#wDate").onchange = (e) => form.date = e.target.value;
    view.querySelector("#wHours")?.addEventListener("input", (e) => form.hours = e.target.value);
    view.querySelector("#wDesc").oninput = (e) => form.description = e.target.value;
    view.querySelector("#wSave").onclick = () => save(view);
    view.querySelector("#archiveSelect").onchange = (e) => { archiveView = e.target.value; render(view, opts); };
    view.querySelector("#copyYest").onclick = () => copyYesterday(view);
    view.querySelector("#exportExcel").onclick = openExportModal;
    view.querySelector("#showStats").onclick = () => showStats(st);
    view.querySelector("#closePeriod").onclick = closePeriod;
    view.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => loadEdit(b.dataset.edit, view));
    view.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => del(b.dataset.del, view));
    if (archiveView !== "active") {
      const extra = document.createElement("div");
      extra.className = "view-actions";
      extra.style.marginTop = "10px";
      extra.innerHTML = `<button class="btn" id="renameArc">Arşiv adını düzenle</button><button class="btn" id="reopenArc">Dönemi geri aç</button>`;
      view.querySelector(".view-head").appendChild(extra);
      extra.querySelector("#renameArc").onclick = renameArchive;
      extra.querySelector("#reopenArc").onclick = reopenArchive;
    }
  }

  function choice(k, label, cls, v) {
    const active = form[k] === v ? `active ${cls}` : "";
    return `<button class="choice ${active}" data-k="${k}" data-v="${U().escapeHtml(v)}">${U().escapeHtml(label)}</button>`;
  }

  function attSymbol(val) {
    if (val === "İşe geldim") return `<span class="track-sym yes" title="İşe geldim"><i class="ph-bold ph-check"></i></span>`;
    if (val === "İzinliyim") return `<span class="track-sym leave" title="İzinliyim"><i class="ph-bold ph-minus"></i></span>`;
    return `<span class="track-sym no" title="Gelmedim"><i class="ph-bold ph-x"></i></span>`;
  }

  function otSymbol(val, hours) {
    if (val === "Mesai yaptım") {
      const h = hours ? U().formatHours(U().parseHours(hours)) : "";
      return `<span class="track-sym yes hours" title="Mesai yaptım${h ? " · " + h + " saat" : ""}"><i class="ph-bold ph-check"></i>${h ? U().escapeHtml(h) : ""}</span>`;
    }
    return `<span class="track-sym no" title="Mesai yapmadım"><i class="ph-bold ph-x"></i></span>`;
  }

  function locSymbol(val) {
    const map = {
      Merkez: { icon: "ph-buildings", title: "Merkez" },
      İvedik: { icon: "ph-factory", title: "İvedik" },
      Saha: { icon: "ph-hard-hat", title: "Saha" },
      Uzaktan: { icon: "ph-house", title: "Uzaktan" }
    };
    const m = map[val] || { icon: "ph-map-pin", title: val || "Konum yok" };
    return `<span class="track-loc" title="${U().escapeHtml(m.title)}"><i class="ph ${m.icon}"></i></span>`;
  }

  function table(records) {
    if (!records.length) return `<p class="work-tracking-empty" style="padding:20px;color:var(--text-muted)">Bu dönemde kayıt yok.</p>`;
    const ordered = [...records].sort((a, b) => (U().parseDotDate(b.date) || 0) - (U().parseDotDate(a.date) || 0));
    let cur = "";
    let rows = "";
    ordered.forEach((r) => {
      const d = U().parseDotDate(r.date);
      const my = d ? `${U().MONTHS[d.getMonth()]} ${d.getFullYear()}` : "";
      if (my && my !== cur) {
        rows += `<tr class="month-sep"><td colspan="6">${U().escapeHtml(my)}</td></tr>`;
        cur = my;
      }
      rows += `<tr>
        <td>${U().escapeHtml(U().formatDetailedDate(r.date))}</td>
        <td>${attSymbol(r.attendance)}</td>
        <td>${otSymbol(r.overtime, r.overtime_hours)}</td>
        <td>${locSymbol(r.location)}</td>
        <td>${r.description ? U().escapeHtml(r.description) : "—"}</td>
        <td>
          <button class="icon-btn" data-edit="${r.id}" title="Düzenle"><i class="ph ph-pencil-simple"></i></button>
          <button class="icon-btn" data-del="${r.id}" title="Sil"><i class="ph ph-trash"></i></button>
        </td>
      </tr>`;
    });
    return `<div class="work-legend">
      <span>${attSymbol("İşe geldim")} Geldim</span>
      <span>${attSymbol("İzinliyim")} İzin</span>
      <span>${attSymbol("Gelmedim")} Gelmedim</span>
      <span>${otSymbol("Mesai yaptım", 1)} Mesai</span>
      <span>${otSymbol("Mesai yapmadım")} Mesai yok</span>
      <span>${locSymbol("Merkez")} Merkez</span>
      <span>${locSymbol("İvedik")} İvedik</span>
      <span>${locSymbol("Saha")} Saha</span>
      <span>${locSymbol("Uzaktan")} Uzaktan</span>
    </div>
    <table class="data"><thead><tr><th>Tarih</th><th>Gelme</th><th>Mesai</th><th>Yer</th><th>Not</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  async function save(view) {
    const date = (document.getElementById("wDate")?._flatpickr?.input?.value) || document.getElementById("wDate").value || form.date;
    const attendance = form.attendance;
    const overtime = form.overtime;
    let hours = overtime === "Mesai yaptım" ? document.getElementById("wHours").value : "";
    const location = form.location;
    const description = document.getElementById("wDesc").value.trim();
    if (!date || !attendance || !overtime || !location) return Warman.ui.toast("Tarih, gelme, mesai ve yer gerekli.");
    if (overtime === "Mesai yaptım" && !hours) return Warman.ui.toast("Mesai saatini girin.");
    const parsed = U().parseHours(hours);
    if (overtime === "Mesai yaptım" && parsed <= 0) return Warman.ui.toast("Geçerli bir saat girin. Örn: 1,5");
    const targetArchive = archiveView === "active" ? null : archiveView;
    const all = Warman.store.get().work;
    let record = all.find((r) => r.date === date && (r.archive_id || null) === targetArchive);
    if (form.editingId) record = all.find((r) => Number(r.id) === Number(form.editingId)) || record;
    const payload = {
      id: record?.id || U().uid(),
      date, attendance, overtime,
      overtime_hours: overtime === "Mesai yaptım" ? String(parsed) : null,
      location, description, archive_id: targetArchive
    };
    try {
      const saved = await Warman.api.saveWork(payload);
      const idx = all.findIndex((r) => Number(r.id) === Number(payload.id));
      if (idx >= 0) all[idx] = { ...all[idx], ...payload, ...saved };
      else all.unshift({ ...payload, ...saved });
      Warman.store.set({ work: all });
      form.description = ""; form.hours = ""; form.editingId = null;
      Warman.ui.toast("İş kaydı kaydedildi.", "success");
      render(view);
    } catch (err) {
      Warman.ui.toast("Kayıt başarısız: " + err.message, "error");
    }
  }

  function loadEdit(id, view) {
    const r = Warman.store.get().work.find((x) => Number(x.id) === Number(id));
    if (!r) return;
    form.date = r.date;
    form.attendance = r.attendance;
    form.overtime = r.overtime;
    form.hours = r.overtime_hours || "";
    form.location = r.location;
    form.description = r.description || "";
    form.editingId = r.id;
    render(view);
  }

  async function del(id, view) {
    const r = Warman.store.get().work.find((x) => Number(x.id) === Number(id));
    if (!r) return;
    if (!await Warman.ui.confirm({ title: "Kaydı sil", message: U().formatDetailedDate(r.date), danger: true, ok: "Sil" })) return;
    const copy = { ...r };
    try {
      await Warman.api.deleteWork(id);
      Warman.store.set({ work: Warman.store.get().work.filter((x) => Number(x.id) !== Number(id)) });
      Warman.ui.offerUndo("Kayıt silindi.", async () => {
        await Warman.api.saveWork(copy);
        Warman.store.get().work.unshift(copy);
        Warman.store.set({ work: Warman.store.get().work });
        Warman.router.refresh();
      });
      render(view);
    } catch (err) { Warman.ui.toast("Silinemedi: " + err.message, "error"); }
  }

  function copyYesterday(view) {
    const y = U().toDotDate(U().addDays(new Date(), -1));
    const r = Warman.store.get().work.find((x) => x.date === y);
    if (!r) return Warman.ui.toast("Dünün kaydı yok.");
    form.attendance = r.attendance;
    form.overtime = r.overtime;
    form.hours = r.overtime_hours || "";
    form.location = r.location;
    form.description = r.description || "";
    form.date = U().todayStr();
    render(view);
    Warman.ui.toast("Dünün ayarları yüklendi. Kaydetmeyi unutmayın.");
  }

  function matchExport(record, f) {
    const d = U().parseDotDate(record.date);
    const from = U().parseDotDate(f.from);
    const to = U().parseDotDate(f.to);
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    if (f.attendance && record.attendance !== f.attendance) return false;
    if (f.overtime === "yes" && record.overtime !== "Mesai yaptım") return false;
    if (f.overtime === "no" && record.overtime === "Mesai yaptım") return false;
    if (Array.isArray(f.locations) && !f.locations.includes(record.location)) return false;
    if (f.period === "active" && record.archive_id) return false;
    if (f.period === "current" && archiveView === "active" && record.archive_id) return false;
    if (f.period === "current" && archiveView !== "active" && record.archive_id !== archiveView) return false;
    if (f.period && f.period !== "all" && f.period !== "active" && f.period !== "current" && record.archive_id !== f.period) return false;
    return true;
  }

  function exportSource(period) {
    const all = Warman.store.get().work;
    if (period === "all") return all;
    if (period === "active") return all.filter((r) => !r.archive_id);
    if (period === "current" || !period) return filtered();
    return all.filter((r) => r.archive_id === period);
  }

  function readExportFilters(root) {
    const locations = [...root.querySelectorAll("[data-loc]:checked")].map((el) => el.value);
    return {
      from: root.querySelector("#exFrom").value.trim(),
      to: root.querySelector("#exTo").value.trim(),
      attendance: root.querySelector("#exAtt").value,
      overtime: root.querySelector("#exOt").value,
      period: root.querySelector("#exPeriod").value,
      locations
    };
  }

  function applyExport(root) {
    const f = readExportFilters(root);
    const rec = exportSource(f.period).filter((r) => matchExport(r, { ...f, period: "all" }));
    const hours = rec.reduce((s, r) => s + (r.overtime === "Mesai yaptım" ? U().parseHours(r.overtime_hours) : 0), 0);
    root.querySelector("#exCount").textContent = `${rec.length} kayıt · ${U().formatHours(hours)} saat mesai`;
    return rec;
  }

  function openExportModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal wide" role="dialog" aria-labelledby="exTitle">
      <h3 id="exTitle">Excel aktar</h3>
      <p>Kategori ve tarih seçin; yalnızca eşleşen satırlar iner. Excel’de süzmek için metin kolonları da vardır.</p>
      <div class="chip-row" style="margin-bottom:12px">
        <button type="button" class="chip" data-preset="all">Tümü</button>
        <button type="button" class="chip" data-preset="ot">Sadece mesailer</button>
        <button type="button" class="chip" data-preset="came">İşe gelinenler</button>
        <button type="button" class="chip" data-preset="leave">İzinler</button>
        <button type="button" class="chip" data-preset="absent">Gelinmeyenler</button>
      </div>
      <div class="export-grid">
        <div class="field"><label>Başlangıç tarihi</label><input id="exFrom" placeholder="gg.aa.yyyy"></div>
        <div class="field"><label>Bitiş tarihi</label><input id="exTo" placeholder="gg.aa.yyyy"></div>
        <div class="field"><label>Gelme durumu</label>
          <select id="exAtt">
            <option value="">Hepsi</option>
            <option value="İşe geldim">İşe geldim</option>
            <option value="İzinliyim">İzinliyim</option>
            <option value="Gelmedim">Gelmedim</option>
          </select>
        </div>
        <div class="field"><label>Mesai</label>
          <select id="exOt">
            <option value="">Hepsi</option>
            <option value="yes">Sadece mesai yapılan günler</option>
            <option value="no">Mesai olmayan günler</option>
          </select>
        </div>
        <div class="field"><label>Dönem</label>
          <select id="exPeriod">
            <option value="current">Ekrandaki dönem</option>
            <option value="active">Güncel dönem</option>
            <option value="all">Tüm kayıtlar (arşiv dahil)</option>
            ${archives().map((a) => `<option value="${U().escapeHtml(a)}">${U().escapeHtml(a)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Çalışma yeri</label>
          <div class="chip-row" style="padding-top:6px">
            ${Warman.config.locations.map((l) => `<label class="chip"><input type="checkbox" data-loc value="${U().escapeHtml(l)}" checked> ${U().escapeHtml(l)}</label>`).join("")}
          </div>
        </div>
      </div>
      <div class="export-count" id="exCount">0 kayıt</div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn" data-cancel>Vazgeç</button>
        <button class="btn" data-csv>CSV</button>
        <button class="btn btn-primary" data-xls>Excel indir</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    if (window.flatpickr) {
      const fp = { locale: "tr", dateFormat: "d.m.Y", allowInput: true, allowInvalidPreload: true };
      flatpickr(overlay.querySelector("#exFrom"), fp);
      flatpickr(overlay.querySelector("#exTo"), fp);
    }
    const refresh = () => applyExport(overlay);
    overlay.querySelectorAll("select, input").forEach((el) => el.addEventListener("change", refresh));
    overlay.querySelectorAll("#exFrom, #exTo").forEach((el) => el.addEventListener("input", refresh));
    overlay.querySelectorAll("[data-preset]").forEach((b) => {
      b.onclick = () => {
        overlay.querySelector("#exAtt").value = "";
        overlay.querySelector("#exOt").value = "";
        const p = b.dataset.preset;
        if (p === "ot") overlay.querySelector("#exOt").value = "yes";
        if (p === "came") overlay.querySelector("#exAtt").value = "İşe geldim";
        if (p === "leave") overlay.querySelector("#exAtt").value = "İzinliyim";
        if (p === "absent") overlay.querySelector("#exAtt").value = "Gelmedim";
        overlay.querySelectorAll("[data-preset]").forEach((x) => x.classList.toggle("active", x === b));
        refresh();
      };
    });
    refresh();
    overlay.querySelector("[data-cancel]").onclick = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector("[data-csv]").onclick = () => { downloadExport(applyExport(overlay), "csv"); overlay.remove(); };
    overlay.querySelector("[data-xls]").onclick = () => { downloadExport(applyExport(overlay), "xls"); overlay.remove(); };
  }

  function downloadExport(records, kind) {
    if (!records.length) return Warman.ui.toast("Bu filtrelere uyan kayıt yok.");
    const ordered = [...records].sort((a, b) => (U().parseDotDate(a.date) || 0) - (U().parseDotDate(b.date) || 0));
    const attMark = (v) => v === "İşe geldim" ? "✓" : v === "İzinliyim" ? "−" : "✕";
    const otMark = (v) => v === "Mesai yaptım" ? "✓" : "✕";
    const locMark = (v) => ({ Merkez: "🏢", İvedik: "🏭", Saha: "🦺", Uzaktan: "🏠" }[v] || "");
    const header = ["Tarih", "Gelme", "Gelme (kategori)", "Mesai", "Mesai (kategori)", "Mesai saati", "Yer", "Yer (kategori)", "Açıklama", "Arşiv"];
    const rows = ordered.map((r) => [
      r.date,
      attMark(r.attendance),
      r.attendance || "",
      otMark(r.overtime),
      r.overtime || "",
      r.overtime === "Mesai yaptım" ? String(U().parseHours(r.overtime_hours)).replace(".", ",") : "",
      locMark(r.location),
      r.location || "",
      r.description || "",
      r.archive_id || "Güncel"
    ]);
    const stamp = U().todayStr().replace(/\./g, "-");
    if (kind === "csv") {
      const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(U().csvEscape).join(";")).join("\r\n");
      U().download(`is-takibi-${stamp}.csv`, csv, "text/csv;charset=utf-8");
    } else {
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${header.map((h) => `<th>${U().escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${U().escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
      U().download(`is-takibi-${stamp}.xls`, html, "application/vnd.ms-excel");
    }
    Warman.ui.toast(`${ordered.length} kayıt indirildi.`, "success");
  }

  function showStats(st) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal"><h3>Dönem istatistikleri</h3>
      <div class="stat-grid">
        <div class="card stat-card"><div class="k">İşe geldi</div><div class="v">${st.geldi}</div></div>
        <div class="card stat-card"><div class="k">Mesai saati</div><div class="v">${U().formatHours(st.mesai)}</div></div>
        <div class="card stat-card"><div class="k">İzinli</div><div class="v">${st.izinli}</div></div>
        <div class="card stat-card"><div class="k">Gelmedi</div><div class="v">${st.gelmedi}</div></div>
      </div>
      <div class="modal-actions" style="margin-top:16px"><button class="btn btn-primary" data-x>Kapat</button></div></div>`;
    overlay.querySelector("[data-x]").onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }

  async function closePeriod() {
    if (archiveView !== "active") return Warman.ui.toast("Sadece güncel dönem kapatılır.");
    const active = Warman.store.get().work.filter((r) => !r.archive_id);
    if (!active.length) return Warman.ui.toast("Kapatılacak kayıt yok.");
    const name = prompt("Arşiv adı (ör. Ekim 2026)");
    if (!name || !name.trim()) return;
    if (!await Warman.ui.confirm({ title: "Dönemi kapat", message: `"${name}" olarak arşivlenecek.`, ok: "Kapat" })) return;
    try {
      await Warman.api.patchWorkArchive("archive_id=is.null", { archive_id: name.trim() });
      Warman.store.get().work.forEach((r) => { if (!r.archive_id) r.archive_id = name.trim(); });
      Warman.store.set({ work: Warman.store.get().work });
      archiveView = "active";
      Warman.ui.toast("Dönem kapatıldı.", "success");
      Warman.router.refresh();
    } catch (err) { Warman.ui.toast("Arşivlenemedi: " + err.message, "error"); }
  }

  async function renameArchive() {
    const next = prompt("Yeni arşiv adı", archiveView);
    if (!next || !next.trim()) return;
    try {
      await Warman.api.patchWorkArchive(`archive_id=eq.${encodeURIComponent('"' + archiveView + '"')}`, { archive_id: next.trim() });
      Warman.store.get().work.forEach((r) => { if (r.archive_id === archiveView) r.archive_id = next.trim(); });
      archiveView = next.trim();
      Warman.store.set({ work: Warman.store.get().work });
      Warman.router.refresh();
    } catch (err) { Warman.ui.toast("Ad değiştirilemedi: " + err.message, "error"); }
  }

  async function reopenArchive() {
    if (!await Warman.ui.confirm({ title: "Dönemi geri aç", message: "Kayıtlar güncel döneme taşınır.", ok: "Geri aç" })) return;
    try {
      await Warman.api.patchWorkArchive(`archive_id=eq.${encodeURIComponent('"' + archiveView + '"')}`, { archive_id: null });
      Warman.store.get().work.forEach((r) => { if (r.archive_id === archiveView) r.archive_id = null; });
      archiveView = "active";
      Warman.store.set({ work: Warman.store.get().work });
      Warman.router.refresh();
    } catch (err) { Warman.ui.toast("Açılamadı: " + err.message, "error"); }
  }

  function estimatePay(hours, s) {
    const rate = U().parseHours(s.hourlyRate);
    const ot = U().parseHours(s.overtimeRate) || 1;
    return U().formatHours(hours * rate * ot);
  }

  Warman.work = { render, stats, matchExport, parseHours: (v) => U().parseHours(v) };
})();
