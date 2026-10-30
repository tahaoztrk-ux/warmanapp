const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {}, Date, Number, Math, String, Map, Set };
context.Warman = context.window.Warman = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/payroll.js'), 'utf8'), context);
const P = context.Warman.payroll;
const record = (date, overrides = {}) => ({
  id: 1, date, attendance: 'İşe geldim', overtime: 'Mesai yapmadım',
  overtime_hours: null, payroll: {}, ...overrides
});
const overtime = (date, hours, payroll = {}) => record(date, {
  overtime: 'Mesai yaptım', overtime_hours: hours, payroll
});
const absent = (date, payroll = {}) => record(date, { attendance: 'Gelmedim', payroll });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, actual + ' != ' + expected);
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
// Exact net hourly/daily amounts keep entitlement tests independent of rounding.
const custom = {
  payrollSalaryMode: 'custom', payrollMonthlySalary: 22500,
  payrollMonthlyGross: 30000, payrollBesRate: 0, payrollTravelPay: 0
};

test('yearly minimum wages expose separate net and gross hourly rates', () => {
  const net = P.rates({}, 2026, 10);
  const gross = P.rates({ payrollSalaryBasis: 'gross' }, 2026, 10);
  assert.equal(net.baseSalary, 28075.50);
  assert.equal(net.grossSalary, 33030);
  assert.equal(net.hourlyRate, 124.78);
  assert.equal(net.grossHourlyRate, 146.8);
  assert.equal(gross.baseSalary, 33030);
  assert.equal(gross.hourlyRate, 146.8);
  assert.equal(P.rates({}, 2025, 1).baseSalary, 22104.67);
  assert.equal(P.rates({}, 2025, 1).grossSalary, 26005.50);
});

test('unknown wage years require explicit salary and warn about missing calendars', () => {
  const unknown = P.summarize([], {}, '2027-01');
  assert.equal(unknown.salaryKnown, false);
  assert.equal(unknown.baseSalary, 0);
  assert.ok(unknown.warnings.some(message => message.includes('asgari ücret')));
  assert.ok(unknown.warnings.some(message => message.includes('takvimi')));
  assert.equal(P.rates({ ...custom, payrollMonthlySalary: '40000,50' }, 2027, 1).baseSalary, 40000.50);
});

test('every calendar month uses a full monthly wage and a thirtieth for an ordinary absence', () => {
  for (const [month, days] of [['2026-02', 28], ['2024-02', 29], ['2026-04', 30], ['2026-10', 31]]) {
    const summary = P.summarize([], custom, month);
    assert.equal(summary.daysInMonth, days);
    assert.equal(summary.salaryDays, 30);
    assert.equal(summary.dailyRate, 750);
    assert.equal(summary.salaryTotal, 22500);
    const missing = P.summarize([absent('02.' + month.slice(5) + '.' + month.slice(0, 4))], custom, month);
    assert.equal(missing.deductions, 750);
    assert.equal(missing.salaryTotal, 21750);
  }
});

test('an empty month starts with full salary and monthly OKS with fractional lira discarded', () => {
  const summary = P.summarize([], {}, '2026-10');
  assert.equal(summary.besBase, 33030);
  assert.equal(summary.besDeduction, 990);
  assert.equal(summary.appliedBesDeduction, 990);
  assert.equal(summary.salaryTotal, 27085.50);
  assert.equal(summary.overtimePay, 0);
  assert.equal(summary.travelPay, 4000);
  assert.equal(summary.combinedTotal, 31085.50);
  assert.equal(summary.recordedDays, 0);
});

test('ordinary saved and unrecorded dates do not stack or remove monthly wages', () => {
  const one = record('05.10.2026');
  const two = record('06.10.2026', { id: 2 });
  for (const rows of [[], [one], [one, two]]) {
    assert.equal(P.summarize(rows, custom, '2026-10').salaryTotal, 22500);
  }
  const summary = P.summarize([one, absent('06.10.2026')], custom, '2026-10');
  assert.equal(summary.recordedDays, 2);
  assert.equal(summary.payableDays, 1);
  assert.equal(summary.salaryTotal, 21750);
});

