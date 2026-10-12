window.Warman = window.Warman || {};
(function () {
  async function startSession() {
    const session = await Warman.auth.requireSession();
    if (!session) {
      document.getElementById("bootScreen").style.display = "none";
      document.getElementById("authScreen").style.display = "flex";
      document.getElementById("appShell").style.display = "none";
      document.getElementById("appShell").setAttribute("aria-hidden", "true");
      return;
    }
    document.getElementById("authScreen").style.display = "none";
    document.getElementById("appShell").style.display = "grid";
    document.getElementById("appShell").removeAttribute("aria-hidden");
    Warman.store.set({ user: session.user });
    Warman.store.loadSettings();
    Warman.store.loadActivity();
    Warman.ui.setThemeIcon();
    const email = session.user.email || "";
    document.getElementById("userEmail").textContent = email;
    document.getElementById("userAvatar").textContent = Warman.utils.initials(email);
    try {
      const data = await Warman.api.loadAll();
      Warman.store.set({ projects: data.projects, tasks: data.tasks, work: data.work, loading: false });
      document.getElementById("bootScreen").style.display = "none";
      Warman.ui.bindChrome();
      Warman.router.start();
      scheduleReminders();
    } catch (err) {
      document.getElementById("bootScreen").style.display = "none";
      Warman.ui.toast("Veriler yüklenemedi: " + err.message, "error");
      Warman.ui.bindChrome();
      Warman.router.start();
    }
  }

  function scheduleReminders() {
    const tick = () => {
      const s = Warman.store.get().settings;
      if (!s.notifications || Notification.permission !== "granted") return;
      const now = new Date();
      const tstr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      const today = Warman.utils.todayStr();
      Warman.store.get().tasks.forEach((t) => {
        if (t.due_date === today && t.due_time === tstr && !t.completed && !t._notified) {
          t._notified = true;
          new Notification("Warman TaskFlow", { body: t.title });
        }
      });
    };
    setInterval(tick, 30000);
  }

  async function boot() {
    Warman.api.init();
    document.getElementById("authBtn").onclick = Warman.auth.submit;
    document.getElementById("authSwitchBtn").onclick = Warman.auth.toggleMode;
    document.getElementById("authPassword").addEventListener("keydown", (e) => {
      if (e.key === "Enter") Warman.auth.submit();
    });
    await startSession();
  }

  Warman.app = { boot, startSession };
  document.addEventListener("DOMContentLoaded", boot);
})();
