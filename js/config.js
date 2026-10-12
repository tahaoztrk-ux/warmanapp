window.Warman = window.Warman || {};
Warman.config = {
  supabaseUrl: "https://gpdvqhdhbreiqazlvwlh.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwZHZxaGRoYnJlaXFhemx2d2xoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNTkxMzYsImV4cCI6MjEwNDkzNTEzNn0.vfqPZuGNIwch5MjxDAeCAxCzkIplC3JFbXvdQAGBE58",
  statuses: [
    { id: "inbox", label: "Gelen Kutusu" },
    { id: "planned", label: "Planlandı" },
    { id: "in_progress", label: "Devam Ediyor" },
    { id: "waiting", label: "Beklemede" },
    { id: "done", label: "Tamamlandı" },
    { id: "cancelled", label: "İptal Edildi" }
  ],
  priorities: [
    { id: "urgent", label: "Acil" },
    { id: "high", label: "Yüksek" },
    { id: "normal", label: "Normal" },
    { id: "low", label: "Düşük" }
  ],
  projectStatuses: [
    { id: "planning", label: "Planlama" },
    { id: "active", label: "Aktif" },
    { id: "waiting", label: "Beklemede" },
    { id: "done", label: "Tamamlandı" },
    { id: "archived", label: "Arşivlendi" }
  ],
  nodeStatuses: [
    { id: "not_started", label: "Başlamadı" },
    { id: "ready", label: "Hazır" },
    { id: "in_progress", label: "Devam Ediyor" },
    { id: "blocked", label: "Engellendi" },
    { id: "done", label: "Tamamlandı" },
    { id: "cancelled", label: "İptal Edildi" }
  ],
  locations: ["Merkez", "İvedik", "Saha", "Uzaktan"],
  templates: {
    software: { name: "Yazılım Geliştirme", tasks: ["Analiz", "Tasarım", "Geliştirme", "Test", "Yayınlama"] },
    website: { name: "Web Sitesi", tasks: ["Wireframe", "Görsel tasarım", "Frontend", "İçerik", "Yayın"] },
    bugfix: { name: "Hata Düzeltme", tasks: ["Yeniden üret", "Kök neden", "Düzelt", "Test et", "Dağıt"] },
    general: { name: "Genel Proje", tasks: ["Planla", "Uygula", "Kontrol et", "Tamamla"] }
  }
};