test('an ordinary absence reduces net and gross wages before monthly OKS', () => {
  const summary = P.summarize([absent('05.10.2026')], {}, '2026-10');
  assert.equal(summary.unpaidDays, 1);
  assert.equal(summary.deductions, 935.85);
  assert.equal(summary.paidBaseSalary, 27139.65);
  assert.equal(summary.paidGross, 31929);
  assert.equal(summary.besDeduction, 957);
  assert.equal(summary.salaryTotal, 26182.65);
});

test('paid leave preserves salary while explicit unpaid leave deducts one day', () => {
  const paid = record('05.10.2026', { attendance: 'İzinliyim' });
  const unpaid = { ...paid, payroll: { unpaid: true } };
  assert.equal(P.summarize([paid], custom, '2026-10').salaryTotal, 22500);
  const summary = P.summarize([unpaid], custom, '2026-10');
  assert.equal(summary.unpaidDays, 1);
  assert.equal(summary.salaryTotal, 21750);
  assert.equal(P.recordDetails(paid, custom).besDeduction, 0);
});

test('not attending a full public holiday preserves monthly salary and gross OKS base', () => {
  const summary = P.summarize([absent('29.10.2026')], {}, '2026-10');
  assert.equal(summary.unpaidDays, 0);
  assert.equal(summary.deductions, 0);
  assert.equal(summary.holidayPay, 0);
  assert.equal(summary.paidGross, 33030);
  assert.equal(summary.salaryTotal, P.summarize([], {}, '2026-10').salaryTotal);
  assert.equal(summary.details[0].protectedHoliday, 1);
  assert.equal(summary.details[0].netDailyPay, 0);
});

test('manual full, half and normal-day overrides govern absence deductions', () => {
  assert.equal(P.recordDetails(absent('05.10.2026', { holidayFraction: 1 }), custom).deduction, 0);
  assert.equal(P.recordDetails(absent('05.10.2026', { holidayFraction: 0.5 }), custom).deduction, 375);
  assert.equal(P.recordDetails(absent('29.10.2026', { holidayFraction: 0 }), custom).deduction, 750);
  const manual = P.recordDetails(record('05.10.2026', {
    payroll: { holidayFraction: 1, holidayName: 'Özel tatil' }
  }), custom);
  assert.equal(manual.holidayPay, 750);
  assert.equal(manual.holidayName, 'Özel tatil');
});

test('absence on a half public holiday deducts only the ordinary half day', () => {
  const summary = P.summarize([absent('28.10.2026')], custom, '2026-10');
  assert.equal(summary.unpaidDays, 0.5);
  assert.equal(summary.deductions, 375);
  assert.equal(summary.salaryTotal, 22125);
  assert.equal(summary.paidGross, 29500);
  assert.equal(summary.insuredDays, 29.5);
});

test('explicit unpaid leave suspends full-day pay even on a holiday or weekly rest day', () => {
  for (const date of ['28.10.2026', '29.10.2026', '04.10.2026']) {
    const row = record(date, { attendance: 'İzinliyim', payroll: { unpaid: true } });
    const detail = P.recordDetails(row, custom);
    assert.equal(detail.unpaidDays, 1);
    assert.equal(detail.deduction, 750);
    assert.equal(detail.holidayPay, 0);
    assert.equal(detail.restPay, 0);
  }
});

test('working full and half holidays adds the daily entitlement once', () => {
  const full = P.recordDetails(record('29.10.2026'), custom);
  const half = P.recordDetails(record('28.10.2026'), custom);
  assert.equal(full.holidayPay, 750);
  assert.equal(full.grossHolidayPay, 1000);
  assert.equal(full.dailyPay, 1500);
  assert.equal(full.overtimePay, 0);
  assert.equal(half.holidayPay, 375);
  assert.equal(half.dailyPay, 1125);
  assert.equal(P.recordDetails(record('29.10.2026', { attendance: 'İzinliyim' }), custom).holidayPay, 0);
});

test('a half holiday only adds holiday pay when its holiday portion was worked', () => {
  const morningOnly = P.recordDetails(record('28.10.2026', {
    payroll: { holidayWorked: false }
  }), custom);
  assert.equal(morningOnly.holidayWorkedFraction, 0);
  assert.equal(morningOnly.holidayPay, 0);
  assert.equal(morningOnly.unpaidDays, 0);
  assert.equal(morningOnly.dailyPay, 750);
});

