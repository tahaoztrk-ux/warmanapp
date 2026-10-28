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
const custom = { payrollSalaryMode: 'custom', payrollMonthlySalary: 31000 };

test('minimum salary keeps verified yearly net/gross values and applies default 3% BES', () => {
  const net = P.summarize([], {}, '2026-10', '28.10.2026');
  const gross = P.summarize([], { payrollSalaryBasis: 'gross' }, '2026-10', '28.10.2026');
  assert.equal(net.baseSalary, 28075.50);
  assert.equal(gross.baseSalary, 33030);
  close(net.dailyRate, 28075.50 / 31);
  close(gross.hourlyRate, 146.8);
  assert.equal(net.besDeduction, 842.27);
  assert.equal(net.total, 27233.23);
  assert.equal(P.summarize([], {}, '2025-01', '28.10.2026').baseSalary, 22104.67);
});

test('unknown minimum-wage years require a custom salary without silently reusing another year', () => {
  const future = P.summarize([], {}, '2027-01', '28.10.2026');
  assert.equal(future.salaryKnown, false);
  assert.equal(future.baseSalary, 0);
  assert.ok(future.warnings.length >= 1);
  assert.equal(P.summarize([], { payrollSalaryMode: 'custom', payrollMonthlySalary: '40000,50' }, '2027-01', '28.10.2026').baseSalary, 40000.50);
});

test('daily base uses each calendar month including leap-year February', () => {
  const s = { payrollSalaryMode: 'custom', payrollMonthlySalary: 30000, payrollBesRate: 0 };
  const months = [['2026-02', 28], ['2024-02', 29], ['2026-04', 30], ['2026-10', 31]];
  for (const [month, days] of months) {
    const summary = P.summarize([], s, month, '01.01.2028');
    assert.equal(summary.daysInMonth, days);
    close(summary.dailyRate, 30000 / days);
    assert.equal(summary.total, 30000);
    close(summary.dailyBreakdown.reduce((sum, day) => sum + day.dailyBasePay, 0), 30000);
  }
});

test('1000 entered overtime hours count unchanged on normal days and public holidays', () => {
  for (const date of ['05.10.2026', '29.10.2026']) {
    const d = P.recordDetails(record(date, { overtime: 'Mesai yaptım', overtime_hours: '1000' }), { payrollSalaryMode: 'custom', payrollMonthlySalary: 22500 });
    assert.equal(d.overtimeHours, 1000);
    assert.equal(d.overtimePay, 150000);
    assert.equal(d.warnings.length, 0);
  }
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
  assert.equal(full.holidayPay, 1000);
  assert.equal(full.dailyPay, 2000);
  const half = P.recordDetails(record('28.10.2026', { payroll: { endTime: '13:00' } }), custom);
  assert.equal(half.holidayPay, 500);
  assert.equal(half.dailyPay, 1500);
  assert.equal(P.recordDetails(record('29.10.2026', { attendance: 'İzinliyim' }), custom).holidayPay, 0);
  assert.equal(P.holidayForDate('19.03.2026').fraction, 0.5);
  assert.equal(P.holidayForDate('20.03.2026').fraction, 1);
  assert.equal(P.holidayForDate('27.05.2026').fraction, 1);
  assert.equal(P.holidayForDate('30.03.2025').fraction, 1);
});

test('manual full, half and ordinary-day holiday selections remain authoritative', () => {
  assert.equal(P.recordDetails(record('29.10.2026', { payroll: { holidayFraction: 0 } }), custom).holidayPay, 0);
  const manual = P.recordDetails(record('05.10.2026', { payroll: { holidayFraction: 1, holidayName: 'Özel tatil' } }), custom);
  assert.equal(manual.holidayPay, 1000);
  assert.equal(manual.holidayName, 'Özel tatil');
});

