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
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const custom = { payrollSalaryMode: 'custom', payrollMonthlySalary: 31000 };
const fullCustom = round(31000 - 31000 * 0.03);
const customDay = round(31000 / 30);
const absentCustom = round(31000 - customDay - round((31000 - customDay) * 0.03));
const fullMin = round(28075.50 - 33030 * 0.03);
const absentMin = round(28075.50 - round(28075.50 / 30) - round((33030 - round(33030 / 30)) * 0.03));

test('minimum salary keeps yearly rates and empty months still show the monthly wage', () => {
  const net = P.summarize([], {}, '2026-10', '28.10.2026');
  const gross = P.summarize([], { payrollSalaryBasis: 'gross' }, '2026-10', '28.10.2026');
  assert.equal(net.baseSalary, 28075.50);
  assert.equal(gross.baseSalary, 33030);
  close(net.dailyRate, 28075.50 / 30);
  close(net.hourlyRate, 146.8);
  close(gross.hourlyRate, 146.8);
  assert.equal(net.besDeduction, 990.90);
  assert.equal(net.total, fullMin);
  assert.equal(net.salaryTotal, fullMin);
  assert.equal(net.travelPay, 4000);
  assert.equal(net.overtimePay, 0);
  assert.equal(net.combinedTotal, round(fullMin + 4000));
  assert.equal(net.accruedTotal, fullMin);
  assert.equal(net.recordedDays, 0);
  assert.equal(net.payableDays, 0);
  assert.equal(net.unpaidDays, 0);
  assert.equal(net.dailyBreakdown.length, 0);
  assert.equal(net.besRate, 3);
  assert.equal(P.summarize([], {}, '2025-01', '28.10.2026').baseSalary, 22104.67);
});

test('unknown minimum-wage years require a custom salary without silently reusing another year', () => {
  const future = P.summarize([], {}, '2027-01', '28.10.2026');
  assert.equal(future.salaryKnown, false);
  assert.equal(future.baseSalary, 0);
  assert.ok(future.warnings.length >= 1);
  assert.equal(P.summarize([], { payrollSalaryMode: 'custom', payrollMonthlySalary: '40000,50' }, '2027-01', '28.10.2026').baseSalary, 40000.50);
});

test('daily wage always uses a 30-day month, including February and 31-day months', () => {
  const s = { payrollSalaryMode: 'custom', payrollMonthlySalary: 30000, payrollBesRate: 0 };
  const months = [['2026-02', 28], ['2024-02', 29], ['2026-04', 30], ['2026-10', 31]];
  for (const [month, days] of months) {
    const summary = P.summarize([], s, month, '01.01.2028');
    assert.equal(summary.daysInMonth, days);
    assert.equal(summary.salaryDays, 30);
    close(summary.dailyRate, 30000 / 30);
    assert.equal(summary.total, 30000);
    const rows = Array.from({ length: days }, (_, i) => record(`${i + 1}.${month.slice(5)}.${month.slice(0, 4)}`, { id: i + 1, payroll: { holidayFraction: 0 } }));
    const full = P.summarize(rows, s, month);
    assert.equal(full.total, 30000);
    assert.equal(full.unpaidDays, 0);
    const oneAbsent = P.summarize([record(`1.${month.slice(5)}.${month.slice(0, 4)}`, { attendance: 'Gelmedim' })], s, month);
    assert.equal(oneAbsent.total, 29000);
  }
});

test('1000 entered overtime hours count unchanged on weekdays, with holiday hours at the rest-day rate', () => {
  const s = { payrollSalaryMode: 'custom', payrollMonthlySalary: 22500 };
  const weekday = P.recordDetails(record('05.10.2026', { overtime: 'Mesai yaptım', overtime_hours: '1000' }), s);
  assert.equal(weekday.overtimeHours, 1000);
  assert.equal(weekday.overtimePay, 150000);
  assert.equal(weekday.dayKind, 'weekday');
  const holiday = P.recordDetails(record('29.10.2026', { overtime: 'Mesai yaptım', overtime_hours: '1000' }), s);
  assert.equal(holiday.overtimeHours, 1000);
  assert.equal(holiday.overtimePay, 200000);
  assert.equal(holiday.dayKind, 'holiday');
});

