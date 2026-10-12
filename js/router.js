window.Warman = window.Warman || {};
(function () {
  function parse() {
    const raw = (location.hash || "#/overview").replace(/^#/, "");
    const [path, query] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    const params = Object.fromEntries(new URLSearchParams(query || ""));
    let name = parts[0] || "overview";
    let id = null;
    let tab = parts[2] || params.tab || "tasks";
    if (name === "projects" && parts[1]) {
      id = parts[1];
      name = parts[2] === "flow" ? "flow" : "project";
      tab = parts[2] === "flow" ? "flow" : (parts[2] || "tasks");
    }
    return { name, id, tab, params, parts };
  }

  function go(name, extra) {
    extra = extra || {};
    let hash = "#/" + name;
    if (name === "project" && extra.id) hash = `#/projects/${extra.id}${extra.tab && extra.tab !== "tasks" ? "/" + extra.tab : ""}`;
    if (name === "flow") {
      const id = extra.id || Warman.store.get().selectedProjectId || Warman.store.get().projects[0]?.id;
      hash = id ? `#/projects/${id}/flow` : "#/projects";
    }
    if (extra.view) hash += (hash.includes("?") ? "&" : "?") + "view=" + extra.view;
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  async function render() {
    const route = parse();
    const view = document.getElementById("view");
    Warman.ui.markNav(route.name === "project" ? "projects" : route.name);
    Warman.ui.closeNav();
    if (route.name !== "flow") await Warman.flow?.leave?.();
    const map = {
      overview: () => Warman.dashboard.render(view),
      inbox: () => Warman.tasks.render(view, { mode: "inbox" }),
      tasks: () => Warman.tasks.render(view, { mode: "all", view: route.params.view || "list" }),
      projects: () => Warman.projects.renderList(view),
      project: () => Warman.projects.renderWorkspace(view, route.id, route.tab),
      flow: () => {
        const id = route.id || Warman.store.get().selectedProjectId || Warman.store.get().projects[0]?.id;
        if (!id) return Warman.projects.renderList(view);
        if (!route.id) return Warman.router.go("flow", { id });
        return Warman.flow.render(view, id);
      },
      calendar: () => Warman.calendar.render(view, route.params.zoom || "month"),
      work: () => Warman.work.render(view),
      analytics: () => Warman.analytics.render(view),
      archive: () => Warman.work.render(view, { archive: true }),
      settings: () => Warman.settings.render(view)
    };
    const fn = map[route.name] || map.overview;
    try { fn(); }
    catch (err) {
      console.error(err);
      view.innerHTML = `<div class="empty"><i class="ph ph-warning"></i><p>Görünüm yüklenemedi.</p></div>`;
    }
  }

  function refresh() { render(); }

  function start() {
    window.addEventListener("hashchange", render);
    if (!location.hash) {
      const def = Warman.store.get().settings.defaultView || "overview";
      location.replace("#/" + def);
    } else render();
  }

  Warman.router = { parse, go, render, refresh, start };
})();