test('ten actual holiday hours produce one daily supplement and only 2.5 overtime hours', () => {
  const detail = P.recordDetails(overtime('29.10.2026', 10, { hoursKind: 'worked' }), custom);
  assert.equal(detail.enteredOvertime, 10);
  assert.equal(detail.overtimeHours, 2.5);
  assert.equal(detail.extraOvertimeHours, 2.5);
  assert.equal(detail.holidayPay, 750);
  assert.equal(detail.overtimePay, 375);
  assert.equal(detail.grossOvertimePay, 500);
  assert.equal(detail.dailyPay, 1875);
  const short = P.recordDetails(overtime('29.10.2026', 1, { hoursKind: 'worked' }), custom);
  assert.equal(short.holidayPay, 750);
  assert.equal(short.overtimePay, 0);
});

test('half-cent wage additions round up correctly with floating-point hourly rates', () => {
  const detail = P.recordDetails(overtime('29.10.2026', 10, { hoursKind: 'worked' }), {});
  assert.equal(detail.overtimePay, 467.93);
  assert.equal(detail.holidayPay, 935.85);
  assert.equal(detail.extraPay, 1403.78);
});

test('legacy actual holiday hours avoid duplication while separately entered overtime stays additional', () => {
  const legacy = P.recordDetails(overtime('29.10.2026', 10, { workedHours: 10 }), custom);
  const additional = P.recordDetails(overtime('29.10.2026', 2, { hoursKind: 'overtime' }), custom);
  const oldAdditional = P.recordDetails(overtime('29.10.2026', 2), custom);
  assert.equal(legacy.overtimeHours, 2.5);
  assert.equal(legacy.overtimePay, 375);
  assert.equal(additional.overtimeHours, 2);
  assert.equal(additional.overtimePay, 300);
  assert.equal(additional.holidayPay, 750);
  assert.equal(oldAdditional.overtimePay, 300);
});

test('unworked weekly rest preserves salary and the configured rest day can change', () => {
  assert.equal(P.recordDetails(absent('04.10.2026'), custom).unpaidDays, 0);
  const saturdayRest = { ...custom, payrollWeeklyRestDay: 6 };
  assert.equal(P.recordDetails(absent('03.10.2026'), saturdayRest).unpaidDays, 0);
  assert.equal(P.recordDetails(absent('04.10.2026'), saturdayRest).unpaidDays, 1);
  assert.equal(P.recordDetails(absent('04.10.2026'), { ...custom, payrollWeeklyRestDay: -1 }).unpaidDays, 1);
});

test('short weekly-rest work earns an additional 1.5 daily wages, without an hourly duplicate', () => {
  for (const hours of [1, 7.5]) {
    const detail = P.recordDetails(overtime('04.10.2026', hours, { hoursKind: 'worked' }), custom);
    assert.equal(detail.overtimeHours, hours);
    assert.equal(detail.extraOvertimeHours, 0);
    assert.equal(detail.restPay, 1125);
    assert.equal(detail.overtimePay, 1125);
    assert.equal(detail.holidayPay, 0);
    assert.equal(detail.dailyPay, 1875);
  }
});

test('long weekly-rest work adds the excess above 7.5 hours at the overtime rate', () => {
  const detail = P.recordDetails(overtime('04.10.2026', 10, { hoursKind: 'worked' }), custom);
  assert.equal(detail.overtimeHours, 10);
  assert.equal(detail.extraOvertimeHours, 2.5);
  assert.equal(detail.restPay, 1125);
  assert.equal(detail.actualOvertimePay, 375);
  assert.equal(detail.overtimePay, 1500);
  const summary = P.summarize([overtime('04.10.2026', 10, { hoursKind: 'worked' })], custom, '2026-10');
  assert.equal(summary.salaryTotal, 22500);
  assert.equal(summary.overtimePay, 1500);
  assert.equal(summary.combinedTotal, 24000);
});

