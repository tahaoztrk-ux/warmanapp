window.Warman = window.Warman || {};
(function () {
  const U = () => Warman.utils;
  const P = () => Warman.payroll;
  let archiveView = "active";
  let selectedMonth = "";
  let saving = false;
  const form = {
    date: "", attendance: "İşe geldim", overtime: "Mesai yapmadım",
    hours: "", location: "", description: "", editingId: null,
    holiday: "auto", unpaid: false
  };

  function monthOf(date) {
    const d = U().parseDotDate(date);
    return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";
  }

  function monthSettings(month) {
    const s = Warman.store.get().settings;
    return { ...P().defaults(Number(month.slice(0, 4))), ...(s.payrollMonths?.[month] || {}) };
  }

  function money(value) {
    return Number.isFinite(value) ? value.toLocaleString("tr-TR", { style: "currency", currency: "TRY" }) : "—";
  }

  function hoursText(value) {
    return (Number(value) || 0).toLocaleString("tr-TR", { useGrouping: false, maximumFractionDigits: 15 });
  }

  function filtered(allMonths) {
    const all = Warman.store.get().work;
    return all.filter((r) => (archiveView === "active" ? !r.archive_id : r.archive_id === archiveView)
      && (allMonths || monthOf(r.date) === selectedMonth));
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
    if (opts.archive && archiveView === "active" && archives()[0]) {
      archiveView = archives()[0];
      selectedMonth = filtered(true).map((r) => monthOf(r.date)).filter(Boolean).sort().pop() || "";
    }
    const s = Warman.store.get().settings;
    selectedMonth = selectedMonth || monthOf(U().todayStr());
    form.date = form.date || U().todayStr();
    form.location = form.location || s.defaultLocation || "Merkez";
    const ps = monthSettings(selectedMonth);
    const records = filtered();
    const summary = P().summarize(records, ps, selectedMonth);
    const st = { ...stats(summary.records), mesai: summary.overtimeHours };
    const holiday = P().holidayForDate(form.date);
    const holidayOverride = form.holiday === "auto" ? undefined : Number(form.holiday);
    const kind = P().dayKind(form.date, ps, holidayOverride);
    const specialWork = form.attendance === "İşe geldim" && kind.kind !== "weekday";
    view.innerHTML = `
      <div class="view-head">
        <div>
          <h1>${archiveView === "active" ? "İş ve mesai takibi" : "Arşiv: " + U().escapeHtml(archiveView)}</h1>
          <p>Günlük çalışmanı kaydet, aylık ücretini ve mesai karşılığını takip et.</p>
        </div>
        <div class="view-actions">
          <select id="archiveSelect" class="filter-select">
            <option value="active">Güncel dönem</option>
            ${archives().map((a) => `<option value="${U().escapeHtml(a)}" ${archiveView===a?"selected":""}>${U().escapeHtml(a)}</option>`).join("")}
          </select>
          <button class="btn" id="copyYest">Dünü kopyala</button>
          <button class="btn" id="exportExcel"><i class="ph ph-file-xls"></i> Excel</button>
          <button class="btn" id="showStats">Dönem detayı</button>
          <button class="btn btn-danger" id="closePeriod">Dönemi kapat</button>
        </div>
      </div>
      <div class="work-period-bar card">
        <div><strong>Maaş dönemi</strong><p>Özet ve kayıt listesi seçtiğin aya aittir.</p></div>
        <div class="work-month-nav"><button class="icon-btn" id="prevMonth" aria-label="Önceki ay"><i class="ph ph-caret-left"></i></button>
          <input type="month" id="salaryMonth" aria-label="Maaş dönemi" value="${selectedMonth}" min="2000-01" max="2100-12">
          <button class="icon-btn" id="nextMonth" aria-label="Sonraki ay"><i class="ph ph-caret-right"></i></button></div>
      </div>
      <div class="work-quick">
        <section class="card panel-pad">
          <h3 class="panel-title">${form.editingId ? "Günlük kaydı düzenle" : "Günlük çalışma kaydı"}${form.editingId ? '<button class="btn btn-sm" id="cancelEdit">Vazgeç</button>' : ""}</h3>
          <div class="field"><label for="wDate">Tarih</label><input id="wDate" value="${U().escapeHtml(form.date)}" placeholder="gg.aa.yyyy"></div>
          <p style="font-size:12px;color:var(--text-muted);margin:8px 0 6px">İşe gelme</p>
          <div class="choice-group">
            ${choice("attendance","İşe geldim","yes","İşe geldim")}
            ${choice("attendance","İzinliyim","leave","İzinliyim")}
            ${choice("attendance","Gelmedim","no","Gelmedim")}
          </div>
          <div class="field work-spaced"><label for="wHoliday">Resmi tatil</label>
            <select id="wHoliday">
              <option value="auto" ${form.holiday === "auto" ? "selected" : ""}>Takvimden belirle${holiday.fraction ? " · " + U().escapeHtml(holiday.name) : " · Normal gün"}</option>
              <option value="0" ${form.holiday === "0" ? "selected" : ""}>Normal gün</option>
              <option value="1" ${form.holiday === "1" ? "selected" : ""}>Resmi tatil · tam gün</option>
              <option value="0.5" ${form.holiday === "0.5" ? "selected" : ""}>Resmi tatil · yarım gün</option>
            </select>
          </div>
          <p class="work-help">Tatilde çalışırsan aylık ücrete ek 1 günlük ücret; yarım gün için ek ½ günlük ücret hesaplanır.</p>
          ${form.attendance === "İşe geldim" && kind.kind === "weekday" ? '<p class="work-help">Normal iş günü maaşı artırmaz; aylık asgari zaten tam görünür. Yalnız fazla mesai saatini yaz, tam günü tekrar yazma.</p>' : ""}
          ${form.attendance === "İzinliyim" ? `<label class="work-check"><input id="wUnpaid" type="checkbox" ${form.unpaid ? "checked" : ""}> Ücretsiz izin</label>` : ""}
          ${form.attendance === "Gelmedim" ? '<p class="work-help">Yalnızca gelinmedi kaydı aylık maaştan bir günlük ücret düşer. Hafta sonunu işaretlemezsen o gün düşülmez.</p>' : ""}
          ${specialWork ? `
          <p style="font-size:12px;color:var(--text-muted);margin:12px 0 6px">${U().escapeHtml(kind.label)}</p>
          <div class="field" id="hoursWrap">
            <label for="wHours">${kind.kind === "saturday" ? "Cumartesi günü geldin. Kaç saat çalıştın?" : kind.kind === "sunday" ? "Pazar günü geldin. Kaç saat çalıştın?" : U().escapeHtml(kind.label) + " günü geldin. Kaç saat çalıştın?"}</label>
            <input id="wHours" value="${U().escapeHtml(form.hours)}" placeholder="10" inputmode="decimal">
            <p class="work-help">${kind.kind === "saturday" ? "Bu saatlerin hepsi cumartesi mesaisidir (×" + hoursText(kind.overtimeMultiplier) + "). 10 saat durduysan yalnız 10 yaz; geldim + 10 saat diye 20 yazma." : "Bu saatlerin hepsi " + (kind.kind === "sunday" ? "pazar" : "tatil") + " mesaisidir (×" + hoursText(kind.overtimeMultiplier) + "). 10 saat durduysan yalnız 10 yaz."}${kind.kind === "holiday" ? " Ayrıca 1 günlük tatil eki maaşa eklenir." : ""} 1,5 veya 1:30 yazabilirsin.</p>
          </div>` : `
          <p style="font-size:12px;color:var(--text-muted);margin:12px 0 6px">Mesai</p>
          <div class="choice-group">
            ${choice("overtime","Mesai yok","no","Mesai yapmadım")}
            ${choice("overtime","Mesai var","yes","Mesai yaptım")}
          </div>
          <div class="field" id="hoursWrap" style="margin-top:10px;${form.overtime==="Mesai yaptım"?"":"display:none"}">
            <label for="wHours">Kaç saat fazla mesai yaptın?</label>
            <input id="wHours" value="${U().escapeHtml(form.hours)}" placeholder="1,5" inputmode="decimal">
            <p class="work-help">Yalnız fazla saatleri yaz. Tam gün zaten maaşa dahil. 1,5 veya 1:30 yazabilirsin.</p>
          </div>`}
          <p style="font-size:12px;color:var(--text-muted);margin:12px 0 6px">Çalışma yeri</p>
          <div class="choice-group">
            ${Warman.config.locations.map((l) => `<button class="choice ${form.location===l?"active info":""}" data-k="location" data-v="${U().escapeHtml(l)}">${U().escapeHtml(l)}</button>`).join("")}
          </div>
          <div class="field" style="margin-top:12px"><label>Açıklama (isteğe bağlı)</label><textarea id="wDesc">${U().escapeHtml(form.description)}</textarea></div>
          <button class="btn btn-primary" id="wSave" style="margin-top:12px" ${saving ? "disabled" : ""}>${saving ? "Kaydediliyor…" : "Kaydı kaydet"}</button>
          <p class="work-help">Aynı tarihi tekrar kaydetmek o günün kaydını değiştirir. Maaş kutusunu normal “geldim” günü değiştirmez.</p>
        </section>
        <section class="card panel-pad">
          <h3 class="panel-title">Aylık maaş özeti <span class="badge badge-planned">${summary.basis === "gross" ? "Brüt hesap" : "Net tahmin"}</span></h3>
          ${pocketCards(summary, true)}
          <div class="payroll-daily"><span>Bir tam günün ücreti <small>30 günlük ay</small></span><strong id="dailySalary">${money(summary.dailyRate)}</strong></div>
          <dl class="payroll-lines">
            <div><dt>Aylık temel asgari ücret <small>${money(summary.baseSalary)} / ${summary.salaryDays} gün</small></dt><dd>${money(summary.accruedBaseSalary)}</dd></div>
            <div><dt>Gelinmedi / ücretsiz izin <small>${summary.unpaidDays} gün × ${money(summary.dailyRate)}</small></dt><dd>− ${money(summary.accruedDeductions)}</dd></div>
            <div><dt>BES kesintisi <small>%${hoursText(summary.besRate)} · brüt ${money(summary.paidGross)}</small></dt><dd>− ${money(summary.accruedBesDeduction)}</dd></div>
            <div><dt>Resmi tatil eki</dt><dd class="payroll-positive">+ ${money(summary.accruedHolidayPay)}</dd></div>
          </dl>
          <div class="stat-grid">
            <article class="stat-card"><div class="k">Çalışılan gün</div><div class="v">${st.geldi}</div></article>
            <article class="stat-card"><div class="k">Mesai yapılan saat</div><div class="v">${hoursText(st.mesai)}</div></article>
            <article class="stat-card"><div class="k">İzinli gün</div><div class="v">${st.izinli}</div></article>
            <article class="stat-card"><div class="k">Gelinmeyen gün</div><div class="v">${st.gelmedi}</div></article>
          </div>
          <p class="work-help">Günlük temel ücret: ${money(summary.baseSalary)} / ${summary.salaryDays} gün = ${money(summary.dailyRate)}. Hafta içi ve cumartesi mesai saati: ${money(summary.hourlyRate * summary.overtimeMultiplier)} (×${hoursText(summary.overtimeMultiplier)}). Pazar ve resmi tatil: ${money(summary.hourlyRate * summary.restMultiplier)} (×${hoursText(summary.restMultiplier)}).</p>
          <p class="work-help">Maaş, mesai ve yol parası ayrı durur. BES, brüt asgari ücretin seçilen oranıdır; mesai ve yol parasına uygulanmaz. 17:30 gibi yazarsan saat:dakika okunur.</p>
          ${!records.length ? '<p class="work-notice">Bu ay henüz gelinmedi kaydı yok; maaş aylık asgaridir. Bir gün gelmezsen o günü gelinmedi olarak işaretle.</p>' : ""}
          ${summary.warnings.map((w) => `<p class="work-notice">${U().escapeHtml(w)}</p>`).join("")}
          <button class="btn work-spaced" id="salaryDetails"><i class="ph ph-receipt"></i> Hesap dökümünü aç</button>
          ${salarySettingsHtml(ps, summary)}
        </section>
      </div>
      <div class="card table-wrap" style="margin-top:16px">${table(records, summary)}</div>
    `;
    if (window.flatpickr) flatpickr("#wDate", { locale: "tr", dateFormat: "d.m.Y", defaultDate: form.date || new Date(), allowInput: true });
    view.querySelectorAll(".choice").forEach((b) => {
      b.onclick = () => {
        form[b.dataset.k] = b.dataset.v;
        render(view, opts);
      };
    });
    view.querySelector("#wDate").onchange = (e) => { form.date = e.target.value; render(view, opts); };
    view.querySelector("#wHoliday").onchange = (e) => { form.holiday = e.target.value; render(view, opts); };
    view.querySelector("#wUnpaid")?.addEventListener("change", (e) => form.unpaid = e.target.checked);
    view.querySelector("#wHours")?.addEventListener("input", (e) => form.hours = e.target.value);
    view.querySelector("#wDesc").oninput = (e) => form.description = e.target.value;
    view.querySelector("#wSave").onclick = () => save(view);
    view.querySelector("#archiveSelect").onchange = (e) => {
      archiveView = e.target.value;
      if (archiveView !== "active") selectedMonth = filtered(true).map((r) => monthOf(r.date)).filter(Boolean).sort().pop() || selectedMonth;
      resetForm(); render(view);
    };
    view.querySelector("#salaryMonth").onchange = (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { selectedMonth = e.target.value; render(view, opts); } };
    const moveMonth = (n) => {
      const d = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5)) - 1 + n, 1);
      selectedMonth = monthOf(U().toDotDate(d)); render(view, opts);
    };
    view.querySelector("#prevMonth").onclick = () => moveMonth(-1);
    view.querySelector("#nextMonth").onclick = () => moveMonth(1);
    view.querySelector("#copyYest").onclick = () => copyYesterday(view);
    view.querySelector("#exportExcel").onclick = openExportModal;
    view.querySelector("#showStats").onclick = () => showStats(st);
    view.querySelector("#salaryDetails").onclick = () => showStats(st);
    view.querySelector("#cancelEdit")?.addEventListener("click", () => { resetForm(); render(view, opts); });
    bindSalarySettings(view);
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

  function saveToast(detail) {
    if (detail.unpaidDays) return "Kayıt alındı. Maaştan 1 gün düşüldü.";
    if (detail.overtimePay && detail.holidayPay) return "Kayıt alındı. Mesai ve tatil eki ayrı eklendi.";
    if (detail.overtimePay) return "Kayıt alındı. Tutar Mesai kutusuna eklendi.";
    if (detail.holidayPay) return "Kayıt alındı. Tatil eki maaşa eklendi.";
    return "Kayıt alındı. Normal iş günü aylık maaşa zaten dahil; tutar artmaz.";
  }

  function pocketCards(summary, withIds) {
    return `<div class="payroll-pockets">
      <div class="payroll-total" aria-live="polite" aria-atomic="true"><span>Maaş</span><strong ${withIds ? 'id="salaryAccrued"' : ""}>${money(summary.salaryTotal)}</strong><small>Aylık asgari − gelinmedi − BES${summary.holidayPay ? " · tatil eki dahil" : ""}</small></div>
      <div class="payroll-total is-ot"><span>Mesai</span><strong ${withIds ? 'id="overtimeAccrued"' : ""}>${money(summary.overtimePay)}</strong><small>${hoursText(summary.overtimeHours)} saat · BES kesilmez</small></div>
      <div class="payroll-total is-travel"><span>Yol parası</span><strong ${withIds ? 'id="travelAccrued"' : ""}>${money(summary.travelPay)}</strong><small>Aylık · BES kesilmez</small></div>
      <div class="payroll-total is-sum"><span>Toplam</span><strong ${withIds ? 'id="combinedAccrued"' : ""}>${money(summary.combinedTotal)}</strong><small>Maaş + mesai + yol parası</small></div>
    </div>`;
  }

  function salarySettingsHtml(s, summary) {
    const bes = Number(s.payrollBesRate);
    const besChip = (value, label) => `<button type="button" class="chip ${bes === value ? "active" : ""}" data-bes="${value}">${label}</button>`;
    return `<details class="salary-settings"><summary>Maaş ve BES ayarları</summary>
      <p class="work-help">Ayarlar seçili ay için bu tarayıcıda saklanır. Önceki ayların hesabını değiştirmez.</p>
      <form id="salarySettingsForm" class="work-settings-fields">
        <div class="export-grid">
          <div class="field"><label for="payMode">Ücret türü</label><select id="payMode"><option value="minimum" ${s.payrollSalaryMode === "minimum" ? "selected" : ""}>Asgari ücret</option><option value="custom" ${s.payrollSalaryMode === "custom" ? "selected" : ""}>Kendi maaşım</option></select></div>
          <div class="field"><label for="payBasis">Hesap temeli</label><select id="payBasis"><option value="net" ${s.payrollSalaryBasis === "net" ? "selected" : ""}>Net · tahmini ödeme</option><option value="gross" ${s.payrollSalaryBasis === "gross" ? "selected" : ""}>Brüt · kesinti öncesi</option></select></div>
        </div>
        <div class="field"><label for="paySalary">Aylık ücret (₺)</label><input id="paySalary" inputmode="decimal" value="${U().escapeHtml(s.payrollSalaryMode === "custom" ? s.payrollMonthlySalary : summary.baseSalary ?? "")}" ${s.payrollSalaryMode === "minimum" ? "disabled" : "required"}></div>
        <div class="field"><label for="payTravel">Aylık yol parası (₺)</label><input id="payTravel" inputmode="decimal" value="${U().escapeHtml(s.payrollTravelPay)}" min="0" step="0.01" required></div>
        <div class="field"><label for="payBesRate">BES kesintisi (%)</label><input id="payBesRate" type="number" value="${U().escapeHtml(s.payrollBesRate)}" min="0" max="100" step="0.01" required></div>
        <div class="chip-row">${besChip(3, "%3")}${besChip(3.68, "%3,68")}${besChip(4, "%4")}</div>
        <p class="work-help">BES brüt asgari üzerinden hesaplanır. Bordrodaki oran 3 ise 957 ₺ civarı çıkar; 3,68 veya 4 de yazabilirsin. Mesai ve yol parasına kesilmez.</p>
        <div class="export-grid">
          <div class="field"><label for="payMultiplier">Hafta içi / cumartesi katsayısı</label><input id="payMultiplier" type="number" value="${U().escapeHtml(s.payrollOvertimeMultiplier)}" min="1.5" max="5" step="0.05" required></div>
          <div class="field"><label for="payRestMultiplier">Pazar / resmi tatil katsayısı</label><input id="payRestMultiplier" type="number" value="${U().escapeHtml(s.payrollRestMultiplier)}" min="1.5" max="5" step="0.05" required></div>
        </div>
        <button class="btn btn-primary" type="submit">Bu ayın ayarlarını kaydet</button>
      </form>
      <p class="work-help">Günlük ücret 30 günlük aya bölünür. Bir gün düşük maaş, yalnızca işaretlenen gelinmedi / ücretsiz izin içindir. Net tutarlar tahminidir; brüt seçeneğinde vergi ve SGK kesintileri düşülmez.</p>
    </details>`;
  }

  function bindSalarySettings(view) {
    const mode = view.querySelector("#payMode");
    const amount = view.querySelector("#paySalary");
    const update = () => {
      amount.disabled = mode.value === "minimum";
      amount.required = !amount.disabled;
      if (amount.disabled) {
        const s = { ...monthSettings(selectedMonth), payrollSalaryMode: "minimum", payrollSalaryBasis: view.querySelector("#payBasis").value };
        amount.value = P().rates(s, Number(selectedMonth.slice(0, 4))).baseSalary || "";
      }
    };
    mode.onchange = update;
    view.querySelector("#payBasis").onchange = update;
    const besInput = view.querySelector("#payBesRate");
    view.querySelectorAll("[data-bes]").forEach((chip) => {
      chip.onclick = () => {
        besInput.value = chip.dataset.bes;
        view.querySelectorAll("[data-bes]").forEach((other) => other.classList.toggle("active", other === chip));
      };
    });
    view.querySelector("#salarySettingsForm").onsubmit = (e) => {
      e.preventDefault();
      const num = (el) => Number(String(el.value).trim().replace(",", "."));
      const next = {
        payrollSalaryMode: mode.value,
        payrollSalaryBasis: view.querySelector("#payBasis").value,
        payrollMonthlySalary: num(amount),
        payrollTravelPay: num(view.querySelector("#payTravel")),
        payrollBesRate: num(besInput),
        payrollOvertimeMultiplier: num(view.querySelector("#payMultiplier")),
        payrollRestMultiplier: num(view.querySelector("#payRestMultiplier"))
      };
      if (!Number.isFinite(next.payrollBesRate) || next.payrollBesRate < 0 || next.payrollBesRate > 100 || !Number.isFinite(next.payrollTravelPay) || next.payrollTravelPay < 0 || !Number.isFinite(next.payrollOvertimeMultiplier) || next.payrollOvertimeMultiplier < 1.5 || !Number.isFinite(next.payrollRestMultiplier) || next.payrollRestMultiplier < 1.5 || (next.payrollSalaryMode === "custom" && (!Number.isFinite(next.payrollMonthlySalary) || next.payrollMonthlySalary <= 0))) {
        return Warman.ui.toast("Geçerli bir maaş, yol parası, BES oranı ve mesai katsayısı girin.", "error");
      }
      try {
        const s = Warman.store.get().settings;
        const prev = s.payrollMonths?.[selectedMonth] || {};
        Warman.store.saveSettings({ payrollMonths: { ...(s.payrollMonths || {}), [selectedMonth]: { ...prev, ...next } } });
        Warman.ui.toast("Bu ayın maaş ayarları kaydedildi.", "success");
        render(view);
      } catch (err) { Warman.ui.toast("Ayarlar kaydedilemedi: " + err.message, "error"); }
    };
  }

  function resetForm() {
    Object.assign(form, { date: U().todayStr(), attendance: "İşe geldim", overtime: "Mesai yapmadım", hours: "", description: "", editingId: null, holiday: "auto", unpaid: false });
  }

  function attSymbol(val) {
    if (val === "İşe geldim") return `<span class="track-sym yes" title="İşe geldim"><i class="ph-bold ph-check"></i></span>`;
    if (val === "İzinliyim") return `<span class="track-sym leave" title="İzinliyim"><i class="ph-bold ph-minus"></i></span>`;
    return `<span class="track-sym no" title="Gelmedim"><i class="ph-bold ph-x"></i></span>`;
  }

  function otSymbol(val, hours) {
    if (val === "Mesai yaptım") {
      const h = hours != null && hours !== "" ? hoursText(U().parseHours(hours)) : "";
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

  function table(records, summary) {
    if (!records.length) return `<p class="work-tracking-empty" style="padding:20px;color:var(--text-muted)">Bu dönemde kayıt yok.</p>`;
    const ordered = [...records].sort((a, b) => (U().parseDotDate(b.date) || 0) - (U().parseDotDate(a.date) || 0));
    let cur = "";
    let rows = "";
    ordered.forEach((r) => {
      const d = U().parseDotDate(r.date);
      const my = d ? `${U().MONTHS[d.getMonth()]} ${d.getFullYear()}` : "";
      if (my && my !== cur) {
        rows += `<tr class="month-sep"><td colspan="8">${U().escapeHtml(my)}</td></tr>`;
        cur = my;
      }
      const detail = summary?.details.find((d) => Number(d.record.id) === Number(r.id)) || P().recordDetails(r, monthSettings(monthOf(r.date)));
      rows += `<tr>
        <td>${U().escapeHtml(U().formatDetailedDate(r.date))}</td>
        <td>${attSymbol(r.attendance)}</td>
        <td>${money(detail.dailyBasePay)}</td>
        <td>${otSymbol(r.overtime, r.overtime_hours)}</td>
        <td>${detail.holidayFraction ? `<span class="badge badge-waiting">${detail.holidayFraction === 0.5 ? "Yarım gün" : "Resmi tatil"}</span><br><small>${U().escapeHtml(detail.holidayName)} · ×${hoursText(detail.overtimeMultiplier)}</small>` : `${U().escapeHtml(detail.dayLabel || "Hafta içi")}${detail.overtimeHours ? " · ×" + hoursText(detail.overtimeMultiplier) : ""}`}</td>
        <td><strong>${money(detail.netDailyPay)}</strong><br><small>${detail.unpaidDays ? "Aylık maaştan düşüldü" : "Mesai ve tatil eki"}</small></td>
        <td>${locSymbol(r.location)} ${r.description ? U().escapeHtml(r.description) : ""}</td>
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
    <table class="data work-table"><thead><tr><th>Tarih</th><th>Durum</th><th>Günlük temel ücret</th><th>Mesai saati</th><th>Gün türü</th><th>Günlük ek / kesinti</th><th>Yer / Not</th><th>İşlem</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  async function save(view) {
    if (saving) return;
    const date = (document.getElementById("wDate")?._flatpickr?.input?.value) || document.getElementById("wDate").value || form.date;
    const attendance = form.attendance;
    const holidayOverride = form.holiday === "auto" ? undefined : Number(form.holiday);
    const kind = P().dayKind(date, monthSettings(monthOf(date) || selectedMonth), holidayOverride);
    const specialWork = attendance === "İşe geldim" && kind.kind !== "weekday";
    const hoursInput = document.getElementById("wHours")?.value || "";
    let overtime = specialWork && hoursInput ? "Mesai yaptım" : (specialWork ? "Mesai yapmadım" : form.overtime);
    let hours = overtime === "Mesai yaptım" ? hoursInput : "";
    const location = form.location;
    const description = document.getElementById("wDesc").value.trim();
    if (!date || !attendance || !overtime || !location) return Warman.ui.toast("Tarih, gelme, mesai ve yer gerekli.");
    const parsedDate = U().parseDotDate(date);
    if (!parsedDate || U().toDotDate(parsedDate) !== date) return Warman.ui.toast("Geçerli bir tarih girin (gg.aa.yyyy).", "error");
    if (specialWork && (kind.kind === "saturday" || kind.kind === "sunday") && !hours) return Warman.ui.toast(kind.kind === "saturday" ? "Cumartesi kaç saat çalıştığını gir." : "Pazar kaç saat çalıştığını gir.");
    if (overtime === "Mesai yaptım" && !hours) return Warman.ui.toast("Mesai saatini girin.");
    const parsed = U().parseHours(hours);
    if (overtime === "Mesai yaptım" && (!/^(?:\d+(?:[.,]\d+)?|\d+:[0-5]\d)$/.test(hours.trim()) || !Number.isFinite(parsed) || parsed < 0)) return Warman.ui.toast("Sayısal bir saat girin. Örn: 1,5 veya 1:30", "error");
    const targetArchive = archiveView === "active" ? null : archiveView;
    const all = Warman.store.get().work;
    let record = all.find((r) => r.date === date && (r.archive_id || null) === targetArchive);
    if (form.editingId) record = all.find((r) => Number(r.id) === Number(form.editingId)) || record;
    if (form.editingId && all.some((r) => r.date === date && (r.archive_id || null) === targetArchive && Number(r.id) !== Number(form.editingId))) return Warman.ui.toast("Bu tarihte başka bir kayıt var. Önce o kaydı düzenleyin.", "error");
    const holiday = P().holidayForDate(date);
    const payroll = {
      holidayFraction: form.holiday === "auto" ? holiday.fraction : Number(form.holiday),
      holidayName: form.holiday === "auto" ? holiday.name : (form.holiday === "0" ? "" : "Resmi tatil (manuel)"),
      unpaid: attendance !== "İşe geldim" && form.unpaid,
      workedHours: specialWork ? String(parsed) : undefined
    };
    const payload = {
      id: record?.id || U().uid(),
      date, attendance, overtime,
      overtime_hours: overtime === "Mesai yaptım" ? String(parsed) : null,
      location, description, archive_id: targetArchive, payroll
    };
    saving = true;
    view.querySelector("#wSave").disabled = true;
    view.querySelector("#wSave").textContent = "Kaydediliyor…";
    try {
      const saved = await Warman.api.saveWork(payload);
      const latest = [...Warman.store.get().work];
      const idx = latest.findIndex((r) => Number(r.id) === Number(payload.id));
      if (idx >= 0) latest[idx] = { ...latest[idx], ...payload, ...saved };
      else latest.unshift({ ...payload, ...saved });
      Warman.store.set({ work: latest });
      selectedMonth = monthOf(date);
      const detail = P().recordDetails(payload, monthSettings(selectedMonth));
      resetForm();
      Warman.ui.toast(saveToast(detail), "success");
    } catch (err) {
      Warman.ui.toast("Kayıt başarısız: " + err.message, "error");
    } finally {
      saving = false;
      if (document.contains(view) && ["work", "archive"].includes(Warman.router.parse().name)) render(view);
    }
  }

  function loadEdit(id, view) {
    const r = Warman.store.get().work.find((x) => Number(x.id) === Number(id));
    if (!r) return;
    form.date = r.date;
    form.attendance = r.attendance;
    form.overtime = r.overtime;
    form.hours = r.overtime_hours ?? "";
    form.location = r.location;
    form.description = r.description || "";
    form.editingId = r.id;
    form.holiday = r.payroll?.holidayFraction != null ? String(r.payroll.holidayFraction) : "auto";
    form.unpaid = !!r.payroll?.unpaid;
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
    form.hours = r.overtime_hours ?? "";
    form.location = r.location;
    form.description = r.description || "";
    form.date = U().todayStr();
    form.editingId = null;
    form.holiday = "auto";
    form.unpaid = !!r.payroll?.unpaid;
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
    root.querySelector("#exCount").textContent = `${rec.length} kayıt · ${hoursText(hours)} saat mesai`;
    return rec;
  }

  function openExportModal() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal wide" role="dialog" aria-labelledby="exTitle">
      <h3 id="exTitle">Excel aktar</h3>
      <p>İndirme yalnızca tarih ve mesai saati sütunlarını içerir. İstersen tarih ve kategori filtreleriyle kayıtları seçebilirsin.</p>
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
    const header = ["Tarih", "Mesai saati"];
    const rows = ordered.map((r) => [r.date, r.overtime === "Mesai yaptım" ? U().parseHours(r.overtime_hours) : 0]);
    const stamp = U().todayStr().replace(/\./g, "-");
    if (kind === "csv") {
      const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
      U().download(`is-takibi-${stamp}.csv`, csv, "text/csv;charset=utf-8");
    } else {
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${header.map((h) => `<th>${U().escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${U().escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
      U().download(`is-takibi-${stamp}.xls`, html, "application/vnd.ms-excel");
    }
    Warman.ui.toast(`${ordered.length} kayıt indirildi.`, "success");
  }

  function showStats(st) {
    const summary = P().summarize(filtered(), monthSettings(selectedMonth), selectedMonth);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal payroll-modal" role="dialog" aria-modal="true" aria-labelledby="payrollTitle"><h3 id="payrollTitle">${U().MONTHS[summary.month - 1]} ${summary.year} · Maaş dökümü</h3>
      <p>${summary.basis === "gross" ? "Brüt maaş üzerinden kişisel takip hesabı; vergi ve SGK kesintileri düşülmez." : "Net maaş üzerinden tahmini ödeme hesabı."} Günlük temel ücret = aylık maaş / ${summary.salaryDays} gün. Maaş, mesai ve yol parası ayrı gösterilir.</p>
      ${pocketCards(summary, false)}
      <div class="payroll-daily"><span>Bir tam günün ücreti <small>30 günlük ay</small></span><strong>${money(summary.dailyRate)}</strong></div>
      <dl class="payroll-lines">
        <div><dt>Aylık temel asgari ücret</dt><dd>${money(summary.accruedBaseSalary)}</dd></div>
        <div><dt>Gelinmedi / ücretsiz izin · ${summary.unpaidDays} gün × ${money(summary.dailyRate)}</dt><dd>− ${money(summary.deductions)}</dd></div>
        <div><dt>BES kesintisi · %${hoursText(summary.besRate)} · brüt ${money(summary.paidGross)}</dt><dd>− ${money(summary.besDeduction)}</dd></div>
        <div><dt>Resmi tatil · ${hoursText(summary.holidayDays)} gün × ${money(summary.dailyRate)}</dt><dd>+ ${money(summary.holidayPay)}</dd></div>
        <div><dt>Mesai · ${hoursText(summary.overtimeHours)} saat · hafta içi/cumartesi ×${hoursText(summary.overtimeMultiplier)} · pazar/tatil ×${hoursText(summary.restMultiplier)}</dt><dd>+ ${money(summary.overtimePay)}</dd></div>
        <div><dt>Yol parası · aylık</dt><dd>+ ${money(summary.travelPay)}</dd></div>
        <div><dt>Toplam · maaş + mesai + yol</dt><dd>${money(summary.combinedTotal)}</dd></div>
      </dl>
      <div class="stat-grid">
        <div class="card stat-card"><div class="k">Çalışılan gün</div><div class="v">${st.geldi}</div></div>
        <div class="card stat-card"><div class="k">Mesai yapılan saat</div><div class="v">${hoursText(st.mesai)}</div></div>
        <div class="card stat-card"><div class="k">İzinli gün</div><div class="v">${st.izinli}</div></div>
        <div class="card stat-card"><div class="k">Gelinmeyen gün</div><div class="v">${st.gelmedi}</div></div>
      </div>
      <p class="work-help">Tablodaki günlük kazanç satırları mesai, tatil eki ve kesintidir; aylık taban zaten yukarıda. Kayıtsız gün ve hafta sonu maaştan düşülmez.</p>
      <div class="table-wrap work-spaced"><table class="data"><thead><tr><th>Tarih</th><th>Gün</th><th>Günlük temel ücret</th><th>Mesai saati</th><th>Mesai ücreti</th><th>Tatil ek ücreti</th><th>Ücretsiz / gelinmeyen</th><th>BES</th><th>Günlük ek / kesinti</th></tr></thead><tbody>
        ${summary.details.map((d) => `<tr><td>${U().escapeHtml(d.date)}</td><td>${U().escapeHtml(d.holidayName || d.record.attendance)}</td><td>${money(d.dailyBasePay)}</td><td>${hoursText(d.overtimeHours)}</td><td>${money(d.overtimePay)}</td><td>${money(d.holidayPay)}</td><td>${money(d.deduction)}</td><td>${money(d.besDeduction)}</td><td>${money(d.netDailyPay)}</td></tr>`).join("") || '<tr><td colspan="9">Bu ay henüz kayıt yok.</td></tr>'}
      </tbody></table></div>
      <p class="work-help">Resmi tatilde çalışılan güne ek 1 günlük ücret, yarım gün tatil seçimine ek ½ günlük ücret yazılır. Mesaiye girdiğin saat doğrudan kullanılır.</p>
      <p class="work-help">BES, brüt asgari ücretten gelinmedi düşüldükten sonra %${hoursText(summary.besRate)} olarak hesaplanır. Mesai ve yol parasına uygulanmaz. Oranı 3, 3,68 veya 4 yapabilirsin.</p>
      ${summary.warnings.map((w) => `<p class="work-notice">${U().escapeHtml(w)}</p>`).join("")}
      <p class="work-help">Kaynaklar: <a href="${P().sources.minimumWage}" target="_blank" rel="noopener noreferrer">ÇSGB asgari ücret</a> · <a href="${P().sources.bes}" target="_blank" rel="noopener noreferrer">EGM BES bilgisi</a> · <a href="${summary.year === 2025 ? P().sources.religious2025 : P().sources.religious2026}" target="_blank" rel="noopener noreferrer">Diyanet bayram takvimi</a></p>
      <div class="modal-actions" style="margin-top:16px"><button class="btn" data-payroll-csv>Maaş dökümü indir</button><button class="btn btn-primary" data-x>Kapat</button></div></div>`;
    overlay.querySelector("[data-x]").onclick = () => overlay.remove();
    overlay.querySelector("[data-payroll-csv]").onclick = () => {
      const rows = [
        ["Maaş dönemi", selectedMonth], ["Hesap temeli", summary.basis === "gross" ? "Brüt" : "Net tahmin"],
        ["Aylık maaş referansı", summary.baseSalary], ["Aylık temel asgari ücret", summary.accruedBaseSalary], ["Maaş (BES sonrası)", summary.salaryTotal],
        ["Mesai", summary.overtimePay], ["Yol parası", summary.travelPay], ["Toplam", summary.combinedTotal], ["Brüt BES matrahı", summary.paidGross],
        ["Tatil ek ücreti", summary.holidayPay], ["Ücretsiz / gelinmeyen gün", summary.deductions], ["BES kesintisi", summary.besDeduction], [],
        ["Kayıtlı gün", summary.recordedDays], ["Ücretli gün", summary.payableDays], ["Ayın gün sayısı", summary.daysInMonth], [],
        ["Tarih", "Durum", "Günlük temel ücret", "Mesai saati", "Mesai ücreti", "Tatil ek ücreti", "Ücretsiz / gelinmeyen", "BES", "Günlük ek / kesinti"],
        ...summary.details.map((d) => [d.date, d.holidayName || d.record.attendance, d.dailyBasePay, d.overtimeHours, d.overtimePay, d.holidayPay, d.deduction, d.besDeduction, d.netDailyPay])
      ];
      U().download(`maas-dokumu-${selectedMonth}.csv`, "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
    };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    overlay.querySelector("[data-x]").focus();
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") overlay.remove();
      if (e.key === "Tab") {
        const focusable = [...overlay.querySelectorAll("a,button")];
        if (e.shiftKey && document.activeElement === focusable[0]) { e.preventDefault(); focusable.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === focusable.at(-1)) { e.preventDefault(); focusable[0].focus(); }
      }
    });
  }

  function csvCell(value) {
    let text = typeof value === "number" ? String(value).replace(".", ",") : String(value ?? "");
    if (typeof value !== "number" && /^[=+\-@]/.test(text)) text = "'" + text;
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  async function closePeriod() {
    if (archiveView !== "active") return Warman.ui.toast("Sadece güncel dönem kapatılır.");
    const active = filtered();
    if (!active.length) return Warman.ui.toast("Kapatılacak kayıt yok.");
    const name = prompt("Bu ayın arşiv adı", `${U().MONTHS[Number(selectedMonth.slice(5)) - 1]} ${selectedMonth.slice(0, 4)}`);
    if (!name || !name.trim()) return;
    if (name.trim() === "active" || archives().includes(name.trim())) return Warman.ui.toast("Farklı bir arşiv adı seçin.", "error");
    if (!await Warman.ui.confirm({ title: "Dönemi kapat", message: `"${name}" olarak arşivlenecek.`, ok: "Kapat" })) return;
    try {
      const ids = new Set(active.map((r) => Number(r.id)));
      await Warman.api.patchWorkArchive(`archive_id=is.null&id=in.(${[...ids].join(",")})`, { archive_id: name.trim() });
      Warman.store.get().work.forEach((r) => { if (ids.has(Number(r.id))) r.archive_id = name.trim(); });
      Warman.store.set({ work: Warman.store.get().work });
      archiveView = "active";
      Warman.ui.toast("Dönem kapatıldı.", "success");
      Warman.router.refresh();
    } catch (err) { Warman.ui.toast("Arşivlenemedi: " + err.message, "error"); }
  }

  async function renameArchive() {
    const next = prompt("Yeni arşiv adı", archiveView);
    if (!next || !next.trim()) return;
    if (next.trim() === "active" || (next.trim() !== archiveView && archives().includes(next.trim()))) return Warman.ui.toast("Bu ad kullanılıyor. Farklı bir arşiv adı seçin.", "error");
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

  Warman.work = { render, stats, matchExport, parseHours: (v) => U().parseHours(v) };
})();
