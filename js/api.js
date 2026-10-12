window.Warman = window.Warman || {};
(function () {
  let client = null;

  function init() {
    client = window.supabase.createClient(Warman.config.supabaseUrl, Warman.config.supabaseKey);
    Warman.api.client = client;
    return client;
  }

  async function token() {
    let { data } = await client.auth.getSession();
    let session = data.session;
    if (session?.expires_at && session.expires_at * 1000 < Date.now() + 20000) {
      const refreshed = await client.auth.refreshSession();
      session = refreshed.data.session;
    }
    return session?.access_token || null;
  }

  function asRows(value) {
    return Array.isArray(value) ? value : [];
  }

  async function loadTable(name) {
    const first = await client.from(name).select("*").order("id", { ascending: false });
    if (!first.error) return asRows(first.data);
    const retry = await client.from(name).select("*");
    if (retry.error) throw new Error((retry.error.message || first.error.message || name) + " yüklenemedi");
    return asRows(retry.data);
  }

  async function request(endpoint, method, data) {
    const access = await token();
    if (!access) throw new Error("Oturum bulunamadı.");
    const options = {
      method: method || "GET",
      headers: {
        apikey: Warman.config.supabaseKey,
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      }
    };
    if (data != null && method !== "GET" && method !== "DELETE") options.body = JSON.stringify(data);
    const res = await fetch(`${Warman.config.supabaseUrl}/rest/v1/${endpoint}`, options);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || res.statusText || "Veritabanı hatası");
    }
    if (method === "DELETE" || res.status === 204) return true;
    const text = await res.text();
    return text ? JSON.parse(text) : true;
  }

  function normalizeTask(row) {
    const env = Warman.utils.parseEnvelope(row.subtasks_json);
    const meta = env.meta || {};
    const completed = !!row.completed || meta.status === "done";
    let status = meta.status;
    if (!status) {
      if (completed) status = "done";
      else if (!row.date) status = "inbox";
      else status = "planned";
    }
    return {
      id: row.id,
      title: row.text || "",
      description: meta.description || "",
      status,
      priority: meta.priority || "normal",
      project_id: meta.project_id || null,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      due_date: row.date || meta.due_date || "",
      due_time: row.time || meta.due_time || "",
      subtasks: env.items || [],
      notes: meta.notes || "",
      estimated_minutes: meta.estimated_minutes || "",
      pinned: !!meta.pinned,
      favorite: !!meta.favorite,
      archived: !!meta.archived,
      recurrence: meta.recurrence || null,
      depends_on: meta.depends_on || [],
      created_at: meta.created_at || null,
      updated_at: meta.updated_at || null,
      completed_at: meta.completed_at || (completed ? new Date().toISOString() : null),
      completed,
      history: meta.history || [],
      last_spawned_from: meta.last_spawned_from || null
    };
  }

  function serializeTask(task) {
    const meta = {
      description: task.description || "",
      status: task.status,
      priority: task.priority || "normal",
      project_id: task.project_id || null,
      tags: task.tags || [],
      due_date: task.due_date || "",
      due_time: task.due_time || "",
      notes: task.notes || "",
      estimated_minutes: task.estimated_minutes || "",
      pinned: !!task.pinned,
      favorite: !!task.favorite,
      archived: !!task.archived,
      recurrence: task.recurrence || null,
      depends_on: task.depends_on || [],
      created_at: task.created_at,
      updated_at: task.updated_at,
      completed_at: task.completed_at,
      history: (task.history || []).slice(0, 30),
      last_spawned_from: task.last_spawned_from || null
    };
    return {
      id: task.id,
      text: task.title,
      date: task.due_date || "",
      time: task.due_time || "",
      completed: !!task.completed || task.status === "done",
      subtasks_json: Warman.utils.encodeEnvelope(task.subtasks || [], meta)
    };
  }

  function normalizeProject(row) {
    const env = Warman.utils.parseEnvelope(row.subtasks_json);
    const meta = env.meta || {};
    return {
      id: row.id,
      title: row.title || "",
      date: row.date || "",
      description: row.description || "",
      subtasks: env.items || [],
      flow_data: typeof row.flow_data === "string" ? (row.flow_data || "") : (row.flow_data ? JSON.stringify(row.flow_data) : ""),
      status: meta.status || "active",
      priority: meta.priority || "normal",
      notes: meta.notes || "",
      start_date: meta.start_date || row.date || "",
      end_date: meta.end_date || "",
      files: meta.files || [],
      updated_at: meta.updated_at || null
    };
  }

  function serializeProject(project) {
    const meta = {
      status: project.status || "active",
      priority: project.priority || "normal",
      notes: project.notes || "",
      start_date: project.start_date || "",
      end_date: project.end_date || "",
      files: project.files || [],
      updated_at: project.updated_at
    };
    const payload = {
      id: project.id,
      title: project.title,
      date: project.date || project.start_date || "",
      description: project.description || "",
      subtasks_json: Warman.utils.encodeEnvelope(project.subtasks || [], meta)
    };
    if (project.flow_data) {
      payload.flow_data = typeof project.flow_data === "string" ? project.flow_data : JSON.stringify(project.flow_data);
    }
    return payload;
  }

  async function loadAll() {
    const errors = [];
    const safe = async (name, normalize) => {
      try {
        const rows = await loadTable(name);
        return normalize ? rows.map((row) => {
          try { return normalize(row); }
          catch (err) {
            console.error(name, row, err);
            return null;
          }
        }).filter(Boolean) : rows;
      } catch (err) {
        errors.push(err.message || name);
        return [];
      }
    };
    const [projects, tasks, work] = await Promise.all([
      safe("projects", normalizeProject),
      safe("assignments", normalizeTask),
      safe("work_tracking")
    ]);
    if (errors.length && !projects.length && !tasks.length && !work.length) {
      throw new Error(errors.join(" · "));
    }
    return { projects, tasks, work, errors };
  }

  async function saveTask(task) {
    const payload = serializeTask(task);
    const existing = Warman.store.get().tasks.some((t) => Number(t.id) === Number(task.id));
    if (existing) {
      const rows = await request(`assignments?id=eq.${task.id}`, "PATCH", payload);
      return rows?.[0] ? normalizeTask(rows[0]) : task;
    }
    const rows = await request("assignments", "POST", payload);
    return rows?.[0] ? normalizeTask(rows[0]) : task;
  }

  async function deleteTask(id) {
    await request(`assignments?id=eq.${id}`, "DELETE");
    return true;
  }

  async function saveProject(project) {
    const payload = serializeProject(project);
    const existing = Warman.store.get().projects.some((p) => Number(p.id) === Number(project.id));
    if (existing) {
      const rows = await request(`projects?id=eq.${project.id}`, "PATCH", payload);
      return rows?.[0] ? normalizeProject(rows[0]) : project;
    }
    const rows = await request("projects", "POST", payload);
    return rows?.[0] ? normalizeProject(rows[0]) : project;
  }

  async function deleteProject(id) {
    await request(`projects?id=eq.${id}`, "DELETE");
    return true;
  }

  async function saveWork(record) {
    const payload = {
      id: record.id,
      date: record.date,
      attendance: record.attendance,
      overtime: record.overtime,
      overtime_hours: record.overtime_hours,
      location: record.location,
      description: record.description || "",
      archive_id: record.archive_id ?? null
    };
    const existing = Warman.store.get().work.some((w) => Number(w.id) === Number(record.id));
    if (existing) {
      const rows = await request(`work_tracking?id=eq.${record.id}`, "PATCH", payload);
      return rows?.[0] || record;
    }
    const rows = await request("work_tracking", "POST", payload);
    return rows?.[0] || record;
  }

  async function deleteWork(id) {
    await request(`work_tracking?id=eq.${id}`, "DELETE");
    return true;
  }

  async function patchWorkArchive(filter, body) {
    return request(`work_tracking?${filter}`, "PATCH", body);
  }

  Warman.api = {
    init, request, loadAll, saveTask, deleteTask, saveProject, deleteProject, saveWork, deleteWork,
    patchWorkArchive, normalizeTask, serializeTask, normalizeProject, serializeProject, token
  };
})();