test('a saved more favourable weekly-rest coefficient remains effective', () => {
  const detail = P.recordDetails(overtime('04.10.2026', 7.5, { hoursKind: 'worked' }), {
    ...custom, payrollRestMultiplier: 2
  });
  assert.equal(detail.restPay, 1500);
  assert.equal(detail.overtimePay, 1500);
  assert.equal(detail.dailyPay, 2250);
});

test('a public holiday coinciding with weekly rest uses the greater daily entitlement once', () => {
  const detail = P.recordDetails(overtime('04.10.2026', 10, {
    holidayFraction: 1, hoursKind: 'worked'
  }), custom);
  assert.equal(round(detail.holidayPay + detail.restPay), 1125);
  assert.equal(detail.actualOvertimePay, 375);
  assert.equal(round(detail.holidayPay + detail.overtimePay), 1500);
  assert.equal(detail.dailyPay, 2250);
});

test('Saturday overtime separates the correct 2202 gross from the 1871.70 net estimate', () => {
  const detail = P.recordDetails(overtime('31.10.2026', 10, { hoursKind: 'worked' }), {});
  assert.equal(detail.dayKind, 'saturday');
  assert.equal(detail.overtimeHours, 10);
  assert.equal(detail.overtimeMultiplier, 1.5);
  assert.equal(detail.overtimePay, 1871.70);
  assert.equal(detail.grossOvertimePay, 2202);
  const gross = P.recordDetails(overtime('31.10.2026', 10, { hoursKind: 'worked' }), { payrollSalaryBasis: 'gross' });
  assert.equal(gross.overtimePay, 2202);
});

test('a normal Saturday uses separately entered overtime without automatically paying a whole shift', () => {
  const settings = { ...custom, payrollSaturdayOvertime: false };
  assert.equal(P.dayKind('31.10.2026', settings).allHoursExtra, false);
  assert.equal(P.recordDetails(record('31.10.2026'), settings).overtimePay, 0);
  assert.equal(P.recordDetails(overtime('31.10.2026', 2, { hoursKind: 'overtime' }), settings).overtimePay, 300);
  assert.equal(P.dayKind('31.10.2026', custom).allHoursExtra, true);
});

test('changing a former extra-work day to a normal workday does not turn its stored full shift into overtime', () => {
  for (const [date, settings] of [
    ['31.10.2026', { ...custom, payrollSaturdayOvertime: false }],
    ['04.10.2026', { ...custom, payrollWeeklyRestDay: 1 }]
  ]) {
    const detail = P.recordDetails(overtime(date, 8, {
      hoursKind: 'worked', workedHours: 8
    }), settings);
    assert.equal(detail.workedHours, 8);
    assert.equal(detail.overtimeHours, 0);
    assert.equal(detail.extraOvertimeHours, 0);
    assert.equal(detail.overtimePay, 0);
    assert.equal(detail.restPay, 0);
    assert.ok(detail.warnings.some(message => message.includes('yalnız fazla saatleri')));
  }
});

test('overtime entered on an absent or leave record is ignored and explained', () => {
  for (const attendance of ['Gelmedim', 'İzinliyim']) {
    const row = { ...overtime('05.10.2026', 10), attendance };
    const detail = P.recordDetails(row, custom);
    assert.equal(detail.overtimeHours, 0);
    assert.equal(detail.overtimePay, 0);
    assert.equal(detail.grossOvertimePay, 0);
    assert.ok(detail.warnings.some(message => message.includes('mesai')));
  }
});

test('decimal commas and hours:minutes retain precision without a clock-duration cap', () => {
  for (const input of ['1,5', '1.5', '1:30']) {
    const detail = P.recordDetails(overtime('05.10.2026', input), custom);
    assert.equal(detail.overtimeHours, 1.5);
    assert.equal(detail.overtimePay, 225);
  }
  assert.equal(P.parseHours('1000:30'), 1000.5);
  assert.equal(P.parseHours('bad input'), 0);
  assert.equal(P.parseHours(Infinity), 0);
  assert.equal(P.parseHours(-2), 0);
  const large = P.summarize([overtime('05.10.2026', '1000.123456')], custom, '2026-10');
  assert.equal(large.overtimeHours, 1000.123456);
  assert.equal(large.overtimePay, 150018.52);
});

