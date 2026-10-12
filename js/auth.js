window.Warman = window.Warman || {};
(function () {
  let signUp = false;

  function els() {
    return {
      screen: document.getElementById("authScreen"),
      title: document.getElementById("authTitle"),
      btn: document.getElementById("authBtn"),
      switchText: document.getElementById("authSwitchText"),
      email: document.getElementById("authEmail"),
      password: document.getElementById("authPassword")
    };
  }

  function toggleMode() {
    signUp = !signUp;
    const e = els();
    e.title.textContent = signUp ? "Hesap oluştur" : "Warman TaskFlow";
    e.btn.innerHTML = signUp ? '<i class="ph ph-user-plus"></i> Kayıt Ol' : '<i class="ph ph-sign-in"></i> Giriş Yap';
    e.switchText.textContent = signUp ? "Zaten hesabın var mı? Giriş yap" : "Hesabın yok mu? Kayıt ol";
  }

  async function submit() {
    const e = els();
    const email = e.email.value.trim();
    const password = e.password.value.trim();
    if (!email || !password) return Warman.ui.toast("E-posta ve şifre gerekli.", "error");
    e.btn.disabled = true;
    try {
      if (signUp) {
        const { error } = await Warman.api.client.auth.signUp({ email, password });
        if (error) throw error;
        Warman.ui.toast("Kayıt başarılı. Şimdi giriş yapabilirsiniz.", "success");
        toggleMode();
      } else {
        const { error } = await Warman.api.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await Warman.app.startSession();
      }
    } catch (err) {
      Warman.ui.toast(err.message || "Kimlik doğrulama hatası", "error");
    } finally {
      e.btn.disabled = false;
    }
  }

  async function logout() {
    await Warman.api.client.auth.signOut();
    location.reload();
  }

  async function requireSession() {
    const { data } = await Warman.api.client.auth.getSession();
    return data.session || null;
  }

  Warman.auth = { toggleMode, submit, logout, requireSession };
})();
