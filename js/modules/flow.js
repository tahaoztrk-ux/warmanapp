window.Warman = window.Warman || {};
(function () {
  const U = () => Warman.utils;
  let editor = null;
  let currentId = null;
  let saveState = "saved";
  let undoStack = [];
  let redoStack = [];
  let clipboard = null;
  let autosaveTimer = null;
  let dirty = false;
  let leaving = false;

  function nodeHtml(type, data) {
    data = data || {};
    const titles = {
      start: "Başlangıç", task: "İş Adımı", decision: "Karar", email: "Bildirim",
      timer: "Bekleme", custom: "Özel Blok", end: "Bitiş"
    };
    const colors = { start: "#22c55e", task: "#2f5dff", decision: "#d97706", email: "#14b8a6", timer: "#eab308", custom: "#8b5cf6", end: "#e11d48" };
    const title = data.taskTitle || data.customTitle || data.decisionDesc || titles[type] || "Düğüm";
    const draft = (type === "email" || type === "timer") ? `<div class="badge badge-draft">Taslak / Henüz etkin değil</div>` : "";
    return `<div>
      <div class="node-header" style="border-top:3px solid ${colors[type] || "#94a3b8"}"><i class="ph ph-circle"></i> ${U().escapeHtml(titles[type] || type)}</div>
      <div class="node-content"><div class="node-title">${U().escapeHtml(title)}</div>${draft}</div>
    </div>`;
  }

  function snapshot() {
    if (!editor) return;
    undoStack.push(JSON.stringify(editor.export()));
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
  }

  function markDirty() {
    dirty = true;
    saveState = "saving";
    updateSaveUi();
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveSilent, 900);
  }

  function updateSaveUi() {
    const el = document.getElementById("flowSaveState");
    if (!el) return;
    const map = { saving: "Kaydediliyor", saved: "Kaydedildi", error: "Kayıt hatası" };
    el.innerHTML = `<span class="save-dot ${saveState}"></span> ${map[saveState] || ""}`;
  }

  async function saveSilent() {
    if (!editor || !currentId) return;
    const project = Warman.store.projectById(currentId);
    if (!project) return;
    const data = editor.export();
    project.flow_data = JSON.stringify(data);
    try {
      await Warman.projects.persist(project);
      dirty = false;
      saveState = "saved";
      updateSaveUi();
    } catch (err) {
      saveState = "error";
      updateSaveUi();
      Warman.ui.toast("Akış kaydedilemedi: " + err.message, "error");
    }
  }

  function applyVisuals() {
    if (!editor) return;
    const data = editor.export();
    const nodes = Object.values(data.drawflow?.Home?.data || {});
    nodes.forEach((node) => {
      const dom = document.getElementById("node-" + node.id);
      if (!dom) return;
      dom.classList.remove("node-done", "node-blocked", "node-progress");
      const st = node.data?.status || (node.data?.completed ? "done" : "not_started");
      if (st === "done" || node.data?.completed) {
        dom.classList.add("node-done");
        document.querySelectorAll(".connection.node_out_node-" + node.id).forEach((c) => c.classList.add("path-done"));
      } else {
        document.querySelectorAll(".connection.node_out_node-" + node.id).forEach((c) => c.classList.remove("path-done"));
      }
      if (st === "blocked") dom.classList.add("node-blocked");
      if (st === "in_progress") dom.classList.add("node-progress");
    });
    detectCycles(data);
  }

  function detectCycles(data) {
    const nodes = data.drawflow?.Home?.data || {};
    const visiting = new Set();
    const seen = new Set();
    let cycle = false;
    function dfs(id) {
      if (visiting.has(id)) { cycle = true; return; }
      if (seen.has(id)) return;
      visiting.add(id); seen.add(id);
      const n = nodes[id];
      Object.values(n?.outputs || {}).forEach((out) => {
        (out.connections || []).forEach((c) => dfs(String(c.node)));
      });
      visiting.delete(id);
    }
    Object.keys(nodes).forEach(dfs);
    const warn = document.getElementById("flowCycleWarn");
    if (warn) warn.style.display = cycle ? "inline" : "none";
  }

  function inspect(nodeId) {
    const info = editor.getNodeFromId(nodeId);
    const d = info.data || {};
    const tasks = Warman.store.get().tasks.filter((t) => String(t.project_id) === String(currentId) || !t.project_id);
    const panel = document.getElementById("flowInspect");
    if (!panel) return;
    panel.innerHTML = `
      <h3>Düğüm</h3>
      <div class="field"><label>Başlık</label><input id="nTitle" value="${U().escapeHtml(d.taskTitle || d.customTitle || d.decisionDesc || d.to || d.time || "")}"></div>
      <div class="field"><label>Açıklama</label><textarea id="nDesc">${U().escapeHtml(d.taskDesc || d.customDesc || "")}</textarea></div>
      <div class="field"><label>Durum</label>
        <select id="nStatus">${Warman.config.nodeStatuses.map((s) => `<option value="${s.id}" ${(d.status|| (d.completed?"done":"not_started"))===s.id?"selected":""}>${s.label}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Bağlı görev</label>
        <select id="nTask"><option value="">Bağımsız blok</option>${tasks.map((t) => `<option value="${t.id}" ${String(d.taskId)===String(t.id)?"selected":""}>${U().escapeHtml(t.title)}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Bağımlılık türü</label>
        <select id="nDep">
          <option value="related" ${d.depType==="related"?"selected":""}>İlgili (engel değil)</option>
          <option value="blocks" ${d.depType!=="related"?"selected":""}>Engeller (önceki bitmeden başlama)</option>
        </select>
      </div>
      ${(info.name === "email" || info.name === "timer") ? `<p class="badge badge-draft">Bu blok görsel taslaktır. E-posta veya zamanlayıcı çalıştırmaz.</p>` : ""}
      ${info.name === "decision" ? `<p style="font-size:12px;color:var(--text-muted)">Çıkış 1: Evet · Çıkış 2: Hayır. Koşulu başlıkta tanımlayın.</p>` : ""}
      <div class="chip-row" style="margin-top:10px">
        <button class="btn btn-sm" id="nDup">Çoğalt</button>
        <button class="btn btn-sm btn-danger" id="nDel">Sil</button>
      </div>
    `;
    const patch = async (key, val) => {
      snapshot();
      const data = { ...info.data, [key]: val };
      if (key === "nTitle" || key === "taskTitle") {
        data.taskTitle = val; data.customTitle = val; data.decisionDesc = val;
      }
      if (key === "status") data.completed = val === "done";
      editor.updateNodeDataFromId(nodeId, data);
      const node = editor.getNodeFromId(nodeId);
      const html = nodeHtml(node.name, data);
      const wrap = document.querySelector(`#node-${nodeId} .drawflow_content_node`);
      if (wrap) wrap.innerHTML = html;
      if (data.taskId && (key === "status" || key === "completed")) {
        const task = Warman.store.taskById(data.taskId);
        if (task) {
          task.completed = !!data.completed;
          task.status = data.completed ? "done" : (task.status === "done" ? "in_progress" : task.status);
          await Warman.tasks.persist(task);
        }
      }
      applyVisuals();
      markDirty();
    };
    panel.querySelector("#nTitle").onchange = (e) => patch("taskTitle", e.target.value);
    panel.querySelector("#nDesc").onchange = (e) => patch("taskDesc", e.target.value);
    panel.querySelector("#nStatus").onchange = (e) => patch("status", e.target.value);
    panel.querySelector("#nTask").onchange = (e) => patch("taskId", e.target.value || null);
    panel.querySelector("#nDep").onchange = (e) => patch("depType", e.target.value);
    panel.querySelector("#nDup").onclick = () => duplicateNode(nodeId);
    panel.querySelector("#nDel").onclick = () => { snapshot(); editor.removeNodeId("node-" + nodeId); markDirty(); };
  }

  function duplicateNode(id) {
    const n = editor.getNodeFromId(id);
    snapshot();
    editor.addNode(n.name, Object.keys(n.inputs||{}).length, Object.keys(n.outputs||{}).length, n.pos_x + 40, n.pos_y + 40, n.class, JSON.parse(JSON.stringify(n.data||{})), nodeHtml(n.name, n.data));
    markDirty();
  }

  function addNode(type, x, y) {
    snapshot();
    const ins = type === "start" ? 0 : 1;
    const outs = type === "end" ? 0 : type === "decision" ? 2 : 1;
    const data = { completed: false, status: "not_started", depType: "related", taskTitle: "", taskDesc: "" };
    editor.addNode(type, ins, outs, x, y, type + "-node", data, nodeHtml(type, data));
    markDirty();
  }

  function defaultFlow(project) {
    const startHtml = nodeHtml("start", { taskTitle: project.title });
    let last = editor.addNode("start", 0, 1, 50, 140, "start-node", { taskTitle: project.title, completed: false, status: "not_started" }, startHtml);
    const tasks = Warman.store.get().tasks.filter((t) => String(t.project_id) === String(project.id));
    const steps = tasks.length ? tasks.map((t) => ({ text: t.title, taskId: t.id })) : (project.subtasks || []).map((s) => ({ text: s.text }));
    steps.forEach((s, i) => {
      const data = { taskTitle: s.text, taskId: s.taskId || null, completed: false, status: "not_started", depType: "blocks" };
      const id = editor.addNode("task", 1, 1, 360 + i * 280, 140, "task-node", data, nodeHtml("task", data));
      editor.addConnection(last, id, "output_1", "input_1");
      last = id;
    });
  }

  function bindCanvas() {
    const canvas = document.getElementById("drawflow");
    canvas.addEventListener("dragover", (e) => e.preventDefault());
    canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("node_type");
      if (!type || !editor) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / editor.zoom;
      const y = (e.clientY - rect.top) / editor.zoom;
      addNode(type, x - 80, y - 20);
    });
    editor.on("nodeSelected", (id) => inspect(id));
    editor.on("nodeCreated", markDirty);
    editor.on("nodeRemoved", markDirty);
    editor.on("connectionCreated", () => { applyVisuals(); markDirty(); });
    editor.on("connectionRemoved", markDirty);
    editor.on("nodeMoved", markDirty);
  }

  window.addEventListener("beforeunload", (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  async function leave() {
    if (!editor) return;
    if (dirty) await saveSilent();
    document.removeEventListener("keydown", flowKeys);
    editor = null;
    currentId = null;
  }

  function render(view, id, opts) {
    opts = opts || {};
    const project = Warman.store.projectById(id);
    if (!project) {
      view.innerHTML = `<div class="empty"><p>Proje bulunamadı.</p></div>`;
      return;
    }
    currentId = Number(id);
    view.innerHTML = `
      <div class="view-head">
        <div>
          <p style="color:var(--text-muted);font-size:12px"><a href="#/projects/${project.id}">${U().escapeHtml(project.title)}</a> / Akış</p>
          <h1>Akış şeması</h1>
        </div>
        <div class="view-actions">
          <span id="flowSaveState" class="btn btn-ghost btn-sm"><span class="save-dot saved"></span> Kaydedildi</span>
          <button class="btn" id="flowUndo">Geri al</button>
          <button class="btn" id="flowFit">Sığdır</button>
          <button class="btn" id="flowFs"><i class="ph ph-corners-out"></i></button>
          <button class="btn" id="flowExport">JSON</button>
          <button class="btn btn-primary" id="flowSave">Kaydet</button>
        </div>
      </div>
      <div class="flow-shell" id="flowShell">
        <aside class="flow-palette">
          <h3>Bloklar</h3>
          ${[["task","İş Adımı"],["decision","Karar"],["email","Bildirim"],["timer","Bekleme"],["custom","Özel"],["end","Bitiş"]].map(([k,l]) => `<div class="drag-item" draggable="true" data-node="${k}"><i class="ph ph-plus"></i> ${l}</div>`).join("")}
          <p id="flowCycleWarn" style="display:none;color:var(--danger);font-size:12px;margin-top:10px">Döngüsel bağlantı tespit edildi.</p>
        </aside>
        <div class="flow-canvas">
          <div class="flow-status"><span class="save-dot saved"></span> Çizim alanı</div>
          <div id="drawflow"></div>
          <div class="flow-tools">
            <button class="icon-btn" id="zOut"><i class="ph ph-minus"></i></button>
            <button class="icon-btn" id="zReset"><i class="ph ph-corners-out"></i></button>
            <button class="icon-btn" id="zIn"><i class="ph ph-plus"></i></button>
          </div>
        </div>
        <aside class="flow-inspect" id="flowInspect">
          <h3>Detay</h3>
          <p style="color:var(--text-muted);font-size:13px">Bir düğüm seçin. Formları düğümün üstünde doldurmanıza gerek yok.</p>
        </aside>
      </div>
    `;
    view.querySelectorAll(".drag-item").forEach((el) => {
      el.addEventListener("dragstart", (e) => e.dataTransfer.setData("node_type", el.dataset.node));
    });
    const idEl = document.getElementById("drawflow");
    editor = new Drawflow(idEl);
    editor.reroute = true;
    editor.start();
    try {
      if (project.flow_data) editor.import(JSON.parse(project.flow_data));
      else defaultFlow(project);
    } catch (e) {
      defaultFlow(project);
    }
    bindCanvas();
    setTimeout(applyVisuals, 80);
    view.querySelector("#zOut").onclick = () => editor.zoom_out();
    view.querySelector("#zIn").onclick = () => editor.zoom_in();
    view.querySelector("#zReset").onclick = () => editor.zoom_reset();
    view.querySelector("#flowFit").onclick = () => editor.zoom_reset();
    view.querySelector("#flowUndo").onclick = () => {
      const prev = undoStack.pop();
      if (!prev) return;
      redoStack.push(JSON.stringify(editor.export()));
      editor.import(JSON.parse(prev));
      markDirty();
    };
    view.querySelector("#flowSave").onclick = saveSilent;
    view.querySelector("#flowExport").onclick = () => U().download(`${project.title}-flow.json`, JSON.stringify(editor.export(), null, 2), "application/json");
    view.querySelector("#flowFs").onclick = () => document.getElementById("flowShell").classList.toggle("wide");
    document.removeEventListener("keydown", flowKeys);
    document.addEventListener("keydown", flowKeys);
  }

  function flowKeys(e) {
    if (!editor) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveSilent();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      const sel = editor.node_selected;
      if (sel) clipboard = editor.getNodeFromId(sel.id.replace("node-", ""));
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && clipboard) {
      duplicateNode(clipboard.id);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      document.getElementById("flowUndo")?.click();
    }
  }

  Warman.flow = { render, leave, saveSilent, applyVisuals };
})();
