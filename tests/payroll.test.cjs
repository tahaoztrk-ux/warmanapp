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

test('2026 minimum wage is net by default, and gross is a distinct calculation basis', () => {
  const net = P.summarize([], {}, '2026-10');
  const gross = P.summarize([], { payrollSalaryBasis: 'gross' }, '2026-10');
  assert.equal(net.baseSalary, 28075.50);
  assert.equal(gross.baseSalary, 33030);
  close(net.dailyRate, 935.85);
  close(gross.hourlyRate, 146.8);
  assert.equal(net.total, net.baseSalary);
});

test('2025 is calculated using its historical minimum, unverified years require custom salary', () => {
  assert.equal(P.summarize([], {}, '2025-01').baseSalary, 22104.67);
  const future = P.summarize([], {}, '2027-01');
  assert.equal(future.salaryKnown, false);
  assert.equal(future.baseSalary, 0);
  assert.ok(future.warnings.length >= 1);
  assert.equal(P.summarize([], { payrollSalaryMode: 'custom', payrollMonthlySalary: '40000,50' }, '2027-01').baseSalary, 40000.50);
});

test('08:30–18:30 excludes the one-hour break and does not invent daily overtime', () => {
  const d = P.recordDetails(record('05.10.2026'), {});
  assert.equal(d.workedHours, 9);
  assert.equal(d.overtimeHours, 0);
  const summary = P.summarize([record('05.10.2026')], {}, '2026-10');
  assert.equal(summary.workedDays, 1);
  assert.equal(summary.total, 28075.5);
});

test('explicit ordinary overtime earns 1.5 times hourly pay with fractional input', () => {
  const r = record('05.10.2026', { overtime: 'Mesai yaptım', overtime_hours: '1:30', payroll: { endTime: '20:00' } });
  const d = P.recordDetails(r, { payrollSalaryMode: 'custom', payrollMonthlySalary: 22500 });
  assert.equal(d.overtimeHours, 1.5);
  assert.equal(d.overtimePay, 225);
  assert.equal(d.workedHours, 10.5);
});

test('a worked public holiday adds one daily wage; monthly salary already contains the first wage', () => {
  const s = P.summarize([record('29.10.2026')], { payrollSalaryMode: 'custom', payrollMonthlySalary: 30000 }, '2026-10');
  assert.equal(s.holidayDays, 1);
  assert.equal(s.holidayPay, 1000);
  assert.equal(s.total, 31000);
  const unworked = P.summarize([record('29.10.2026', { attendance: 'İzinliyim' })], { payrollSalaryMode: 'custom', payrollMonthlySalary: 30000 }, '2026-10');
  assert.equal(unworked.holidayPay, 0);
  assert.equal(unworked.total, 30000);
});

test('half-day holidays pay half a daily wage only when the employee works after 13:00', () => {
  const settings = { payrollSalaryMode: 'custom', payrollMonthlySalary: 30000 };
  assert.equal(P.recordDetails(record('28.10.2026'), settings).holidayPay, 500);
  const morning = record('28.10.2026', { payroll: { endTime: '13:00', breakMinutes: 0 } });
  assert.equal(P.recordDetails(morning, settings).holidayPay, 0);
  assert.equal(P.holidayForDate('19.03.2026').fraction, 0.5);
  assert.equal(P.holidayForDate('20.03.2026').fraction, 1);
  assert.equal(P.holidayForDate('27.05.2026').fraction, 1);
  assert.equal(P.holidayForDate('30.03.2025').fraction, 1);
  assert.equal(P.holidayForDate('02.02.2026').fraction, 0); // Kandil is not a statutory holiday.
});

test('manual holiday overrides persist ordinary/full/half decisions', () => {
  assert.equal(P.recordDetails(record('29.10.2026', { payroll: { holidayFraction: 0 } }), {}).holidayPay, 0);
  const manual = P.recordDetails(record('05.10.2026', { payroll: { holidayFraction: 1, holidayName: 'Özel tatil' } }), {});
  assert.equal(manual.holidayPay, 935.85);
  assert.equal(manual.holidayName, 'Özel tatil');
});

