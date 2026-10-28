window.Warman = window.Warman || {};
(function () {
  // Personal salary estimate. Only saved daily records earn pay; daily rates
  // use the selected month's calendar length, without schedule or break rules.
  const WAGES = {
    2025: { net: 22104.67, gross: 26005.50 },
    2026: { net: 28075.50, gross: 33030.00 }
  };
  const SOURCES = {
    bes: "https://www.egm.org.tr/otomatik-katilim/oks-nedir/",
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
  function parseHours(value) {
    const text = String(value ?? "").trim().replace(",", ".");
    const time = /^(\d+):([0-5]\d)$/.exec(text);
    const parsed = time ? Number(time[1]) + Number(time[2]) / 60 : numeric(text, 0);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function defaults(year) {
    const selectedYear = Number(year) || new Date().getFullYear();
    return {
      payrollSalaryMode: "minimum", payrollSalaryBasis: "net",
      payrollMonthlySalary: WAGES[selectedYear]?.net ?? "",
      payrollDailyHours: 10, payrollOvertimeMultiplier: 1.5, payrollBesRate: 3
    };
  }

  function rates(settings, year, month) {
    const s = { ...defaults(year), ...(settings || {}) };
    const basis = s.payrollSalaryBasis === "gross" ? "gross" : "net";
    const custom = s.payrollSalaryMode === "custom";
    const amount = custom ? numeric(s.payrollMonthlySalary, 0) : (WAGES[year]?.[basis] || 0);
    const salaryKnown = amount > 0;
    const baseSalary = round(Math.max(0, amount));
    const selectedMonth = Number(month) || new Date().getMonth() + 1;
    const daysInMonth = new Date(Number(year), selectedMonth, 0).getDate();
    const besRate = Math.min(100, Math.max(0, numeric(s.payrollBesRate, 3)));
    return {
      settings: s, basis, salaryKnown, baseSalary, daysInMonth, besRate,
      dailyRate: baseSalary / daysInMonth, hourlyRate: baseSalary / 225,
      netDailyRate: (baseSalary - round(baseSalary * besRate / 100)) / daysInMonth,
      overtimeMultiplier: Math.max(1.5, numeric(s.payrollOvertimeMultiplier, 1.5))
    };
  }

  function holidayForDate(date) {
    const parsed = parseDate(date);
    if (!parsed) return { fraction: 0, name: "", known: false };
    const entry = FIXED_HOLIDAYS[parsed.dayKey] || RELIGIOUS_HOLIDAYS[parsed.year]?.[parsed.dayKey];
    return { fraction: entry?.[0] || 0, name: entry?.[1] || "", known: !!RELIGIOUS_HOLIDAYS[parsed.year] };
  }

  function legacyWorkedHours(payroll, settings) {
    // Existing records remain readable. Legacy breaks are deliberately ignored.
    const clockMinutes = (value) => {
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const start = clockMinutes(payroll.startTime ?? settings.payrollStartTime);
    const end = clockMinutes(payroll.endTime ?? settings.payrollEndTime);
    if (start != null && end != null && start !== end) return (end - start + (end < start ? 1440 : 0)) / 60;
    return parseHours(settings.payrollDailyHours ?? 10);
  }

  function dailyShare(monthlyAmount, day, daysInMonth) {
    return round(round(monthlyAmount * day / daysInMonth) - round(monthlyAmount * (day - 1) / daysInMonth));
  }

  function recordDetails(record, settings) {
    const date = parseDate(record.date);
    const today = new Date();
    const rate = rates(settings, date?.year || today.getFullYear(), date?.month || today.getMonth() + 1);
    const p = record.payroll || {};
    const warnings = date ? [] : ["Geçersiz kayıt tarihi."];
    const worked = record.attendance === "İşe geldim";
    const workedHours = worked ? (p.workedHours != null && p.workedHours !== "" ? parseHours(p.workedHours) : legacyWorkedHours(p, rate.settings)) : 0;
    const holiday = holidayForDate(record.date);
    const explicitFraction = p.holidayFraction != null && p.holidayFraction !== "" && p.holidayFraction !== "auto";
    let holidayFraction = explicitFraction ? numeric(p.holidayFraction, 0) : holiday.fraction;
    holidayFraction = [0, 0.5, 1].includes(holidayFraction) ? holidayFraction : 0;
    const holidayName = holidayFraction ? p.holidayName || holiday.name || "Resmî tatil" : "";
    const holidayWorkedFraction = worked ? holidayFraction : 0;
    // Hours are user-entered quantities. No clock, attendance, daily or weekly
    // duration limit is imposed on the overtime number.
    const enteredOvertime = record.overtime === "Mesai yaptım" ? parseHours(record.overtime_hours) : 0;
    const overtimeHours = enteredOvertime;
    const paidLeave = record.attendance === "İzinliyim" && p.unpaid !== true;
    const payable = worked || paidLeave;
    const unpaidDays = payable ? 0 : 1;
    const dailyBasePay = dailyShare(rate.baseSalary, date?.day || 1, rate.daysInMonth);
    const overtimePay = round(overtimeHours * rate.hourlyRate * rate.overtimeMultiplier);
    const holidayPay = round(holidayWorkedFraction * rate.dailyRate);
    const deduction = unpaidDays ? dailyBasePay : 0;
    const besDeduction = round((dailyBasePay - deduction) * rate.besRate / 100);
    const dailyPay = round(dailyBasePay + overtimePay + holidayPay - deduction);
    return {
      recordId: record.id, date: record.date, worked, workedHours, paidLeave, payable,
      overtimeHours, enteredOvertime, holidayFraction, holidayWorkedFraction, holidayName,
      unpaidDays, baseDaily: rate.dailyRate, baseHourly: rate.hourlyRate, dailyBasePay,
      overtimePay, holidayPay, deduction, extraPay: round(overtimePay + holidayPay - deduction),
      besRate: rate.besRate, besDeduction, dailyPay, netDailyPay: round(dailyPay - besDeduction),
      salaryKnown: rate.salaryKnown, basis: rate.basis, warnings
    };
  }

  function summarize(records, settings, periodMonth, asOf) {
    const monthMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(periodMonth || ""));
    if (!monthMatch) throw new Error("Maaş dönemi YYYY-AA biçiminde olmalıdır.");
    const year = Number(monthMatch[1]), month = Number(monthMatch[2]);
    const rate = rates(settings, year, month);
    const warnings = [];
    const byDate = new Map();
    (records || []).forEach((record) => {
      const date = parseDate(record.date);
      if (!date || date.key !== periodMonth) return;
      const prior = byDate.get(date.day);
      if (prior) warnings.push(`${record.date}: Aynı gün için birden fazla kayıt var; en yeni kayıt hesaplandı.`);
      if (!prior || numeric(record.id, 0) >= numeric(prior.id, 0)) byDate.set(date.day, record);
    });
    const selected = [...byDate.values()].sort((a, b) => parseDate(a.date).day - parseDate(b.date).day);
    const details = selected.map((record) => ({ record, ...recordDetails(record, settings) }));
    if (!rate.salaryKnown) warnings.push(`${year} yılı için doğrulanmış asgari ücret bulunmuyor. Bu ay için özel aylık ücret girin.`);
    if (!RELIGIOUS_HOLIDAYS[year]) warnings.push(`${year} yılı dinî bayram takvimi tanımlı değil; tatilleri elle seçin.`);
    details.forEach((detail) => detail.warnings.forEach((warning) => warnings.push(`${detail.date}: ${warning}`)));

    let cumulativePaidBase = 0;
    let previousBes = 0;
    const dailyBreakdown = [];
    // Missing dates contribute nothing. The optional legacy asOf argument is
    // intentionally ignored: saved dates, including future ones, determine pay.
    // Allocate BES against cumulative saved paid wages to reconcile cents.
    details.forEach((detail) => {
      const day = parseDate(detail.date).day;
      const dailyBasePay = detail.dailyBasePay;
      const deduction = detail.deduction;
      cumulativePaidBase = round(cumulativePaidBase + dailyBasePay - deduction);
      const cumulativeBes = round(cumulativePaidBase * rate.besRate / 100);
      const besDeduction = round(cumulativeBes - previousBes);
      previousBes = cumulativeBes;
      const dailyPay = round(dailyBasePay + detail.overtimePay + detail.holidayPay - deduction);
      const netDailyPay = round(dailyPay - besDeduction);
      const row = { day, date: detail.date, recordId: detail.recordId, dailyBasePay, deduction, besDeduction, dailyPay, netDailyPay,
        overtimePay: detail.overtimePay, holidayPay: detail.holidayPay };
      dailyBreakdown.push(row);
      Object.assign(detail, { dailyBasePay, deduction, besDeduction, dailyPay, netDailyPay,
        extraPay: round(detail.overtimePay + detail.holidayPay - deduction) });
    });
    const quantity = (list, field) => list.reduce((total, detail) => total + detail[field], 0);
    const sum = (list, field) => round(quantity(list, field));
    const recordedDays = details.length;
    const payableDays = details.filter((detail) => detail.payable).length;
    const accruedBaseSalary = sum(dailyBreakdown, "dailyBasePay");
    const deductions = sum(dailyBreakdown, "deduction");
    const besDeduction = sum(dailyBreakdown, "besDeduction");
    const overtimePay = sum(details, "overtimePay"), holidayPay = sum(details, "holidayPay");
    const paidBaseSalary = round(accruedBaseSalary - deductions);
    const total = round(paidBaseSalary + overtimePay + holidayPay - besDeduction);
    return {
      year, month, basis: rate.basis, salaryKnown: rate.salaryKnown, daysInMonth: rate.daysInMonth,
      baseSalary: rate.baseSalary, dailyRate: rate.dailyRate, hourlyRate: rate.hourlyRate,
      netDailyRate: rate.netDailyRate, overtimeMultiplier: rate.overtimeMultiplier, besRate: rate.besRate, besDeduction,
      overtimeHours: quantity(details, "overtimeHours"), overtimePay,
      holidayDays: quantity(details, "holidayWorkedFraction"), holidayPay,
      unpaidDays: quantity(details, "unpaidDays"), deductions,
      total, recordedDays, payableDays, earnedBaseSalary: accruedBaseSalary, paidBaseSalary,
      workedDays: details.filter((d) => d.worked).length, workedHours: quantity(details, "workedHours"),
      accruedDays: recordedDays, accruedBaseSalary, accruedOvertimePay: overtimePay, accruedHolidayPay: holidayPay,
      accruedDeductions: deductions, accruedBesDeduction: besDeduction, accruedTotal: total,
      records: selected, details, dailyBreakdown, warnings: [...new Set(warnings)]
    };
  }

  Warman.payroll = { defaults, rates, holidayForDate, recordDetails, summarize, parseHours, sources: SOURCES, minimumWages: WAGES };
})();
