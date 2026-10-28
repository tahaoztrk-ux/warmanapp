# Warman TaskFlow

Görev, proje ve günlük iş takibi. Statik HTML/CSS/JavaScript uygulaması; veriler mevcut Supabase tablolarında, yayın GitHub Pages üzerinde `main` dalının kökünden yapılır.

## Kayıtlar

Görevler, projeler ve iş kayıtları kimliğe göre upsert edilir. Veritabanı kaydı döndürmeden arayüz başarı bildirmez. Yenilemede veriler oturum açılan hesaptan yeniden yüklenir. İş kaydının vardiya ve tatil bilgileri mevcut `description` alanında sürümlü bir zarfla saklanır; eski düz metin açıklamaları okunmaya devam eder. Yeni sütun veya SQL migrasyonu gerekmez.

## Maaş hesabı

- Ay seçimi kayıt listesini, özeti ve dökümü filtreler. Dönemi kapatmak yalnızca seçili ayın güncel kayıtlarını arşivler.
- Temel ücret tam ay kabul edilir. 2025 ve 2026 için doğrulanmış net/brüt asgari ücretler tanımlıdır; diğer yıllar için özel ücret gerekir.
- Günlük ücret aylık / 30; saatlik ücret aylık / 225. Fazla mesai girilen saat × saatlik ücret × en az 1,5 katsayısıdır. Haftalık 45 saati aşan süre kullanıcı tarafından girilir; kayıtsız günlerden çalışma süresi çıkarılmaz.
- Varsayılan vardiya 08.30–18.30, mola 60 dakikadır. Saatler ve mola değiştirilebilir. Giriş/çıkış, fazla mesai dahil gerçek çalışmayı ifade eder.
- Resmi tatilde çalışma, aylık ücrete ek bir günlük ücret getirir. Yarım gün tatil, 13.00 sonrasında çalışılmışsa ek yarım günlük ücrettir. Normal tatil vardiyası ayrıca fazla mesaiye eklenmez. Tatilde ek mesai için normal vardiyayı aşan süre ve gerçek çıkış saati kaydedilir.
- Kayıt girilmeyen günler, ücretli izin ve işaretlenmeyen devamsızlık için kesinti yapılmaz. Yalnızca açıkça seçilen ücretsiz günler düşülür; toplam kesinti aylık temel ücreti aşmaz.
- Maaş/varsayılan vardiya ayarları hesap ve ay bazında bu tarayıcının yerel depolamasında kalır. Günlük vardiya/tatil bilgileri Supabase'e kaydedilir. JSON yedeği ayarları da içerir.
- Net hesap tahmindir. Brüt hesapta vergi/SGK kesintileri yapılmaz. İşe giriş/çıkış kıstı ve hafta tatili farklı ücretleri ayrıca hesaplanmaz. Gece yarısını aşan vardiyalar için tatil günleri ayrı kaydedilmelidir.

Resmi kaynak bağlantıları uygulamanın maaş dökümünde ve `js/payroll.js` içinde bulunur. CSV/Excel aktarımı günlük ücret ayrıntılarını içerir; maaş dökümü ayrıca CSV olarak indirilebilir.

## Doğrulama

Node.js 22 ve üzeriyle bağımlılık kurmadan:

```sh
node --test --test-isolation=none tests/payroll.test.cjs tests/persistence.test.cjs
```

Eski tarayıcı birim testleri `tests/unit.html` adresindedir. Uygulamayı yerelde sunmak için `python -m http.server 8000` kullanılabilir. Testler canlı kullanıcı kayıtlarına yazmaz.