test('BES is configurable and applies to salary after unpaid leave, without taxing overtime or holiday additions', () => {
  const rows = [record('05.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 2 }), record('06.10.2026', { id: 2, attendance: 'İzinliyim', payroll: { unpaid: true } }), record('29.10.2026', { id: 3 })];
  const s = P.summarize(rows, custom, '2026-10', '31.10.2026');
  assert.equal(s.deductions, 1000);
  assert.equal(s.besRate, 3);
  assert.equal(s.besDeduction, 900);
  assert.equal(s.total, 30513.33);
  assert.equal(P.summarize(rows, { ...custom, payrollBesRate: 0 }, '2026-10', '31.10.2026').besDeduction, 0);
  assert.equal(P.summarize([], { ...custom, payrollBesRate: '2,5' }, '2026-10', '31.10.2026').besDeduction, 775);
});

test('current-month accrual includes calendar days through today and only recorded extras up to that date', () => {
  const rows = [record('27.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 2 }), record('29.10.2026', { id: 2 })];
  const s = P.summarize(rows, custom, '2026-10', '28.10.2026');
  assert.equal(s.accruedDays, 28);
  assert.equal(s.accruedBaseSalary, 28000);
  assert.equal(s.accruedOvertimePay, 413.33);
  assert.equal(s.accruedHolidayPay, 0);
  assert.equal(s.accruedBesDeduction, 840);
  assert.equal(s.accruedTotal, 27573.33);
  assert.equal(s.total, 31483.33);
});

test('past months accrue their full calendar salary, future months accrue zero even with future records', () => {
  const s = P.summarize([record('29.10.2026')], custom, '2026-10', '01.11.2026');
  assert.equal(s.accruedDays, 31);
  assert.equal(s.accruedTotal, s.total);
  const future = P.summarize([record('29.10.2026', { overtime: 'Mesai yaptım', overtime_hours: 1000 })], custom, '2026-10', '30.09.2026');
  assert.equal(future.accruedDays, 0);
  assert.equal(future.accruedTotal, 0);
});

test('a fully unpaid month has zero salary and zero BES with exact daily reconciliation', () => {
  const rows = Array.from({ length: 31 }, (_, index) => record(`${index + 1}.10.2026`, { id: index + 1, attendance: 'İzinliyim', payroll: { unpaid: true } }));
  const s = P.summarize(rows, {}, '2026-10', '31.10.2026');
  assert.equal(s.deductions, 28075.5);
  assert.equal(s.besDeduction, 0);
  assert.equal(s.total, 0);
  close(s.details.reduce((total, detail) => total + detail.deduction, 0), s.deductions);
  assert.equal(s.details.every(detail => detail.netDailyPay === 0), true);
});

test('daily BES and base rounding reconcile to monthly and accrued totals', () => {
  const s = P.summarize([record('29.10.2026')], {}, '2026-10', '28.10.2026');
  close(s.dailyBreakdown.reduce((total, day) => total + day.besDeduction, 0), s.besDeduction);
  close(s.dailyBreakdown.reduce((total, day) => total + day.netDailyPay, 0), s.total);
  close(s.dailyBreakdown.slice(0, 28).reduce((total, day) => total + day.netDailyPay, 0), s.accruedTotal);
});

test('duplicate dates, invalid records and calendar-month boundaries cannot multiply earnings', () => {
  const rows = [record('30.09.2026'), record('29.10.2026', { id: 2 }), record('29.10.2026', { id: 1 }), record('01.11.2026', { id: 3 }), record('32.10.2026', { id: 4 })];
  const s = P.summarize(rows, custom, '2026-10', '31.10.2026');
  assert.equal(s.records.length, 1);
  assert.equal(s.records[0].id, 2);
  assert.equal(s.holidayPay, 1000);
  assert.ok(s.warnings.some(warning => warning.includes('birden fazla')));
  assert.equal(P.holidayForDate('29.02.2026').known, false);
  assert.throws(() => P.summarize([], {}, '2026-13', '31.10.2026'));
  assert.throws(() => P.summarize([], {}, '2026-10', '31.02.2026'));
});
