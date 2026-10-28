// UI regression checks with a browser-local fake Supabase. No live account is used.
// Run: node tests/browser-smoke.cjs (set PLAYWRIGHT_MODULE/BROWSER_EXECUTABLE if needed).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

function browserLibrary() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", "playwright-core",
    path.join(process.env.LOCALAPPDATA || "", "Programs/Antigravity IDE/resources/app/node_modules/playwright")].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
  }
  throw new Error("Playwright is unavailable. Set PLAYWRIGHT_MODULE to an existing installation.");
}

async function run() {
  const { chromium } = browserLibrary();
  const root = path.resolve(__dirname, "..");
  const server = http.createServer((request, response) => {
    const filename = path.resolve(root, "." + decodeURIComponent(request.url.split("?")[0]));
    if (!filename.startsWith(root + path.sep)) return response.writeHead(403).end();
    fs.readFile(filename, (error, data) => {
      if (error) return response.writeHead(404).end();
      const type = filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "text/html; charset=utf-8";
      response.writeHead(200, { "Content-Type": type }).end(data);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const passed = [];
  const check = (name, condition) => { assert.ok(condition, name); passed.push(name); };
  try {
    const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
    const executablePath = process.env.BROWSER_EXECUTABLE || (fs.existsSync(chrome) ? chrome : undefined);
    browser = await chromium.launch({ headless: true, executablePath, timeout: 15000 });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.route("**/*", route => route.request().url().startsWith("http://127.0.0.1:")
      ? route.continue() : route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
    await context.addInitScript(() => {
      const read = table => JSON.parse(localStorage.getItem("qa.table." + table) || "[]");
      const write = (table, rows) => localStorage.setItem("qa.table." + table, JSON.stringify(rows));
      const session = { access_token: "qa-session-only", user: { id: "qa-user", email: "qa@example.test" } };
      window.supabase = { createClient: () => ({
        auth: { getSession: async () => ({ data: { session } }), refreshSession: async () => ({ data: { session } }) },
        from: table => ({ select: () => {
          const result = () => ({ data: read(table), error: null });
          return { order: async () => result(), then: (yes, no) => Promise.resolve(result()).then(yes, no) };
        } })
      }) };
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, options = {}) => {
        const url = new URL(typeof input === "string" ? input : input.url, location.href);
        if (!url.pathname.startsWith("/rest/v1/")) return originalFetch(input, options);
        const table = url.pathname.split("/").at(-1);
        const method = options.method || "GET";
        let rows = read(table);
        const id = url.searchParams.get("id");
        const matching = row => id == null || (id.startsWith("in.(")
          ? id.slice(4, -1).split(",").includes(String(row.id)) : String(row.id) === id.replace(/^eq\./, ""));
        if (method === "POST") {
          if (table === "work_tracking" && window.__qaDelayWork) {
            const delay = window.__qaDelayWork;
            window.__qaDelayWork = 0;
            window.__qaWorkPending = true;
            await new Promise(resolve => setTimeout(resolve, delay));
            window.__qaWorkPending = false;
            rows = read(table);
          }
          const record = JSON.parse(options.body);
          rows = [...rows.filter(row => String(row.id) !== String(record.id)), record];
          write(table, rows);
          return new Response(JSON.stringify([record]), { status: 201 });
        }
        if (method === "DELETE") { write(table, rows.filter(row => !matching(row))); return new Response(null, { status: 204 }); }
        if (method === "PATCH") {
          const patch = JSON.parse(options.body);
          const selected = row => matching(row) && (!url.searchParams.has("archive_id") ||
            (url.searchParams.get("archive_id") === "is.null" ? !row.archive_id : row.archive_id === url.searchParams.get("archive_id").replace(/^eq\."?|"$/g, "")));
          rows = rows.map(row => selected(row) ? { ...row, ...patch } : row);
          write(table, rows);
          return new Response(JSON.stringify(rows.filter(matching)), { status: 200 });
        }
        return new Response(JSON.stringify(rows.filter(matching)), { status: 200 });
      };
    });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-10-28T12:00:00Z") });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && !message.text().includes("404")) errors.push(message.text()); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin + "/index.html#/tasks");
    await page.locator("#quickTaskInput").fill("Yenilemede korunan görev");
    await page.locator("#quickTaskBtn").click();
    await page.waitForFunction(() => Warman.store.get().tasks.length === 1);
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    check("new task survives a fresh page load", await page.locator(".task-row .title").textContent() === "Yenilemede korunan görev");
    await page.locator(".task-row .title").click();
    await page.locator("#dDesc").fill("Kalıcı açıklama");
    await page.locator("#dDesc").dispatchEvent("change");
    await page.locator("#dPriority").selectOption("high");
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    check("task description and priority survive reload", await page.evaluate(() => Warman.store.get().tasks[0].description === "Kalıcı açıklama" && Warman.store.get().tasks[0].priority === "high"));

    await page.goto(origin + "/index.html#/work");
    await page.locator("#salaryMonth").fill("2026-10");
    await page.locator("#salaryMonth").dispatchEvent("change");
    check("schedule and break controls are absent", await page.locator('#wStart,#wEnd,#wBreak,#payStart,#payEnd,#payBreak,input[type="time"]').count() === 0);
    check("period labels describe days and overtime hours", await page.locator("#view").textContent().then(text => text.includes("Çalışılan gün") && text.includes("Mesai yapılan saat")));
    check("daily salary uses a 30-day wage month", await page.locator("#dailySalary").textContent().then(text => text.includes("935,85")));
    const visibleEarned = async () => Number((await page.locator("#salaryAccrued").textContent()).replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
    const saveDay = async (date, description, overtime, attendance = "İşe geldim") => {
      await page.locator("#wDate").fill(date);
      await page.locator("#wDate").dispatchEvent("change");
      await page.locator(`[data-k="attendance"][data-v="${attendance}"]`).click();
      if (overtime) {
        const otYes = page.locator('[data-k="overtime"][data-v="Mesai yaptım"]');
        if (await otYes.count()) await otYes.click();
        await page.locator("#wHours").fill(overtime);
      } else {
        const otNo = page.locator('[data-k="overtime"][data-v="Mesai yapmadım"]');
        if (await otNo.count()) await otNo.click();
      }
      await page.locator("#wDesc").fill(description);
      await page.locator("#wSave").click();
      await page.waitForFunction(text => Warman.store.get().work.some(row => row.description === text), description);
    };
    const deleteDay = async date => {
      const id = await page.evaluate(value => Warman.store.get().work.find(row => row.date === value).id, date);
      await page.locator(`[data-del="${id}"]`).click();
      await page.locator(".modal-overlay [data-yes]").click();
      await page.waitForFunction(value => !Warman.store.get().work.some(row => row.date === value), date);
    };
    const editDay = async (date, description, attendance, unpaid = false, nextDate) => {
      const id = await page.evaluate(value => Warman.store.get().work.find(row => row.date === value).id, date);
      await page.locator(`[data-edit="${id}"]`).click();
      if (nextDate) {
        await page.locator("#wDate").fill(nextDate);
        await page.locator("#wDate").dispatchEvent("change");
      }
      await page.locator(`[data-k="attendance"][data-v="${attendance}"]`).click();
      if (attendance === "İzinliyim") await page.locator("#wUnpaid").setChecked(unpaid);
      await page.locator("#wDesc").fill(description);
      await page.locator("#wSave").click();
      await page.waitForFunction(text => Warman.store.get().work.some(row => row.description === text), description);
    };
    const monthlyNet = 27084.60;
    const oneDayShort = 26181.78;
    check("empty month visibly starts at the monthly wage", Math.abs(await visibleEarned() - monthlyNet) < 0.02);
    await page.locator("#wDate").fill("31.10.2026");
    await page.locator("#wDate").dispatchEvent("change");
    check("saturday form asks hours worked that day", await page.locator("label[for=wHours]").textContent() === "Cumartesi günü geldin. Kaç saat çalıştın?");
    await saveDay("31.10.2026", "Cumartesi 10 saat", "10");
    const saturday = await page.evaluate(() => Warman.payroll.recordDetails(Warman.store.get().work.find(row => row.date === "31.10.2026"), Warman.payroll.defaults(2026)));
    check("saturday 10 hours stay 10 hours at 1.5x and are not doubled", saturday.dayKind === "saturday" && saturday.overtimeHours === 10 && Math.abs(saturday.overtimePay - 2202) < 0.02);
    await deleteDay("31.10.2026");
    await saveDay("20.10.2026", "İlk günlük kazanç");
    const oneDayEarned = await visibleEarned();
    check("saving one ordinary date keeps the monthly wage", Math.abs(oneDayEarned - monthlyNet) < 0.02);
    await saveDay("21.10.2026", "İkinci günlük kazanç");
    const twoDaysEarned = await visibleEarned();
    check("saving a second ordinary date does not stack extra monthly wage", Math.abs(twoDaysEarned - monthlyNet) < 0.03);
    await deleteDay("21.10.2026");
    check("deleting a worked date keeps the monthly wage", Math.abs(await visibleEarned() - monthlyNet) < 0.02);
    await editDay("20.10.2026", "Tarihi taşınan kayıt", "İşe geldim", false, "22.10.2026");
    check("changing a record date keeps the monthly wage", await page.evaluate(() => Warman.store.get().work.length === 1 && Warman.store.get().work[0].date === "22.10.2026") && Math.abs(await visibleEarned() - monthlyNet) < 0.03);
    await editDay("22.10.2026", "Gelinmeyen gün kazandırmaz", "Gelmedim");
    check("marking a recorded date absent deducts exactly one calendar day", Math.abs(await visibleEarned() - oneDayShort) < 0.03);
    await editDay("22.10.2026", "Ücretli izin kazancı", "İzinliyim");
    check("paid leave keeps the monthly wage", Math.abs(await visibleEarned() - monthlyNet) < 0.03);
    await editDay("22.10.2026", "Ücretsiz izin kazandırmaz", "İzinliyim", true);
    check("changing paid leave to unpaid deducts exactly one calendar day", Math.abs(await visibleEarned() - oneDayShort) < 0.03);
    await deleteDay("22.10.2026");
    await saveDay("29.10.2026", "Gelecek tarihli kaydedilen tatil");
    check("a saved future holiday adds its extra on top of the monthly wage", await visibleEarned() > monthlyNet + 800);
    await deleteDay("29.10.2026");
    check("removing all records returns visible salary to the monthly wage", Math.abs(await visibleEarned() - monthlyNet) < 0.02);
    await saveDay("01.09.2026", "Geçmiş ayın tek kaydı");
    check("a past month with one saved day still shows the monthly wage", Math.abs(await visibleEarned() - monthlyNet) < 0.03);
    await deleteDay("01.09.2026");
    await page.locator("#salaryMonth").fill("2026-10");
    await page.locator("#salaryMonth").dispatchEvent("change");
    await saveDay("28.10.2026", "Yarım resmi tatil");
    await saveDay("29.10.2026", "Tam resmi tatil");
    await saveDay("27.10.2026", "Normal gün fazla mesai", "2");
    await saveDay("26.10.2026", "Bin saat mesai kabul edilir", "1000");
    const getSummary = () => page.evaluate(() => Warman.payroll.summarize(Warman.store.get().work, Warman.payroll.defaults(2026), "2026-10"));
    const summary = await getSummary();
    check("October daily rate uses a 30-day wage month", summary.salaryDays === 30 && Math.abs(summary.dailyRate - 28075.5 / 30) < 0.001);
    check("full and half holidays retain their daily wage additions", summary.holidayDays === 1.5 && summary.holidayPay === 1403.78);
    check("arbitrary 1000 overtime hours are counted without shift limits", summary.overtimeHours === 1002 && Math.abs(summary.overtimePay - 220640.4) < 0.02);
    check("BES applies to prorated gross after absence deductions", Math.abs(summary.besDeduction - 990.90) < 0.02);
    check("salary total excludes cash overtime and travel", summary.accruedDays === 4 && summary.unpaidDays === 0 && summary.salaryTotal === summary.total && summary.accruedHolidayPay === 1403.78 && Math.abs(summary.accruedBaseSalary - 28075.5) < 0.02 && Math.abs(summary.salaryTotal - (28075.5 + 1403.78 - 990.90)) < 0.02);
    check("overtime and travel stay in separate pockets", Math.abs(summary.overtimePay - 220640.4) < 0.02 && summary.travelPay === 4000);
    const accruedText = await page.locator("#salaryAccrued").textContent();
    check("accrued salary is prominently displayed", accruedText.includes(summary.salaryTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
    check("overtime pocket is shown separately", (await page.locator("#overtimeAccrued").textContent()).includes(summary.overtimePay.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
    check("travel pocket shows 4000", (await page.locator("#travelAccrued").textContent()).includes("4.000,00"));
    check("combined total sums salary overtime and travel", Math.abs(summary.combinedTotal - (summary.salaryTotal + summary.overtimePay + summary.travelPay)) < 0.02 && (await page.locator("#combinedAccrued").textContent()).includes(summary.combinedTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
    const beforeSameDayUpdate = await visibleEarned();
    await saveDay("27.10.2026", "Aynı gün tek kazanç olarak güncellenir", "2");
    check("saving the same date updates one contribution without doubling salary", await page.evaluate(() => Warman.store.get().work.length === 4) && await visibleEarned() === beforeSameDayUpdate);
    const earnedBeforeReload = await visibleEarned();
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    check("visible recorded salary survives a fresh page load", await visibleEarned() === earnedBeforeReload);
    check("overtime and readable descriptions survive reload", await page.evaluate(() => Warman.store.get().work.length === 4 && Warman.store.get().work.find(row => row.date === "26.10.2026").overtime_hours === "1000"));
    const holidayId = await page.evaluate(() => Warman.store.get().work.find(row => row.date === "29.10.2026").id);
    const thousandId = await page.evaluate(() => Warman.store.get().work.find(row => row.date === "26.10.2026").id);
    await page.locator(`[data-edit="${thousandId}"]`).click();
    check("edit restores unrestricted numeric overtime", await page.locator("#wHours").inputValue() === "1000");
    await page.locator("#wHours").fill("1001,5");
    await page.locator("#wDesc").fill("Bin saatin üstünde küsuratlı mesai");
    await page.locator("#wSave").click();
    await page.waitForFunction(() => Warman.store.get().work.some(row => row.description === "Bin saatin üstünde küsuratlı mesai"));
    check("editing fractional overtime above 1000 updates one record", await page.evaluate(() => Warman.store.get().work.length === 4 && Warman.store.get().work.find(row => row.date === "26.10.2026").overtime_hours === "1001.5"));
    await page.locator("#salaryDetails").click();
    check("period detail includes daily amounts and BES", await page.locator(".modal-overlay").textContent().then(text => text.includes("28.10.2026") && text.includes("29.10.2026") && text.includes("BES")));
    await page.locator(".modal-overlay [data-x]").click();
    await page.locator("#exportExcel").click();
    const csvPromise = page.waitForEvent("download");
    await page.locator("[data-csv]").click();
    const csvDownload = await csvPromise;
    const csvText = fs.readFileSync(await csvDownload.path(), "utf8").replace(/^\uFEFF/, "");
    const csvRows = csvText.trim().split(/\r?\n/);
    check("CSV contains only date and overtime hours", csvRows[0] === "Tarih;Mesai saati" && csvRows.every(row => row.split(";").length === 2) && csvText.includes("26.10.2026;1001,5"));
    await page.locator("#exportExcel").click();
    const xlsPromise = page.waitForEvent("download");
    await page.locator("[data-xls]").click();
    const xlsDownload = await xlsPromise;
    const xlsText = fs.readFileSync(await xlsDownload.path(), "utf8");
    check("Excel has exactly two columns with the entered overtime", (xlsText.match(/<th>/g) || []).length === 2 && xlsText.includes("Mesai saati") && xlsText.includes("1001.5"));
    await page.locator(".salary-settings summary").click();
    await page.locator("#payMode").selectOption("custom");
    await page.locator("#paySalary").fill("30000");
    await page.locator("#payBesRate").fill("0");
    await page.locator("#salarySettingsForm button[type=submit]").click();
    check("BES can be disabled and daily amount updates", await page.locator("#dailySalary").textContent().then(text => text.includes("1.000,00")));
    await page.locator(".salary-settings summary").click();
    await page.locator("#payMode").selectOption("minimum");
    await page.locator("#payBasis").selectOption("gross");
    await page.locator("#payBesRate").fill("3");
    check("gross minimum wage updates amount input", await page.locator("#paySalary").inputValue() === "33030");
    await page.locator("#salarySettingsForm button[type=submit]").click();
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    check("salary and BES settings survive reload", await page.evaluate(() => Warman.store.get().settings.payrollMonths["2026-10"].payrollSalaryBasis === "gross" && Number(Warman.store.get().settings.payrollMonths["2026-10"].payrollBesRate) === 3));
    await page.locator("#nextMonth").click();
    check("another month without records still shows its monthly wage", Math.abs(await visibleEarned() - 27084.60) < 0.03);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll(".work-quick > .card")].map(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })) }));
    check("390px viewport has no page horizontal overflow", mobile.scroll <= mobile.width && mobile.cards.every(card => card.left >= 0 && card.right <= mobile.width));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      const rows = JSON.parse(localStorage.getItem("qa.table.work_tracking"));
      const index = rows.findIndex(row => row.date === "29.10.2026");
      const record = Warman.api.normalizeWork(rows[index]);
      record.payroll.holidayName = '<img id=qa-injected src=x onerror=window.__qaMarkupExecuted=1>';
      rows[index] = Warman.api.serializeWork(record);
      localStorage.setItem("qa.table.work_tracking", JSON.stringify(rows));
    });
    await page.locator("#salaryMonth").fill("2026-10");
    await page.locator("#salaryMonth").dispatchEvent("change");
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    check("stored payroll metadata is rendered as literal text", await page.locator(".work-table").textContent().then(text => text.includes("<img id=qa-injected")) && await page.locator("#qa-injected").count() === 0);
    await page.locator(`[data-edit="${holidayId}"]`).click();
    check("editing malformed metadata cannot inject HTML", await page.locator("#qa-injected").count() === 0 && !await page.evaluate(() => window.__qaMarkupExecuted));
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    await saveDay("01.11.2026", "Kasım kaydı arşivlenmemeli", "1");
    check("recording a date in a future month keeps that month's wage", Math.abs(await visibleEarned() - 27084.60) < 0.03);
    await page.locator("#wDate").fill("02.11.2026");
    await page.locator("#wDate").dispatchEvent("change");
    await page.locator("#wDesc").fill("Gecikmeli kaydetme");
    await page.evaluate(() => { window.__qaDelayWork = 700; });
    await page.locator("#wSave").click();
    await page.waitForFunction(() => window.__qaWorkPending);
    await page.locator('.nav-item[data-route="tasks"]').click();
    await page.waitForFunction(() => Warman.store.get().work.some(row => row.description === "Gecikmeli kaydetme"));
    check("late work save preserves task route and rendered view", await page.locator("#quickTaskInput").count() === 1 && await page.locator("#wSave").count() === 0 && await page.evaluate(() => location.hash === "#/tasks"));
    await page.locator('.nav-item[data-route="work"]').click();
    await page.locator("#salaryMonth").fill("2026-10");
    await page.locator("#salaryMonth").dispatchEvent("change");
    page.once("dialog", dialog => dialog.accept("Ekim 2026 test arşivi"));
    await page.locator("#closePeriod").click();
    await page.locator(".modal-overlay [data-yes]").click();
    await page.waitForFunction(() => Warman.store.get().work.filter(row => row.archive_id).length === 4);
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    check("closing October archives only its four records after reload", await page.evaluate(() => {
      const rows = Warman.store.get().work;
      return rows.filter(row => row.archive_id === "Ekim 2026 test arşivi" && row.date.endsWith(".10.2026")).length === 4
        && rows.filter(row => !row.archive_id && row.date.endsWith(".11.2026")).length === 2;
    }));

    const legacyTests = await context.newPage();
    legacyTests.on("pageerror", error => errors.push(error.message));
    await legacyTests.goto(origin + "/tests/unit.html");
    const legacyResult = await legacyTests.evaluate(() => window.__WARMAN_TEST__);
    check("existing browser unit suite still passes", legacyResult?.passed >= 21 && legacyResult.failed === 0);
    await legacyTests.close();
    check("no browser runtime errors", errors.length === 0);
    console.log(JSON.stringify({ passed: passed.length, checks: passed, legacyResult, mobile, errors }, null, 2));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
