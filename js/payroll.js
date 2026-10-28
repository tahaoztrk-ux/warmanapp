window.Warman = window.Warman || {};
(function () {
  // Standard monthly wage estimate for a 45-hour working week. Net mode is an
  // estimate: actual payroll deductions depend on the employee's tax position.
  const WAGES = {
    2025: { net: 22104.67, gross: 26005.50 },
    2026: { net: 28075.50, gross: 33030.00 }
  };
  const SOURCES = {
    minimumWage: "https://www.csgb.gov.tr/poco-pages/asgari-ucret",
    historicalWage: "https://www.csgb.gov.tr/yayinlar/calisma-hayati-istatistikleri-e-bulteni/ekim-2026/ucret-ve-sendikal-istatistikler.html",
    workRules: "https://www.csgb.gov.tr/sikca-sorulan-sorular/calisma-genel-mudurlugu/%C4%B1s-kanunu/",
    holidays: "https://www.csgb.gov.tr/Media/llifj34w/dinlenme-hakk%C4%B1-ve-s%C3%BCreleri_22_02_2026-1.pdf",
    religious2025: "https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=152",
    religious2026: "https://vakithesaplama.diyanet.gov.tr/icerik.php?icerik=153",
    hourlyCalculation: "https://www.csgb.gov.tr/Media/pbloor0b/i%C5%9F-kanunlar%C4%B1-ve-t%C3%BCrk-bor%C3%A7lar-kanuna-g%C3%B6re-s%C3%B6zle%C5%9Fme-t%C3%BCrleri.pdf"
  };
  const FIXED_HOLIDAYS = {
    "01-01": [1, "Yılbaşı"],
    "04-23": [1, "Ulusal Egemenlik ve Çocuk Bayramı"],
    "05-01": [1, "Emek ve Dayanışma Günü"],
    "05-19": [1, "Atatürk'ü Anma, Gençlik ve Spor Bayramı"],
    "07-15": [1, "Demokrasi ve Millî Birlik Günü"],
    "08-30": [1, "Zafer Bayramı"],
    "10-28": [0.5, "Cumhuriyet Bayramı arifesi (13.00 sonrası)"],
    "10-29": [1, "Cumhuriyet Bayramı"]
  };
  const RELIGIOUS_HOLIDAYS = {
    2025: {
      "03-29": [0.5, "Ramazan Bayramı arifesi (13.00 sonrası)"],
      "03-30": [1, "Ramazan Bayramı"], "03-31": [1, "Ramazan Bayramı"], "04-01": [1, "Ramazan Bayramı"],
      "06-05": [0.5, "Kurban Bayramı arifesi (13.00 sonrası)"],
      "06-06": [1, "Kurban Bayramı"], "06-07": [1, "Kurban Bayramı"],
      "06-08": [1, "Kurban Bayramı"], "06-09": [1, "Kurban Bayramı"]
    },
    2026: {
      "03-19": [0.5, "Ramazan Bayramı arifesi (13.00 sonrası)"],
      "03-20": [1, "Ramazan Bayramı"], "03-21": [1, "Ramazan Bayramı"], "03-22": [1, "Ramazan Bayramı"],
      "05-26": [0.5, "Kurban Bayramı arifesi (13.00 sonrası)"],
      "05-27": [1, "Kurban Bayramı"], "05-28": [1, "Kurban Bayramı"],
      "05-29": [1, "Kurban Bayramı"], "05-30": [1, "Kurban Bayramı"]
    }
  };

  function numeric(value, fallback) {
    if (value == null || value === "") return fallback;
    const n = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }
  function round(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
  function parseDate(value) {
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(value || ""));
    if (!match) return null;
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return { year, month, day, key: `${year}-${String(month).padStart(2, "0")}`, dayKey: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
  }
  function minutes(value) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }
  function shift(start, end, breakMinutes) {
    const from = minutes(start), to = minutes(end);
    const pause = numeric(breakMinutes, NaN);
    if (from == null || to == null || from === to || !Number.isFinite(pause) || pause < 0 || pause >= 1440) return { hours: 0, valid: false, overnight: false };
    const overnight = to < from;
    const elapsed = to - from + (overnight ? 1440 : 0);
    if (pause >= elapsed) return { hours: 0, valid: false, overnight };
    return { hours: (elapsed - pause) / 60, valid: true, overnight, from, to: to + (overnight ? 1440 : 0), breakMinutes: pause };
  }
  function parseOvertime(value) {
    const text = String(value ?? "").trim().replace(",", ".");
    const time = /^(\d{1,2}):([0-5]\d)$/.exec(text);
    return time ? Number(time[1]) + Number(time[2]) / 60 : Math.max(0, numeric(text, 0));
  }

  function defaults(year) {
    const selectedYear = Number(year) || new Date().getFullYear();
    return {
      payrollSalaryMode: "minimum", payrollSalaryBasis: "net",
      payrollMonthlySalary: WAGES[selectedYear]?.net ?? "",
      payrollStartTime: "08:30", payrollEndTime: "18:30", payrollBreakMinutes: 60,
      payrollOvertimeMultiplier: 1.5
    };
  }

  function rates(settings, year) {
    const s = { ...defaults(year), ...(settings || {}) };
    const basis = s.payrollSalaryBasis === "gross" ? "gross" : "net";
    const custom = s.payrollSalaryMode === "custom";
    const amount = custom ? numeric(s.payrollMonthlySalary, 0) : (WAGES[year]?.[basis] || 0);
    const salaryKnown = amount > 0;
    const baseSalary = Math.max(0, amount);
    return {
      settings: s, basis, salaryKnown, baseSalary,
      dailyRate: baseSalary / 30, hourlyRate: baseSalary / 225,
      overtimeMultiplier: Math.max(1.5, numeric(s.payrollOvertimeMultiplier, 1.5))
    };
  }

  function holidayForDate(date) {
    const parsed = parseDate(date);
    if (!parsed) return { fraction: 0, name: "", known: false };
    const entry = FIXED_HOLIDAYS[parsed.dayKey] || RELIGIOUS_HOLIDAYS[parsed.year]?.[parsed.dayKey];
    return { fraction: entry?.[0] || 0, name: entry?.[1] || "", known: !!RELIGIOUS_HOLIDAYS[parsed.year] };
  }

  function recordDetails(record, settings) {
    const date = parseDate(record.date);
    const year = date?.year || new Date().getFullYear();
    const rate = rates(settings, year);
    const s = rate.settings;
    const p = record.payroll || {};
    const warnings = [];
    const worked = record.attendance === "İşe geldim";
    const scheduled = shift(s.payrollStartTime, s.payrollEndTime, s.payrollBreakMinutes);
    const actual = shift(p.startTime ?? s.payrollStartTime, p.endTime ?? s.payrollEndTime, p.breakMinutes ?? s.payrollBreakMinutes);
    const workedHours = worked && actual.valid ? actual.hours : 0;
    if (!date) warnings.push("Geçersiz kayıt tarihi.");
    if (worked && !actual.valid) warnings.push("Çalışma saatlerini ve molayı kontrol edin.");
    if (worked && actual.overnight) warnings.push("Gece yarısını aşan vardiyalarda tatil hesabı başlangıç gününe aittir; günleri ayrı kaydedin.");
    const holiday = holidayForDate(record.date);
    const explicitFraction = p.holidayFraction != null && p.holidayFraction !== "" && p.holidayFraction !== "auto";
    let holidayFraction = explicitFraction ? numeric(p.holidayFraction, 0) : holiday.fraction;
    holidayFraction = [0, 0.5, 1].includes(holidayFraction) ? holidayFraction : 0;
    const holidayName = p.holidayName || (holidayFraction ? holiday.name || "Resmî tatil" : "");
    // Half-day statutory holidays begin at 13:00. A morning-only shift is not
    // holiday work. A manual half-day entry follows the same afternoon rule.
    let holidayWorkedFraction = worked && workedHours > 0 ? holidayFraction : 0;
    if (holidayWorkedFraction === 0.5 && actual.to <= 13 * 60) holidayWorkedFraction = 0;
    const enteredOvertime = worked && record.overtime === "Mesai yaptım" ? parseOvertime(record.overtime_hours) : 0;
    let overtimeHours = Math.min(enteredOvertime, workedHours);
    if (enteredOvertime > workedHours) warnings.push("Fazla mesai toplam çalışma süresini aşamaz; süre sınırlandı.");
    // The ordinary holiday shift already earns its extra daily wage. Only
    // explicitly recorded hours beyond the normal shift may also earn OT.
    if (holidayWorkedFraction > 0) {
      const beyondShift = scheduled.valid ? Math.max(0, workedHours - scheduled.hours) : 0;
      if (overtimeHours > beyondShift) warnings.push("Tatil vardiyasının normal saatleri ayrıca fazla mesai sayılmadı; yalnızca vardiya dışındaki süre hesaplandı.");
      overtimeHours = Math.min(overtimeHours, beyondShift);
    }
    const unpaidDays = !worked && p.unpaid === true ? 1 : 0;
    const overtimePay = round(overtimeHours * rate.hourlyRate * rate.overtimeMultiplier);
    const holidayPay = round(holidayWorkedFraction * rate.dailyRate);
    const deduction = round(unpaidDays * rate.dailyRate);
    return {
      recordId: record.id, date: record.date, worked, workedHours,
      overtimeHours, enteredOvertime, holidayFraction, holidayWorkedFraction, holidayName,
      unpaidDays, baseDaily: rate.dailyRate, baseHourly: rate.hourlyRate,
      overtimePay, holidayPay, deduction, extraPay: round(overtimePay + holidayPay - deduction),
      salaryKnown: rate.salaryKnown, basis: rate.basis, warnings
    };
  }

  function summarize(records, settings, periodMonth) {
    const monthMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(periodMonth || ""));
    if (!monthMatch) throw new Error("Maaş dönemi YYYY-AA biçiminde olmalıdır.");
    const year = Number(monthMatch[1]), month = Number(monthMatch[2]);
    const rate = rates(settings, year);
    const warnings = [];
    const byDate = new Map();
    (records || []).forEach((record) => {
      const date = parseDate(record.date);
      if (!date || date.key !== periodMonth) return;
      const dayKey = `${date.year}-${date.dayKey}`;
      const prior = byDate.get(dayKey);
      if (prior) warnings.push(`${record.date}: Aynı gün için birden fazla kayıt var; en yeni kayıt hesaplandı.`);
      if (!prior || numeric(record.id, 0) >= numeric(prior.id, 0)) byDate.set(dayKey, record);
    });
    const selected = [...byDate.values()].sort((a, b) => {
      const ad = parseDate(a.date), bd = parseDate(b.date);
      return ad.day - bd.day;
    });
    const details = selected.map((record) => ({ record, ...recordDetails(record, settings) }));
    const sum = (field) => details.reduce((total, detail) => total + detail[field], 0);
    if (!rate.salaryKnown) warnings.push(`${year} yılı için doğrulanmış asgari ücret bulunmuyor. Bu ay için özel aylık ücret girin.`);
    if (!RELIGIOUS_HOLIDAYS[year]) warnings.push(`${year} yılı dinî bayram takvimi tanımlı değil; tatilleri elle seçin.`);
    details.forEach((detail) => detail.warnings.forEach((warning) => warnings.push(`${detail.date}: ${warning}`)));
    const overtimePay = round(sum("overtimePay")), holidayPay = round(sum("holidayPay"));
    const unpaidDays = sum("unpaidDays");
    // In a 31-day month, a full month of explicit unpaid leave cannot deduct
    // more than the monthly base. No unrecorded or paid leave days are deducted.
    const rawDeductions = round(sum("deduction"));
    const deductions = Math.min(round(rate.baseSalary), rawDeductions);
    if (rawDeductions > deductions) {
      let remaining = deductions;
      details.forEach((detail) => {
        detail.deduction = Math.min(detail.deduction, remaining);
        remaining = round(remaining - detail.deduction);
        detail.extraPay = round(detail.overtimePay + detail.holidayPay - detail.deduction);
      });
      warnings.push("Ücretsiz gün kesintileri aylık ücretle sınırlandı; günlük kesintiler tarih sırasıyla dağıtıldı.");
    }
    return {
      year, month, basis: rate.basis, salaryKnown: rate.salaryKnown,
      baseSalary: round(rate.baseSalary), dailyRate: rate.dailyRate, hourlyRate: rate.hourlyRate,
      overtimeMultiplier: rate.overtimeMultiplier,
      overtimeHours: sum("overtimeHours"), overtimePay,
      holidayDays: sum("holidayWorkedFraction"), holidayPay,
      unpaidDays, deductions, total: round(rate.baseSalary + overtimePay + holidayPay - deductions),
      workedDays: details.filter((d) => d.worked).length, workedHours: sum("workedHours"),
      records: selected, details, warnings: [...new Set(warnings)]
    };
  }

  Warman.payroll = { defaults, rates, holidayForDate, recordDetails, summarize, sources: SOURCES, minimumWages: WAGES };
})();