test('saturday work hours are overtime at 1.5 and are not doubled as a weekday plus overtime', () => {
  const sat = P.recordDetails(record('31.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 10 }), {});
  assert.equal(sat.dayKind, 'saturday');
  assert.equal(sat.overtimeHours, 10);
  assert.equal(sat.overtimePay, round(10 * 146.8 * 1.5));
  const weekday = P.recordDetails(record('30.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 10 }), {});
  assert.equal(weekday.dayKind, 'weekday');
  assert.equal(weekday.overtimePay, sat.overtimePay);
  const cameOnly = P.recordDetails(record('31.10.2026'), {});
  assert.equal(cameOnly.overtimeHours, 0);
  assert.equal(cameOnly.overtimePay, 0);
});

test('sunday hours use the 2x rest-day rate', () => {
  const sun = P.recordDetails(record('01.11.2026', { overtime: 'Mesai yaptım', overtime_hours: 10 }), {});
  assert.equal(sun.dayKind, 'sunday');
  assert.equal(sun.overtimePay, round(10 * 146.8 * 2));
});

test('decimal commas and hours:minutes stay exact with no artificial clock-duration maximum', () => {
  const s = { payrollSalaryMode: 'custom', payrollMonthlySalary: 22500 };
  for (const input of ['1,5', '1.5', '1:30']) {
    const d = P.recordDetails(record('05.10.2026', { overtime: 'Mesai yaptım', overtime_hours: input }), s);
    assert.equal(d.overtimeHours, 1.5);
    assert.equal(d.overtimePay, 225);
  }
  assert.equal(P.parseHours('1000:30'), 1000.5);
  assert.equal(P.parseHours('not a number'), 0);
  assert.equal(P.parseHours(Infinity), 0);
  const precise = P.summarize([record('05.10.2026', { overtime: 'Mesai yaptım', overtime_hours: '1000.123456' })], custom, '2026-10', '28.10.2026');
  assert.equal(precise.overtimeHours, 1000.123456);
});

test('overtime quantities are not rejected by attendance choices', () => {
  const d = P.recordDetails(record('05.10.2026', { attendance: 'Gelmedim', overtime: 'Mesai yaptım', overtime_hours: 1000 }), {});
  assert.equal(d.overtimeHours, 1000);
  assert.equal(d.workedHours, 0);
  assert.equal(d.unpaidDays, 1);
  assert.equal(d.dailyPay, d.overtimePay);
  assert.equal(d.besDeduction, 0);
});

test('old clock records remain readable but break durations no longer reduce hours', () => {
  const d = P.recordDetails(record('05.10.2026', { payroll: { startTime: '08:30', endTime: '18:30', breakMinutes: 60 } }), {});
  assert.equal(d.workedHours, 10);
  assert.equal(P.recordDetails(record('05.10.2026', { payroll: { workedHours: '1000' } }), {}).workedHours, 1000);
  const overnight = P.recordDetails(record('05.10.2026', { payroll: { startTime: '22:00', endTime: '06:00', breakMinutes: 30 } }), {});
  assert.equal(overnight.workedHours, 8);
});

test('worked full and half holidays add the selected daily fraction without shift-clock restrictions', () => {
  const full = P.recordDetails(record('29.10.2026'), custom);
  assert.equal(full.holidayPay, customDay);
  assert.equal(full.dailyPay, round(customDay * 2));
  const half = P.recordDetails(record('28.10.2026', { payroll: { endTime: '13:00' } }), custom);
  assert.equal(half.holidayPay, round(customDay / 2));
  assert.equal(half.dailyPay, round(customDay + customDay / 2));
  assert.equal(P.recordDetails(record('29.10.2026', { attendance: 'İzinliyim' }), custom).holidayPay, 0);
  assert.equal(P.holidayForDate('19.03.2026').fraction, 0.5);
  assert.equal(P.holidayForDate('20.03.2026').fraction, 1);
  assert.equal(P.holidayForDate('27.05.2026').fraction, 1);
  assert.equal(P.holidayForDate('30.03.2025').fraction, 1);
});

test('manual full, half and ordinary-day holiday selections remain authoritative', () => {
  assert.equal(P.recordDetails(record('29.10.2026', { payroll: { holidayFraction: 0 } }), custom).holidayPay, 0);
  const manual = P.recordDetails(record('05.10.2026', { payroll: { holidayFraction: 1, holidayName: 'Özel tatil' } }), custom);
  assert.equal(manual.holidayPay, customDay);
  assert.equal(manual.holidayName, 'Özel tatil');
  const manualOt = P.recordDetails(record('05.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 10, payroll: { holidayFraction: 1 } }), {});
  assert.equal(manualOt.dayKind, 'holiday');
  assert.equal(manualOt.overtimePay, round(10 * 146.8 * 2));
});

test('BES is configurable and applies to monthly salary after unpaid leave, without taxing overtime or holiday additions', () => {
  const rows = [record('05.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 2 }), record('06.10.2026', { id: 2, attendance: 'İzinliyim', payroll: { unpaid: true } }), record('29.10.2026', { id: 3 })];
  const s = P.summarize(rows, custom, '2026-10', '31.10.2026');
  assert.equal(s.deductions, customDay);
  assert.equal(s.besRate, 3);
  assert.equal(s.besDeduction, 899);
  assert.equal(s.salaryTotal, 30101);
  assert.equal(s.overtimePay, 413.33);
  assert.equal(s.total, 30101);
  assert.equal(P.summarize(rows, { ...custom, payrollBesRate: 0 }, '2026-10', '31.10.2026').besDeduction, 0);
  assert.equal(P.summarize([record('05.10.2026')], { ...custom, payrollBesRate: '2,5' }, '2026-10', '31.10.2026').besDeduction, 775);
});

test('one absence leaves monthly pay exactly one calendar day short besides overtime and holiday extras', () => {
  const worked = Array.from({ length: 25 }, (_, i) => record(`${i + 1}.10.2026`, { id: i + 1, payroll: { holidayFraction: 0 } }));
  const absent = record('26.10.2026', { id: 26, attendance: 'Gelmedim' });
  const overtime = record('27.10.2026', { id: 27, overtime: 'Mesai yaptım', overtime_hours: 2, payroll: { holidayFraction: 0 } });
  const s = P.summarize([...worked, absent, overtime], custom, '2026-10');
  assert.equal(s.unpaidDays, 1);
  assert.equal(s.deductions, customDay);
  assert.equal(s.paidBaseSalary, round(31000 - customDay));
  assert.equal(s.accruedBaseSalary, 31000);
  assert.equal(s.overtimePay, 413.33);
  assert.equal(s.besDeduction, 899);
  assert.equal(s.salaryTotal, absentCustom);
  assert.equal(s.total, absentCustom);
  const onlyAbsent = P.summarize([absent], custom, '2026-10');
  assert.equal(onlyAbsent.total, absentCustom);
  assert.equal(onlyAbsent.total, P.summarize([...worked, absent], custom, '2026-10').total);
});

test('unrecorded weekends and ordinary saved days do not reduce the monthly wage', () => {
  const s = P.summarize([record('05.10.2026'), record('27.10.2026', { id: 2 })], custom, '2026-10', '28.10.2026');
  assert.equal(s.accruedDays, 2);
  assert.equal(s.recordedDays, 2);
  assert.equal(s.payableDays, 2);
  assert.equal(s.unpaidDays, 0);
  assert.equal(s.accruedBaseSalary, 31000);
  assert.equal(s.accruedOvertimePay, 0);
  assert.equal(s.accruedBesDeduction, 930);
  assert.equal(s.accruedTotal, fullCustom);
  assert.equal(s.total, s.accruedTotal);
  assert.equal(s.dailyBreakdown.length, 2);
});

test('saved-record extras do not depend on the current day or whether the selected month is past or future', () => {
  const s = P.summarize([record('29.10.2026')], custom, '2026-10', '01.11.2026');
  assert.equal(s.accruedDays, 1);
  assert.equal(s.accruedTotal, round(fullCustom + customDay));
  assert.equal(s.accruedTotal, s.total);
  const future = P.summarize([record('29.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 1000 })], custom, '2026-10', '30.09.2026');
  assert.equal(future.accruedDays, 1);
  assert.equal(future.salaryTotal, round(fullCustom + customDay));
  assert.equal(future.overtimePay, 275555.56);
  assert.equal(future.accruedTotal, round(fullCustom + customDay));
  assert.equal(future.accruedTotal, P.summarize([record('29.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 1000 })], custom, '2026-10', '31.12.2030').accruedTotal);
  assert.equal(P.summarize([], custom, '2026-10', '31.12.2030').accruedTotal, fullCustom);
});

test('a fully unpaid month has zero salary and zero BES with exact daily reconciliation', () => {
  const rows = Array.from({ length: 31 }, (_, index) => record(`${index + 1}.10.2026`, { id: index + 1, attendance: 'İzinliyim', payroll: { unpaid: true } }));
  const s = P.summarize(rows, {}, '2026-10', '31.10.2026');
  assert.equal(s.deductions, 28075.5);
  assert.equal(s.besDeduction, 0);
  assert.equal(s.total, 0);
  close(s.details.reduce((total, detail) => total + detail.deduction, 0), s.deductions);
  assert.equal(s.details.every(detail => detail.netDailyPay <= 0), true);
});

test('monthly BES and one-day deductions reconcile without using calendar-day remainder slices', () => {
  const s = P.summarize([record('29.10.2026')], {}, '2026-10', '28.10.2026');
  assert.equal(s.besDeduction, 990.90);
  assert.equal(s.paidBaseSalary, 28075.5);
  assert.equal(s.total, round(28075.5 + s.holidayPay - 990.90));
  const absent = P.summarize([record('05.10.2026', { attendance: 'Gelmedim' })], {}, '2026-10');
  assert.equal(absent.deductions, 935.85);
  assert.equal(absent.paidBaseSalary, 27139.65);
  assert.equal(absent.total, absentMin);
  const first = P.recordDetails(record('01.10.2026'), custom).dailyBasePay;
  const last = P.recordDetails(record('31.10.2026'), custom).dailyBasePay;
  assert.equal(first, last);
  assert.equal(first, customDay);
});

test('duplicate dates, invalid records and calendar-month boundaries cannot multiply earnings', () => {
  const rows = [record('30.09.2026'), record('29.10.2026', { id: 2 }), record('29.10.2026', { id: 1 }), record('01.11.2026', { id: 3 }), record('32.10.2026', { id: 4 })];
  const s = P.summarize(rows, custom, '2026-10', '31.10.2026');
  assert.equal(s.records.length, 1);
  assert.equal(s.records[0].id, 2);
  assert.equal(s.holidayPay, customDay);
  assert.ok(s.warnings.some(warning => warning.includes('birden fazla')));
  assert.equal(P.holidayForDate('29.02.2026').known, false);
  assert.throws(() => P.summarize([], {}, '2026-13', '31.10.2026'));
  assert.equal(P.summarize([], {}, '2026-10', '31.02.2026').total, fullMin);
});

test('worked days do not stack extra monthly wage; only absences change the base', () => {
  const first = record('05.10.2026');
  const second = record('06.10.2026', { id: 2 });
  const summarize = rows => P.summarize(rows, custom, '2026-10');
  assert.equal(summarize([]).total, fullCustom);
  assert.equal(summarize([first]).total, fullCustom);
  assert.equal(summarize([first, second]).total, fullCustom);
  const absent = { ...second, attendance: 'Gelmedim' };
  assert.equal(summarize([first, absent]).total, absentCustom);
  assert.equal(summarize([first, absent]).payableDays, 1);
  assert.equal(summarize([absent]).total, absentCustom);
  assert.equal(summarize([]).total, fullCustom);
});

test('paid leave keeps the monthly wage but absent and explicitly unpaid records deduct one calendar day', () => {
  const paidLeave = record('05.10.2026', { attendance: 'İzinliyim' });
  const unpaidLeave = { ...paidLeave, payroll: { unpaid: true } };
  const absent = { ...paidLeave, attendance: 'Gelmedim' };
  assert.equal(P.recordDetails(paidLeave, custom).netDailyPay, round(customDay - round(customDay * 0.03)));
  assert.equal(P.recordDetails(unpaidLeave, custom).netDailyPay, 0);
  assert.equal(P.recordDetails(absent, custom).netDailyPay, 0);
  assert.equal(P.summarize([paidLeave], custom, '2026-10').payableDays, 1);
  assert.equal(P.summarize([paidLeave], custom, '2026-10').total, fullCustom);
  assert.equal(P.summarize([unpaidLeave], custom, '2026-10').payableDays, 0);
  assert.equal(P.summarize([unpaidLeave], custom, '2026-10').total, absentCustom);
  assert.equal(P.summarize([absent], custom, '2026-10').total, absentCustom);
});

test('updating the same saved date does not multiply its basic wage', () => {
  const first = record('05.10.2026');
  const updated = { ...first, id: 2, overtime: 'Mesai yaptım', overtime_hours: 2 };
  const s = P.summarize([first, updated], custom, '2026-10');
  assert.equal(s.recordedDays, 1);
  assert.equal(s.accruedBaseSalary, 31000);
  assert.equal(s.salaryTotal, fullCustom);
  assert.equal(s.overtimePay, 413.33);
  assert.equal(s.total, fullCustom);
});

test('BES 3.68 and 4 apply exactly to gross salary only, with travel kept as a separate 4000 pocket', () => {
  const empty = P.summarize([], {}, '2026-10');
  assert.equal(empty.travelPay, 4000);
  assert.equal(empty.salaryTotal, fullMin);
  assert.equal(empty.overtimePay, 0);
  const r368 = P.summarize([], { payrollBesRate: 3.68 }, '2026-10');
  assert.equal(r368.besRate, 3.68);
  assert.equal(r368.besDeduction, 1215.50);
  assert.equal(r368.salaryTotal, round(28075.50 - 1215.50));
  const r4 = P.summarize([], { payrollBesRate: 4 }, '2026-10');
  assert.equal(r4.besDeduction, 1321.20);
  assert.equal(r4.salaryTotal, round(28075.50 - 1321.20));
  const noTravel = P.summarize([record('05.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 2 })], { payrollBesRate: 3.68, payrollTravelPay: 0 }, '2026-10');
  assert.equal(noTravel.travelPay, 0);
  assert.equal(noTravel.overtimePay, round(2 * (33030 / 225) * 1.5));
  assert.equal(noTravel.salaryTotal, round(28075.50 - 1215.50));
});

test('September start on the 2nd and 17:30 overtime match the real 26200 salary, 957 BES and 3850 overtime', () => {
  const start = record('01.09.2026', { attendance: 'Gelmedim' });
  const overtime = record('10.09.2026', { id: 2, overtime: 'Mesai yaptım', overtime_hours: '17:30', payroll: { holidayFraction: 0 } });
  const s = P.summarize([start, overtime], {}, '2026-09');
  assert.equal(s.salaryDays, 30);
  assert.equal(s.dailyRate, 935.85);
  assert.equal(s.deductions, 935.85);
  assert.equal(s.besDeduction, 957.87);
  assert.equal(s.salaryTotal, 26181.78);
  assert.equal(s.overtimeHours, 17.5);
  assert.equal(s.overtimePay, 3853.50);
  assert.equal(s.travelPay, 4000);
  assert.equal(s.combinedTotal, 34035.28);
});
