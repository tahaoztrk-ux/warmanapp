window.Warman = window.Warman || {};
(function () {
  // Monthly wage tracker for a standard 45-hour week. Gross entitlements and
  // net estimates stay separate; cumulative income tax is not inferred.
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
    hourlyCalculation: "https://www.csgb.gov.tr/Media/pbloor0b/i%C5%9F-kanunlar%C4%B1-ve-t%C3%BCrk-bor%C3%A7lar-kanuna-g%C3%B6re-s%C3%B6zle%C5%9Fme-t%C3%BCrleri.pdf",
    overtimeRules: "https://www.csgb.gov.tr/Media/j2gell2h/%C3%A7al%C4%B1%C5%9Fma-s%C3%BCreleri-ve-%C3%BCcret.pdf",
    besRounding: "https://ms.hmb.gov.tr/uploads/2018/11/Otomatik-Kat%C4%B1l%C4%B1m-Sistemi-Hakk%C4%B1nda-S%C4%B1k%C3%A7a-Sorulan-Sorular-SSS.pdf",
    sgkCeiling: "https://www.sgk.gov.tr/Content/Post/2e0c9e1a-2cfe-4456-af10-49d3de0c58ba/Prime-Esas-Kazanc-Miktarlari-2026-01-14-10-35-39"
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

  const SALARY_DAYS = 30;
  const MONTHLY_HOURS = 225;
  const STANDARD_HOURS = 7.5;

  function dailyPekCeiling(year) {
    const factor = Number(year) === 2025 ? 7.5 : Number(year) === 2026 ? 9 : null;
    return factor ? round(WAGES[year].gross / SALARY_DAYS * factor) : null;
  }

  function numeric(value, fallback) {
    if (value == null || value === "") return fallback;
    const n = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }
  function round(value) { return Math.round((value + Number.EPSILON * Math.max(1, Math.abs(value))) * 100) / 100; }
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
      payrollDailyHours: STANDARD_HOURS, payrollOvertimeMultiplier: 1.5, payrollRestMultiplier: 1.5,
      payrollWeeklyRestDay: 0, payrollSaturdayOvertime: true, payrollMonthlyGross: "",
      payrollBesRate: 3, payrollTravelPay: 4000
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
    const officialGross = WAGES[year]?.gross || 0;
    const grossSalary = custom ? (basis === "gross" ? baseSalary : Math.max(0, numeric(s.payrollMonthlyGross, 0))) : officialGross;
    const besRate = Math.min(100, Math.max(0, numeric(s.payrollBesRate, 3)));
    const travelPay = round(Math.max(0, numeric(s.payrollTravelPay, 4000)));
    const dailyRate = baseSalary / SALARY_DAYS;
    const hourlyRate = baseSalary / MONTHLY_HOURS;
    const restDay = numeric(s.payrollWeeklyRestDay, 0);
    const monthlyPekCeiling = dailyPekCeiling(year) == null ? grossSalary : dailyPekCeiling(year) * SALARY_DAYS;
    return {
      settings: s, basis, salaryKnown, baseSalary, grossSalary: round(grossSalary), grossKnown: grossSalary > 0,
      grossHourlyRate: grossSalary / MONTHLY_HOURS, standardHours: STANDARD_HOURS,
      daysInMonth, salaryDays: SALARY_DAYS, besRate, travelPay, dailyRate, hourlyRate,
      netDailyRate: (baseSalary - (basis === "net" ? Math.floor(Math.min(grossSalary, monthlyPekCeiling) * besRate / 100 + 1e-9) : 0)) / SALARY_DAYS,
      overtimeMultiplier: Math.max(1.5, numeric(s.payrollOvertimeMultiplier, 1.5)),
      restMultiplier: Math.max(1.5, numeric(s.payrollRestMultiplier, 1.5)),
      weeklyRestDay: Number.isInteger(restDay) && restDay >= -1 && restDay <= 6 ? restDay : 0,
      saturdayOvertime: s.payrollSaturdayOvertime !== false
    };
  }

  function dayKind(date, settings, holidayOverride) {
    const parsed = parseDate(date);
    const today = new Date();
    const rate = rates(settings, parsed?.year || today.getFullYear(), parsed?.month || today.getMonth() + 1);
    const holiday = holidayForDate(date);
    let fraction = holiday.fraction;
    let name = holiday.name;
    if (holidayOverride != null && holidayOverride !== "" && holidayOverride !== "auto") {
      fraction = [0, 0.5, 1].includes(numeric(holidayOverride, 0)) ? numeric(holidayOverride, 0) : 0;
      name = fraction ? (holiday.name || "Resmî tatil") : "";
    }
    const holidayInfo = { fraction, name, known: holiday.known };
    const dow = parsed ? new Date(parsed.year, parsed.month - 1, parsed.day).getDay() : -2;
    const isWeeklyRest = dow === rate.weeklyRestDay;
    const info = { overtimeMultiplier: rate.overtimeMultiplier, restMultiplier: rate.restMultiplier,
      holiday: holidayInfo, isWeeklyRest, allHoursExtra: isWeeklyRest || (dow === 6 && rate.saturdayOvertime), standardHours: STANDARD_HOURS };
    if (fraction) return { ...info, kind: "holiday", label: name || "Resmî tatil" };
    if (isWeeklyRest) return { ...info, kind: dow === 0 ? "sunday" : "rest", label: dow === 0 ? "Pazar · hafta tatili" : "Hafta tatili" };
    if (dow === 6) return { ...info, kind: "saturday", label: "Cumartesi" };
    return { ...info, kind: "weekday", label: dow === 0 ? "Pazar · normal iş günü" : "Hafta içi" };
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
    return parseHours(settings.payrollDailyHours ?? STANDARD_HOURS);
  }

  function dayShare(monthlyAmount, days, daysInMonth) {
    if (!daysInMonth) return 0;
    return round(monthlyAmount * Math.min(days, daysInMonth) / daysInMonth);
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
    const holidayWorkedFraction = worked && p.holidayWorked !== false ? holidayFraction : 0;
    const kind = dayKind(record.date, settings, holidayFraction);
    const enteredOvertime = record.overtime === "Mesai yaptım" ? parseHours(record.overtime_hours) : 0;
    const hasWorkedHours = p.workedHours != null && p.workedHours !== "";
    const totalHoursEntry = p.hoursKind === "worked" || (p.hoursKind == null && hasWorkedHours && (holidayFraction || kind.allHoursExtra));
    const enteredWorkHours = hasWorkedHours ? parseHours(p.workedHours) : enteredOvertime;
    const hasHoursEntry = hasWorkedHours || record.overtime === "Mesai yaptım";
    const restWorkedDays = worked && kind.isWeeklyRest ? 1 : 0;
    // Old holiday records saved total worked hours in both workedHours and
    // overtime_hours. Count the normal shift once, then only its excess as OT.
    let extraOvertimeHours = worked ? enteredOvertime : 0;
    if (worked && (totalHoursEntry || kind.isWeeklyRest)) {
      extraOvertimeHours = holidayFraction || kind.isWeeklyRest
        ? Math.max(0, (hasHoursEntry ? enteredWorkHours : STANDARD_HOURS) - STANDARD_HOURS)
        : kind.allHoursExtra ? enteredWorkHours : 0;
      if (totalHoursEntry && !holidayFraction && !kind.allHoursExtra && enteredWorkHours) warnings.push("Normal iş gününün toplam çalışma saati otomatik fazla mesai sayılmadı; kaydı düzenleyip yalnız fazla saatleri girin.");
    }
    const overtimeHours = worked && kind.isWeeklyRest ? (hasHoursEntry ? enteredWorkHours : STANDARD_HOURS) : extraOvertimeHours;
    if (!worked && enteredOvertime) warnings.push("Çalışılmayan günün mesai saati ödemeye eklenmedi.");
    const paidLeave = record.attendance === "İzinliyim" && p.unpaid !== true;
    // Explicit unpaid leave suspends pay; simple holiday/rest attendance does
    // not. A half holiday protects only its half of an otherwise missed day.
    const unpaidLeave = record.attendance === "İzinliyim" && p.unpaid === true;
    const unpaidDays = worked || paidLeave ? 0 : unpaidLeave ? 1 : kind.isWeeklyRest ? 0 : 1 - holidayFraction;
    const payable = unpaidDays < 1;
    const protectedHoliday = !worked && !unpaidLeave ? holidayFraction : 0;
    const dailyBasePay = dayShare(rate.baseSalary, 1, rate.salaryDays);
    const holidayPay = round(holidayWorkedFraction * rate.dailyRate);
    const grossHolidayPay = round(holidayWorkedFraction * rate.grossSalary / SALARY_DAYS);
    const actualOvertimePay = round(extraOvertimeHours * rate.hourlyRate * rate.overtimeMultiplier);
    const grossActualOvertimePay = round(extraOvertimeHours * rate.grossHourlyRate * rate.overtimeMultiplier);
    // A holiday coinciding with weekly rest does not duplicate the same day's
    // supplement. Retain the larger entitlement (including contract increases).
    const restPay = restWorkedDays ? round(Math.max(0, rate.dailyRate * rate.restMultiplier - holidayPay)) : 0;
    const grossRestPay = restWorkedDays ? round(Math.max(0, rate.grossSalary / SALARY_DAYS * rate.restMultiplier - grossHolidayPay)) : 0;
    const overtimePay = round(actualOvertimePay + restPay);
    const grossOvertimePay = round(grossActualOvertimePay + grossRestPay);
    const deduction = round(unpaidDays * rate.dailyRate);
    const besDeduction = 0; // OKS is calculated once on the monthly PEK.
    const dailyPay = round(dailyBasePay + overtimePay + holidayPay - deduction);
    return {
      recordId: record.id, date: record.date, worked, workedHours, paidLeave, payable,
      overtimeHours, extraOvertimeHours, enteredOvertime, holidayFraction, holidayWorkedFraction, holidayName, protectedHoliday,
      dayKind: kind.kind, dayLabel: kind.label, overtimeMultiplier: kind.overtimeMultiplier,
      restMultiplier: rate.restMultiplier, isWeeklyRest: kind.isWeeklyRest, restWorkedDays, restPay, grossRestPay,
      unpaidDays, baseDaily: rate.dailyRate, baseHourly: rate.hourlyRate, dailyBasePay,
      overtimePay, actualOvertimePay, grossOvertimePay, grossActualOvertimePay, holidayPay, grossHolidayPay,
      deduction, extraPay: round(overtimePay + holidayPay - deduction),
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
    if (rate.basis === "net") warnings.push("Net mesai ve tatil tutarları net aylık ücret oranıyla tahmin edilir. Kesin net bordro için kümülatif vergi matrahı ve kişisel kesintiler gerekir; brüt hakedişler ayrıca gösterilir.");
    if (!rate.grossKnown && rate.besRate > 0) warnings.push("Brüt maaş bilinmediği için BES hesaplanmadı. Net maaşın brüt karşılığını ayarlara girin.");
    details.forEach((detail) => detail.warnings.forEach((warning) => warnings.push(`${detail.date}: ${warning}`)));

    const quantity = (list, field) => list.reduce((total, detail) => total + detail[field], 0);
    const sum = (list, field) => round(quantity(list, field));
    const dailyBreakdown = [];
    // Monthly salary is the base. Only unpaid working-day fractions reduce it.
    // The legacy asOf argument is ignored: recorded absences determine pay.
    const recordedDays = details.length;
    const payableDays = details.filter((detail) => detail.payable).length;
    const unpaidDays = quantity(details, "unpaidDays");
    const dailyBasePay = dayShare(rate.baseSalary, 1, rate.salaryDays);
    const deductions = dayShare(rate.baseSalary, unpaidDays, rate.salaryDays);
    const paidBaseSalary = round(rate.baseSalary - deductions);
    const paidGross = round(rate.grossSalary - dayShare(rate.grossSalary, unpaidDays, rate.salaryDays));
    const overtimePay = sum(details, "overtimePay"), holidayPay = sum(details, "holidayPay");
    const grossOvertimePay = sum(details, "grossOvertimePay"), grossHolidayPay = sum(details, "grossHolidayPay");
    const insuredDays = Math.max(0, SALARY_DAYS - Math.min(SALARY_DAYS, unpaidDays));
    const pekCeiling = dailyPekCeiling(year) == null ? null : round(dailyPekCeiling(year) * insuredDays);
    const grossEarnings = round(paidGross + grossOvertimePay + grossHolidayPay);
    const besBase = pekCeiling == null ? grossEarnings : Math.min(grossEarnings, pekCeiling);
    // Private-sector OKS uses SGK PEK, including eligible wage additions. The
    // contribution's fractional lira is discarded (Hazine OKS FAQ question 27).
    const besDeduction = rate.grossKnown ? Math.floor(besBase * rate.besRate / 100 + 1e-9) : 0;
    const appliedBesDeduction = rate.basis === "net" ? besDeduction : 0;
    if (rate.grossKnown && rate.besRate > 0 && pekCeiling == null) warnings.push("Bu yıl için SGK prime esas kazanç tavanı tanımlı değil; BES tavan uygulanmadan tahmin edildi.");
    const travelPay = rate.travelPay;
    const salaryTotal = round(paidBaseSalary + holidayPay - appliedBesDeduction);
    const combinedTotal = round(salaryTotal + overtimePay + travelPay);
    const total = salaryTotal;
    const accruedBaseSalary = rate.baseSalary;
    let unpaidSoFar = 0;
    let allocatedDeduction = 0;
    details.forEach((detail) => {
      const day = parseDate(detail.date).day;
      unpaidSoFar += detail.unpaidDays;
      const targetDeduction = round(rate.baseSalary * Math.min(unpaidSoFar, SALARY_DAYS) / SALARY_DAYS);
      const deduction = round(targetDeduction - allocatedDeduction);
      allocatedDeduction = targetDeduction;
      const extraPay = round(detail.overtimePay + detail.holidayPay - deduction);
      const dailyPay = extraPay;
      const netDailyPay = extraPay;
      const row = { day, date: detail.date, recordId: detail.recordId, dailyBasePay, deduction, besDeduction: 0, dailyPay, netDailyPay,
        overtimePay: detail.overtimePay, holidayPay: detail.holidayPay };
      dailyBreakdown.push(row);
      Object.assign(detail, { dailyBasePay, deduction, besDeduction: 0, dailyPay, netDailyPay, extraPay });
    });
    return {
      year, month, basis: rate.basis, salaryKnown: rate.salaryKnown, daysInMonth: rate.daysInMonth,
      salaryDays: rate.salaryDays, baseSalary: rate.baseSalary, grossSalary: rate.grossSalary, grossKnown: rate.grossKnown,
      dailyRate: rate.dailyRate, hourlyRate: rate.hourlyRate, grossHourlyRate: rate.grossHourlyRate, paidGross,
      standardHours: STANDARD_HOURS, weeklyRestDay: rate.weeklyRestDay, saturdayOvertime: rate.saturdayOvertime,
      besBase, pekCeiling, insuredDays, grossEarnings, appliedBesDeduction,
      netDailyRate: rate.netDailyRate, overtimeMultiplier: rate.overtimeMultiplier, restMultiplier: rate.restMultiplier, besRate: rate.besRate, besDeduction,
      overtimeHours: quantity(details, "overtimeHours"), overtimePay, extraOvertimeHours: quantity(details, "extraOvertimeHours"),
      actualOvertimePay: sum(details, "actualOvertimePay"), restPay: sum(details, "restPay"), restWorkedDays: quantity(details, "restWorkedDays"),
      grossOvertimePay, grossHolidayPay,
      holidayDays: quantity(details, "holidayWorkedFraction"), holidayPay,
      unpaidDays, deductions, travelPay, salaryTotal, combinedTotal,
      total, recordedDays, payableDays, earnedBaseSalary: accruedBaseSalary, paidBaseSalary,
      workedDays: details.filter((d) => d.worked).length, workedHours: quantity(details, "workedHours"),
      accruedDays: recordedDays, accruedBaseSalary, accruedOvertimePay: overtimePay, accruedHolidayPay: holidayPay,
      accruedDeductions: deductions, accruedBesDeduction: besDeduction, accruedTotal: total,
      records: selected, details, dailyBreakdown, warnings: [...new Set(warnings)]
    };
  }

  Warman.payroll = { defaults, rates, holidayForDate, dayKind, recordDetails, summarize, parseHours, sources: SOURCES, minimumWages: WAGES };
})();
