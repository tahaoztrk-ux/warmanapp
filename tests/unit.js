(function () {
  const out = document.getElementById("out");
  let passed = 0, failed = 0;
  function assert(name, cond) {
    if (cond) { passed++; out.innerHTML += `<div class="ok">✔ ${name}</div>`; }
    else { failed++; out.innerHTML += `<div class="fail">✘ ${name}</div>`; }
  }
  const U = Warman.utils;

  assert("yalnızca başlık ile görev adı durur", U.parseNaturalTask("Yeni web sitesi").title === "Yeni web sitesi");
  assert("tarih yokken parseDotDate null döner", U.parseDotDate("") === null && U.parseDotDate(null) === null);
  assert("saat olmadan tarih biçer", U.formatDetailedDate("12.10.2026").includes("2026"));
  assert("tarihsiz etiket", U.formatDetailedDate("") === "Tarihsiz");

  const undated = U.sortTasks([
    { title: "B", due_date: "", due_time: "" },
    { title: "A", due_date: "12.10.2026", due_time: "09:00" }
  ]);
  assert("tarihsiz görev sıralamayı bozmaz", undated[0].title === "A" && undated[1].title === "B");

  const nl = U.parseNaturalTask("Yarın SQL toplantısını hazırla");
  assert("doğal dil tarih önerir", nl.matched && !!nl.suggestion.due_date);
  assert("doğal dil başlığı temizler", !/yarın/i.test(nl.title) && /SQL/i.test(nl.title));

  assert("1,5 saat parse", U.parseHours("1,5") === 1.5);
  assert("1.5 saat parse", U.parseHours("1.5") === 1.5);
  assert("1:30 saat parse", U.parseHours("1:30") === 1.5);
  assert("mesai toplamı küsurat kaybetmez", U.parseHours("1,5") + U.parseHours("8") === 9.5);

  const oldEnv = U.parseEnvelope(JSON.stringify([{ id: 1, text: "eski", completed: false }]));
  assert("eski subtasks dizisi okunur", oldEnv.items.length === 1 && oldEnv.items[0].text === "eski");
  const neu = U.parseEnvelope(U.encodeEnvelope([{ id: 2, text: "yeni" }], { status: "inbox" }));
  assert("v2 zarf yuvarlak dönüş", neu.items[0].text === "yeni" && neu.meta.status === "inbox");

  const task = Warman.api.normalizeTask({
    id: 1, text: "SQL sorgularını düzenle", date: "", time: "", completed: false,
    subtasks_json: JSON.stringify([])
  });
  assert("boş tarih inbox olur", task.status === "inbox" && task.due_date === "");
  const ser = Warman.api.serializeTask({
    ...task, title: "SQL sorgularını düzenle", due_date: "12.10.2026", due_time: "", subtasks: []
  });
  assert("saat olmadan tarih kaydı", ser.date === "12.10.2026" && ser.time === "");
  const round = Warman.api.normalizeTask(ser);
  assert("sonradan tarihlendirme korunur", round.due_date === "12.10.2026");

  const done = Warman.api.normalizeTask({ id: 2, text: "x", date: "01.01.2026", time: "10:00", completed: true, subtasks_json: "[]" });
  assert("eski tamamlanan görev done", done.status === "done");

  const sample = { date: "12.10.2026", attendance: "İşe geldim", overtime: "Mesai yaptım", overtime_hours: "1.5", location: "Merkez", archive_id: null };
  assert("excel sadece mesai süzmesi", Warman.work.matchExport(sample, { overtime: "yes", locations: ["Merkez"] }));
  assert("excel tarih aralığı dışı kalır", !Warman.work.matchExport(sample, { from: "01.11.2026", to: "30.11.2026", overtime: "yes", locations: ["Merkez"] }));
  assert("excel konum süzmesi", !Warman.work.matchExport(sample, { locations: ["İvedik"] }));
  assert("excel gelme süzmesi", !Warman.work.matchExport({ ...sample, attendance: "Gelmedim" }, { attendance: "İşe geldim", locations: ["Merkez"] }));

  out.innerHTML += `\n${passed} geçti, ${failed} kaldı.`;
  window.__WARMAN_TEST__ = { passed, failed };
})();