test('legacy clock metadata remains readable without reintroducing break deductions', () => {
  const detail = P.recordDetails(record('05.10.2026', {
    payroll: { startTime: '08:30', endTime: '18:30', breakMinutes: 60 }
  }), custom);
  assert.equal(detail.workedHours, 10);
  const overnight = P.recordDetails(record('05.10.2026', {
    payroll: { startTime: '22:00', endTime: '06:00', breakMinutes: 30 }
  }), custom);
  assert.equal(overnight.workedHours, 8);
});

test('custom net salaries require a gross reference before OKS can be estimated', () => {
  const settings = { payrollSalaryMode: 'custom', payrollMonthlySalary: 31000 };
  const missing = P.summarize([overtime('05.10.2026', 2)], settings, '2026-10');
  assert.equal(missing.grossKnown, false);
  assert.equal(missing.besDeduction, 0);
  assert.equal(missing.salaryTotal, 31000);
  assert.ok(missing.warnings.some(message => message.includes('BES hesaplanmadı')));
  const known = P.summarize([], { ...settings, payrollMonthlyGross: 40000 }, '2026-10');
  assert.equal(known.grossKnown, true);
  assert.equal(known.besDeduction, 1200);
  assert.equal(known.salaryTotal, 29800);
});

test('monthly OKS includes eligible gross overtime and holiday additions while travel stays separate', () => {
  const rows = [overtime('05.10.2026', 2), record('29.10.2026', { id: 2 })];
  const summary = P.summarize(rows, {}, '2026-10');
  assert.equal(summary.grossOvertimePay, 440.40);
  assert.equal(summary.grossHolidayPay, 1101);
  assert.equal(summary.besBase, 34571.40);
  assert.equal(summary.besDeduction, 1037);
  assert.equal(summary.holidayPay, 935.85);
  assert.equal(summary.overtimePay, 374.34);
  assert.equal(summary.salaryTotal, 27974.35);
  assert.equal(summary.combinedTotal, 32348.69);
  const noTravel = P.summarize(rows, { payrollTravelPay: 0 }, '2026-10');
  assert.equal(noTravel.besBase, summary.besBase);
  assert.equal(noTravel.besDeduction, summary.besDeduction);
  assert.equal(round(summary.combinedTotal - noTravel.combinedTotal), 4000);
});

test('OKS rates remain configurable and contributions discard every fractional lira', () => {
  assert.equal(P.summarize([], { payrollBesRate: 0 }, '2026-10').besDeduction, 0);
  assert.equal(P.summarize([], { payrollBesRate: '3,68' }, '2026-10').besDeduction, 1215);
  assert.equal(P.summarize([], { payrollBesRate: 4 }, '2026-10').besDeduction, 1321);
  const boundary = P.summarize([], {
    ...custom, payrollMonthlyGross: 33333.20, payrollBesRate: 3
  }, '2026-10');
  // 33333.20 × 3% = 999.996: rounding to cents before truncation would wrongly make 1000.
  assert.equal(boundary.besDeduction, 999);
});

test('gross mode displays its full gross entitlement before taxes, SGK and OKS', () => {
  const summary = P.summarize([overtime('05.10.2026', 10)], {
    payrollSalaryBasis: 'gross'
  }, '2026-10');
  assert.equal(summary.baseSalary, 33030);
  assert.equal(summary.overtimePay, 2202);
  assert.equal(summary.besBase, 35232);
  assert.equal(summary.besDeduction, 1056);
  assert.equal(summary.appliedBesDeduction, 0);
  assert.equal(summary.salaryTotal, 33030);
  assert.equal(summary.combinedTotal, 39232);
});

test('OKS applies the yearly PEK ceiling and prorates that ceiling for unpaid days', () => {
  for (const [year, dailyCeiling] of [[2025, 6501.38], [2026, 9909]]) {
    const summary = P.summarize([overtime('05.10.' + year, 100000)], {
      payrollSalaryBasis: 'gross', payrollWeeklyRestDay: -1
    }, year + '-10');
    assert.equal(summary.pekCeiling, round(dailyCeiling * 30));
    assert.equal(summary.besBase, round(dailyCeiling * 30));
    assert.equal(summary.besDeduction, Math.floor(dailyCeiling * 30 * 0.03));
    const partial = P.summarize([
      overtime('05.10.' + year, 100000),
      record('06.10.' + year, { id: 2, attendance: 'İzinliyim', payroll: { unpaid: true } })
    ], { payrollSalaryBasis: 'gross', payrollWeeklyRestDay: -1 }, year + '-10');
    assert.equal(partial.insuredDays, 29);
    assert.equal(partial.pekCeiling, round(dailyCeiling * 29));
    assert.equal(partial.besBase, partial.pekCeiling);
    assert.equal(partial.besDeduction, Math.floor(partial.pekCeiling * 0.03));
  }
});

