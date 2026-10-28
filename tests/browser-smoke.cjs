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
    const saveDay = async (date, description, overtime) => {
      await page.locator("#wDate").fill(date);
      await page.locator("#wDate").dispatchEvent("change");
      if (overtime) {
        await page.locator('[data-k="overtime"][data-v="Mesai yaptım"]').click();
        await page.locator("#wHours").fill(overtime);
        await page.locator("#wEnd").fill("20:30");
      } else {
        await page.locator('[data-k="overtime"][data-v="Mesai yapmadım"]').click();
        await page.locator("#wEnd").fill("18:30");
      }
      await page.locator("#wDesc").fill(description);
      await page.locator("#wSave").click();
      await page.waitForFunction(text => Warman.store.get().work.some(row => row.description === text), description);
    };
    await saveDay("28.10.2026", "Yarım resmi tatil");
    await saveDay("29.10.2026", "Tam resmi tatil");
    await saveDay("27.10.2026", "Normal gün fazla mesai", "2");
    const getSummary = () => page.evaluate(() => Warman.payroll.summarize(Warman.store.get().work, Warman.payroll.defaults(2026), "2026-10"));
    const summary = await getSummary();
    check("October 28 half and October 29 full holiday add 1.5 daily wages", summary.holidayDays === 1.5 && summary.holidayPay === 1403.78);
    check("ordinary overtime uses hourly wage times 1.5", summary.overtimeHours === 2 && summary.overtimePay === 374.34);
    check("monthly total includes base only once", summary.total === 29853.62);
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    check("work payroll metadata and descriptions survive reload", await page.evaluate(() => Warman.store.get().work.length === 3 && Warman.store.get().work.every(row => row.payroll?.startTime === "08:30" && row.description)));
    const holidayId = await page.evaluate(() => Warman.store.get().work.find(row => row.date === "29.10.2026").id);
    await page.locator(`[data-edit="${holidayId}"]`).click();
    check("edit restores recorded shift", await page.locator("#wEnd").inputValue() === "18:30");
    await page.locator("#wDesc").fill("Düzenlenen tatil kaydı");
    await page.locator("#wSave").click();
    await page.waitForFunction(() => Warman.store.get().work.some(row => row.description === "Düzenlenen tatil kaydı"));
    check("edit updates one record without duplication", await page.evaluate(() => Warman.store.get().work.length === 3));
    await page.locator("#salaryDetails").click();
    check("period detail opens daily breakdown", await page.locator(".modal-overlay").textContent().then(text => text.includes("28.10.2026") && text.includes("29.10.2026")));
    const downloadPromise = page.waitForEvent("download");
    await page.locator("[data-payroll-csv]").click();
    const download = await downloadPromise;
    const downloadText = fs.readFileSync(await download.path(), "utf8");
    check("salary CSV exports summary and recorded days", download.suggestedFilename() === "maas-dokumu-2026-10.csv" && downloadText.includes("Maaş dönemi") && downloadText.includes("29.10.2026"));
    await page.locator(".modal-overlay [data-x]").click();
    await page.locator(".salary-settings summary").click();
    await page.locator("#payMode").selectOption("custom");
    await page.locator("#paySalary").fill("30000");
    await page.locator("#salarySettingsForm button[type=submit]").click();
    check("custom monthly salary changes the month total", await page.locator("#salaryTotal").textContent().then(text => text.includes("31.900,00")));
    await page.locator(".salary-settings summary").click();
    await page.locator("#payMode").selectOption("minimum");
    await page.locator("#payBasis").selectOption("gross");
    check("gross minimum wage updates amount input", await page.locator("#paySalary").inputValue() === "33030");
    await page.locator("#salarySettingsForm button[type=submit]").click();
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    check("salary settings survive reload", await page.evaluate(() => Warman.store.get().settings.payrollMonths["2026-10"].payrollSalaryBasis === "gross"));
    await page.locator("#nextMonth").click();
    check("next month starts with independent default salary", await page.locator("#salaryTotal").textContent().then(text => text.includes("28.075,50")));
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll(".work-quick > .card")].map(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })) }));
    check("390px viewport has no page horizontal overflow", mobile.scroll <= mobile.width && mobile.cards.every(card => card.left >= 0 && card.right <= mobile.width));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      const rows = JSON.parse(localStorage.getItem("qa.table.work_tracking"));
      const index = rows.findIndex(row => row.date === "29.10.2026");
      const record = Warman.api.normalizeWork(rows[index]);
      record.payroll.breakMinutes = '\"><img id=qa-injected src=x onerror=window.__qaMarkupExecuted=1>';
      rows[index] = Warman.api.serializeWork(record);
      localStorage.setItem("qa.table.work_tracking", JSON.stringify(rows));
    });
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    check("stored payroll metadata is rendered as literal text", await page.locator(".work-table").textContent().then(text => text.includes("<img id=qa-injected")) && await page.locator("#qa-injected").count() === 0);
    await page.locator(`[data-edit="${holidayId}"]`).click();
    check("editing malformed metadata cannot inject HTML", await page.locator("#qa-injected").count() === 0 && !await page.evaluate(() => window.__qaMarkupExecuted));
    await page.evaluate(() => {
      const rows = JSON.parse(localStorage.getItem("qa.table.work_tracking"));
      const index = rows.findIndex(row => row.date === "29.10.2026");
      const record = Warman.api.normalizeWork(rows[index]);
      record.payroll.breakMinutes = 60;
      rows[index] = Warman.api.serializeWork(record);
      localStorage.setItem("qa.table.work_tracking", JSON.stringify(rows));
    });
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    await saveDay("01.11.2026", "Kasım kaydı arşivlenmemeli");
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
    await page.waitForFunction(() => Warman.store.get().work.filter(row => row.archive_id).length === 3);
    await page.reload();
    await page.waitForFunction(() => !Warman.store.get().loading);
    check("closing October archives only its three records after reload", await page.evaluate(() => {
      const rows = Warman.store.get().work;
      return rows.filter(row => row.archive_id === "Ekim 2026 test arşivi" && row.date.endsWith(".10.2026")).length === 3
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
