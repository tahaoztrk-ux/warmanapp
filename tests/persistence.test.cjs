const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const clone = (value) => JSON.parse(JSON.stringify(value));

function browser(database = { assignments: [], projects: [], work_tracking: [] }, options = {}) {
  const requests = [];
  const notices = [];
  const storage = new Map();
  let undo;
  const sandbox = {
    console, setTimeout, clearTimeout, URL, Date,
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    document: { documentElement: { setAttribute() {} } },
    supabase: { createClient: () => ({
      auth: {
        getSession: async () => ({ data: {
          session: options.noSession ? null : {
            access_token: "test-user-session", user: { id: "test-user" }, expires_at: options.expired ? 1 : undefined
          }
        } }),
        refreshSession: async () => ({ data: { session: { access_token: "refreshed-session" } } })
      },
      from: (table) => ({ select: () => {
        const read = async (ordered) => {
          if ((options.tableErrors || []).includes(table) || (ordered && options.failOrder)) {
            return { error: { message: table + " erişim hatası" }, data: null };
          }
          return { error: null, data: clone(database[table]) };
        };
        return { order: () => read(true), then: (resolve, reject) => read(false).then(resolve, reject) };
      } })
    }) },
    fetch: async (input, init) => {
      const url = new URL(input);
      const table = url.pathname.split("/").pop();
      requests.push({ table, method: init.method, headers: init.headers, payload: init.body && JSON.parse(init.body) });
      if (options.reject) return { ok: false, text: async () => "Database rejected record" };
      if (options.empty) return { ok: true, status: 200, text: async () => "[]" };
      if (init.method === "GET") return { ok: true, status: 200, text: async () => JSON.stringify(database[table]) };
      if (init.method === "DELETE") {
        const id = url.searchParams.get("id").replace("eq.", "");
        database[table] = database[table].filter((row) => String(row.id) !== id);
        return { ok: true, status: 204 };
      }
      const payload = JSON.parse(init.body);
      if (init.method === "POST") {
        const index = database[table].findIndex((row) => String(row.id) === String(payload.id));
        if (index >= 0) {
          assert.equal(url.searchParams.get("on_conflict"), "id");
          assert.match(init.headers.Prefer, /resolution=merge-duplicates/);
          database[table][index] = clone(payload);
        } else database[table].push(clone(payload));
        return { ok: true, status: 201, text: async () => JSON.stringify([payload]) };
      }
      // Reproduce PostgREST's success with zero rows for an update to an absent id.
      const index = database[table].findIndex((row) => String(row.id) === String(payload.id));
      if (index >= 0) database[table][index] = clone(payload);
      return { ok: true, status: 200, text: async () => JSON.stringify(index >= 0 ? [payload] : []) };
    }
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const file of ["js/config.js", "js/utils.js", "js/store.js", "js/api.js", "js/modules/projects.js", "js/modules/tasks.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  const W = sandbox.Warman;
  W.ui = {
    toast: (...notice) => notices.push(notice), closeDetail() {},
    offerUndo: (_message, callback) => { undo = callback; }
  };
  W.router = { refresh() {} };
  W.store.set({ user: { id: "test-user" }, settings: W.store.defaultSettings() });
  W.api.init();
  return { W, database, requests, notices, undo: () => undo() };
}

test("new tasks and every detail survive a fresh browser load", async () => {
  const first = browser();
  const created = await first.W.tasks.createFromTitle("Kalıcı görev", {
    description: "Açıklama", notes: "Özel not", priority: "high", due_date: "28.10.2026", due_time: "08:30",
    tags: ["iş"], subtasks: [{ id: 22, text: "Alt görev", completed: true }]
  });
  assert.ok(created);
  assert.equal(first.requests[0].method, "POST");
  assert.equal(first.requests[0].headers.Authorization, "Bearer test-user-session");
  const reloaded = browser(first.database);
  reloaded.W.store.set(await reloaded.W.api.loadAll());
  assert.deepEqual(clone(reloaded.W.store.get().tasks), clone(first.W.store.get().tasks));
});

test("an optimistic UI row cannot turn a new task into a silent empty PATCH", async () => {
  const { W, database, requests } = browser();
  const task = { ...W.tasks.defaultsForNew(), title: "Henüz sunucuda yok" };
  W.store.set({ tasks: [task] });
  await W.api.saveTask(task);
  assert.equal(requests[0].method, "POST");
  assert.equal(database.assignments.length, 1);
});

test("projects and linked tasks survive reload; updating keeps one row", async () => {
  const { W, database } = browser();
  const project = await W.projects.create("Maaş takibi", { templateTasks: ["Önce", "Sonra"] });
  assert.ok(project);
  project.title = "Güncel proje adı";
  await W.projects.persist(project);
  const reloaded = await browser(database).W.api.loadAll();
  assert.equal(reloaded.projects.length, 1);
  assert.equal(reloaded.projects[0].title, "Güncel proje adı");
  assert.equal(reloaded.projects[0].subtasks.length, 2);
  assert.equal(reloaded.tasks.length, 2);
  assert.ok(reloaded.tasks.every((task) => task.project_id === project.id));
});

test("failed and empty database confirmations never add phantom UI records", async () => {
  for (const options of [{ reject: true }, { empty: true }]) {
    const { W, notices } = browser(undefined, options);
    assert.equal(await W.tasks.createFromTitle("Kaydedilemeyen görev"), null);
    assert.equal(await W.projects.create("Kaydedilemeyen proje"), null);
    assert.equal(W.store.get().tasks.length, 0);
    assert.equal(W.store.get().projects.length, 0);
    assert.equal(notices.length, 2);
    assert.ok(notices.every((notice) => notice[1] === "error"));
  }
});

test("task delete and undo restore the database before showing the record", async () => {
  const runtime = browser();
  const task = await runtime.W.tasks.createFromTitle("Geri al");
  await runtime.W.tasks.remove(task.id);
  assert.equal(runtime.database.assignments.length, 0);
  assert.equal(runtime.W.store.get().tasks.length, 0);
  await runtime.undo();
  const reloaded = await browser(runtime.database).W.api.loadAll();
  assert.equal(reloaded.tasks.length, 1);
  assert.equal(reloaded.tasks[0].title, "Geri al");
});

test("work payroll metadata and readable descriptions survive save, edit and reload", async () => {
  const { W, database } = browser();
  const record = {
    id: 500, date: "29.10.2026", attendance: "İşe geldim", overtime: "Mesai yaptım",
    overtime_hours: "1.5", location: "Merkez", description: "Resmi tatilde çalıştım <not>", archive_id: "Ekim 2026",
    payroll: { dayType: "holiday", startTime: "08:30", endTime: "18:30", breakMinutes: 60, paidLeave: true }
  };
  const saved = await W.api.saveWork(record);
  assert.deepEqual(clone(saved), record);
  W.store.set({ work: [saved] });
  await W.api.saveWork({ ...saved, description: "Güncellendi" });
  assert.equal(database.work_tracking.length, 1);
  assert.equal(Object.hasOwn(database.work_tracking[0], "payroll"), false);
  const reloaded = await browser(database).W.api.loadAll();
  assert.equal(reloaded.work[0].description, "Güncellendi");
  assert.deepEqual(clone(reloaded.work[0].payroll), record.payroll);
  assert.equal(reloaded.work[0].archive_id, "Ekim 2026");
});

test("legacy work descriptions, including unrelated JSON, stay intact", () => {
  const { W } = browser();
  for (const description of ["Eski not", "", '{"description":"Kullanıcının JSON notu","payroll":{}}']) {
    const normalized = W.api.normalizeWork({ id: 1, description });
    assert.equal(normalized.description, description);
    assert.equal(W.api.serializeWork(normalized).description, description);
  }
});

test("missing sessions cannot write and cannot report a successful save", async () => {
  const { W, requests } = browser(undefined, { noSession: true });
  await assert.rejects(() => W.api.saveTask({ id: 9, title: "Oturumsuz" }), /Oturum bulunamadı/);
  assert.equal(requests.length, 0);
});

test("partial table failures retain tasks and report the unavailable section", async () => {
  const database = { assignments: [{ id: 1, text: "Görev duruyor" }], projects: [], work_tracking: [] };
  const { W } = browser(database, { tableErrors: ["work_tracking"] });
  const loaded = await W.api.loadAll();
  assert.equal(loaded.tasks[0].title, "Görev duruyor");
  assert.equal(loaded.errors.length, 1);
  assert.match(loaded.errors[0], /work_tracking/);
});

test("table loading retries without ordering if sorting fails", async () => {
  const database = { assignments: [{ id: 1, text: "Tekrar yüklenir" }], projects: [], work_tracking: [] };
  const loaded = await browser(database, { failOrder: true }).W.api.loadAll();
  assert.equal(loaded.tasks.length, 1);
  assert.equal(loaded.errors.length, 0);
});

test("an expiring session is refreshed before writing", async () => {
  const { W, requests } = browser(undefined, { expired: true });
  await W.api.saveTask({ id: 9, title: "Yenilenen oturum" });
  assert.equal(requests[0].headers.Authorization, "Bearer refreshed-session");
});