test('the reference daily amount applies the same capped OKS as an empty month', () => {
  const settings = { payrollSalaryMode: 'custom', payrollMonthlySalary: 100000, payrollMonthlyGross: 500000 };
  const summary = P.summarize([], settings, '2026-10');
  close(P.rates(settings, 2026, 10).netDailyRate, summary.salaryTotal / 30);
});

test('daily fractional absence deductions reconcile exactly with the monthly total', () => {
  const rows = [absent('05.10.2026'), absent('28.10.2026'), absent('29.10.2026')];
  const summary = P.summarize(rows, {
    ...custom, payrollMonthlySalary: 31000
  }, '2026-10');
  assert.equal(summary.unpaidDays, 1.5);
  assert.equal(summary.deductions, 1550);
  close(summary.details.reduce((total, detail) => total + detail.deduction, 0), 1550);
  close(summary.dailyBreakdown.reduce((total, row) => total + row.netDailyPay, 0), -1550);
  assert.equal(summary.details.every(detail => detail.besDeduction === 0), true);
  assert.equal(summary.salaryTotal, 29450);
});

test('a fully unpaid 31-day month stops deductions at the monthly wage and has no OKS', () => {
  const rows = Array.from({ length: 31 }, (_, i) => record((i + 1) + '.10.2026', {
    id: i + 1, attendance: 'İzinliyim', payroll: { unpaid: true }
  }));
  const summary = P.summarize(rows, { payrollTravelPay: 0 }, '2026-10');
  assert.equal(summary.deductions, 28075.50);
  assert.equal(summary.paidGross, 0);
  assert.equal(summary.insuredDays, 0);
  assert.equal(summary.besDeduction, 0);
  assert.equal(summary.salaryTotal, 0);
  assert.equal(summary.combinedTotal, 0);
  close(summary.details.reduce((total, detail) => total + detail.deduction, 0), 28075.50);
  assert.equal(summary.details.every(detail => detail.netDailyPay <= 0), true);
});

test('duplicate dates and month boundaries cannot multiply earnings or deductions', () => {
  const rows = [
    record('30.09.2026'), record('29.10.2026', { id: 2 }),
    absent('29.10.2026'), record('01.11.2026', { id: 3 }),
    record('32.10.2026', { id: 4 })
  ];
  const summary = P.summarize(rows, custom, '2026-10');
  assert.equal(summary.records.length, 1);
  assert.equal(summary.records[0].id, 2);
  assert.equal(summary.holidayPay, 750);
  assert.equal(summary.unpaidDays, 0);
  assert.ok(summary.warnings.some(message => message.includes('birden fazla')));
  assert.equal(P.holidayForDate('29.02.2026').known, false);
  assert.throws(() => P.summarize([], {}, '2026-13'));
});

test('saved future or past records are independent of asOf and net estimates explain their limits', () => {
  const rows = [overtime('29.10.2026', 10, { hoursKind: 'worked' })];
  const before = P.summarize(rows, {}, '2026-10', '01.01.2025');
  const after = P.summarize(rows, {}, '2026-10', '01.01.2030');
  assert.equal(before.salaryTotal, after.salaryTotal);
  assert.equal(before.overtimePay, after.overtimePay);
  assert.equal(before.combinedTotal, after.combinedTotal);
  assert.ok(before.warnings.some(message => message.includes('kümülatif vergi')));
  assert.equal(P.holidayForDate('19.03.2026').fraction, 0.5);
  assert.equal(P.holidayForDate('20.03.2026').fraction, 1);
  assert.equal(P.holidayForDate('27.05.2026').fraction, 1);
  assert.equal(P.holidayForDate('30.03.2025').fraction, 1);
});