test('normal holiday shift is never counted again as ordinary overtime', () => {
  const normal = P.recordDetails(record('29.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 9 }), {});
  assert.equal(normal.overtimeHours, 0);
  assert.equal(normal.holidayPay, 935.85);
  assert.ok(normal.warnings.length);
  const extended = P.recordDetails(record('29.10.2026', {
    overtime: 'Mesai yaptım', overtime_hours: 2, payroll: { endTime: '20:30' }
  }), { payrollSalaryMode: 'custom', payrollMonthlySalary: 22500 });
  assert.equal(extended.overtimeHours, 2);
  assert.equal(extended.overtimePay, 300);
  assert.equal(extended.holidayPay, 750);
});

test('absence and paid leave have no automatic deduction; explicit unpaid leave does', () => {
  const rows = [
    record('05.10.2026', { attendance: 'Gelmedim', overtime: 'Mesai yaptım', overtime_hours: 4 }),
    record('06.10.2026', { id: 2, attendance: 'İzinliyim' }),
    record('07.10.2026', { id: 3, attendance: 'İzinliyim', payroll: { unpaid: true } })
  ];
  const summary = P.summarize(rows, { payrollSalaryMode: 'custom', payrollMonthlySalary: 30000 }, '2026-10');
  assert.equal(summary.unpaidDays, 1);
  assert.equal(summary.deductions, 1000);
  assert.equal(summary.overtimeHours, 0);
  assert.equal(summary.workedHours, 0);
  assert.equal(summary.total, 29000);
});

test('calendar month filtering excludes archived dates outside the month and rejects invalid dates', () => {
  const rows = [record('30.09.2026'), record('29.10.2026', { id: 2 }), record('01.11.2026', { id: 3 }), record('32.10.2026', { id: 4 })];
  const summary = P.summarize(rows, {}, '2026-10');
  assert.equal(summary.records.length, 1);
  assert.equal(summary.records[0].id, 2);
  assert.equal(P.holidayForDate('29.02.2026').known, false);
  assert.throws(() => P.summarize([], {}, '2026-13'));
});

test('duplicate records for the same date cannot double a holiday wage', () => {
  const s = P.summarize([record('29.10.2026', { id: 2 }), record('29.10.2026', { id: 1 })], {}, '2026-10');
  assert.equal(s.records.length, 1);
  assert.equal(s.records[0].id, 2);
  assert.equal(s.holidayPay, 935.85);
  assert.ok(s.warnings.some((warning) => warning.includes('birden fazla')));
});

test('invalid shifts and impossible overtime never inflate pay', () => {
  const invalid = P.recordDetails(record('05.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 99, payroll: { startTime: '25:00' } }), {});
  assert.equal(invalid.workedHours, 0);
  assert.equal(invalid.overtimeHours, 0);
  assert.ok(invalid.warnings.length);
  const tooLong = P.recordDetails(record('05.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 99 }), {});
  assert.equal(tooLong.overtimeHours, 9);
  assert.ok(tooLong.warnings.length);
});

test('a full month of unpaid leave cannot deduct more than the monthly base', () => {
  const rows = Array.from({ length: 31 }, (_, index) => record(`${index + 1}.10.2026`, {
    id: index + 1, attendance: 'İzinliyim', payroll: { unpaid: true }
  }));
  const s = P.summarize(rows, {}, '2026-10');
  assert.equal(s.unpaidDays, 31);
  assert.equal(s.deductions, 28075.5);
  assert.equal(s.total, 0);
  close(s.details.reduce((total, detail) => total + detail.deduction, 0), s.deductions);
  close(s.baseSalary + s.details.reduce((total, detail) => total + detail.extraPay, 0), s.total);
  assert.equal(s.details[30].deduction, 0);
  assert.ok(s.warnings.some((warning) => warning.includes('aylık ücretle sınırlandı')));
});

test('overnight shifts keep correct elapsed hours and flag the holiday attribution limitation', () => {
  const d = P.recordDetails(record('05.10.2026', { payroll: { startTime: '22:00', endTime: '06:00', breakMinutes: 30 } }), {});
  assert.equal(d.workedHours, 7.5);
  assert.ok(d.warnings.some((warning) => warning.includes('Gece')));
});
