# Warman TaskFlow

Görev, proje ve günlük iş takibi. Statik HTML/CSS/JavaScript uygulaması; veriler mevcut Supabase tablolarında, yayın GitHub Pages üzerinde `main` dalının kökünden yapılır.

## Kayıtlar

Görevler, projeler ve iş kayıtları kimliğe göre upsert edilir. Veritabanı kaydı döndürmeden arayüz başarı bildirmez. Yenilemede veriler oturum açılan hesaptan yeniden yüklenir. İş kaydının çalışma süresi ve tatil bilgileri mevcut `description` alanında sürümlü bir zarfla saklanır; eski düz metin açıklamaları okunmaya devam eder. Yeni sütun veya SQL migrasyonu gerekmez.

## Maaş hesabı

- Ay seçimi kayıt listesini, özeti ve dökümü filtreler. Dönemi kapatmak yalnızca seçili ayın güncel kayıtlarını arşivler.
- 2025 ve 2026 için doğrulanmış net/brüt asgari ücretler tanımlıdır. 2026 aylık ücretleri net 28.075,50 TL, brüt 33.030 TL'dir; diğer yıllar için özel ücret gerekir.
- Aylık temel ücret başlangıçta tamdır; kayıt girilmeyen günler maaşı azaltmaz. Günlük ücret her ay aylık / 30 olarak hesaplanır. Normal iş gününe “Gelmedim” veya açıkça ücretsiz izin girilmesi bir günlük kesinti oluşturur; ücretli izin maaşı korur. Aynı tarihi tekrar kaydetmek o günü günceller. Kayıtların hesabı bugünün tarihinden bağımsızdır.
- Tam gün resmî tatilde “Gelmedim” maaşı azaltmaz. Yarım gün tatilde gelinmeyen normal yarım gün için yalnızca yarım günlük kesinti oluşur. Açıkça seçilen ücretsiz izin tam günlük kesintidir. Tatilde çalışma aylık ücrete ek bir günlük, yarım gün tatilin tatil bölümünde çalışma ek yarım günlük ücret getirir; yarım günün tatil bölümünde çalışılıp çalışılmadığı ayrıca seçilebilir.
- Fazla mesai saat ücreti aylık / 225 × en az 1,5'tir. Haftalık 45 saati aşan fazla mesai kullanıcı tarafından girilir; uygulama haftalık puantajdan otomatik hak ediş çıkarmaz. Cumartesinin normal iş günü mü, haftalık süre dışında çalışma mı olduğu ayarlanabilir. Varsayılan cumartesi mesai kabulü, haftalık 45 saatin tamamlandığı varsayımına dayanır.
- Tatil ve hafta tatili kayıtlarında girilen saatlerin toplam çalışma mı, ayrıca yapılan fazla mesai mi olduğu saklanır. Toplam çalışma girildiğinde ilk 7,5 saat için aynı çalışmayı hem günlük tatil eki hem saatlik mesai olarak iki kez ödemez; yalnızca 7,5 saati aşan bölüm fazla mesai olur. “Ek fazla mesai” olarak girilen saatler doğrudan kullanılır. `1,5`, `1.5` ve `1:30` bir buçuk saattir. Bu kişisel takip aracı girilen mesai miktarına yasal çalışma süresi sınırı uygulamaz.
- Haftalık dinlenme günü varsayılan pazar olup değiştirilebilir. Çalışılmayan hafta tatili, ücret hakkı kazanıldığı varsayımıyla maaştan düşülmez. Çalışılan hafta tatili için aylık ücrete ek 1,5 günlük ücret ve 7,5 saati aşan çalışma için fazla mesai hesaplanır. Önceden kaydedilmiş daha yüksek sözleşme katsayıları korunur. Resmî tatil ve hafta tatili aynı güne denk gelirse günlük ek ücretler toplanmaz; daha yüksek hak ediş kullanılır.
- Net modunda ek ödemeler net aylık ücret üzerinden tahmin edilir; brüt karşılıklar ayrıca gösterilir. Örneğin 2026 asgari ücretle 10 saat × 1,5 mesai brüt `33.030 / 225 × 10 × 1,5 = 2.202 TL`, net tahmini `28.075,50 / 225 × 10 × 1,5 = 1.871,70 TL` olur. Brüt tutar net maaş toplamına eklenmez. Brüt modunda tutarlar vergi, SGK ve BES öncesidir.
- BES/OKS oranı varsayılan %3'tür; değiştirilebilir veya sıfırlanabilir. Bilinen brüt ücret, brüt mesai ve brüt tatil ekleri üzerinden, ücretsiz günler ve prime esas kazanç tavanı dikkate alınarak tahmin edilir; katkı tutarındaki kuruşlar aşağı yuvarlanır. Tavan 2025 için brüt asgari ücretin 7,5, 2026 için 9 katıdır. Özel net maaş için brüt referans girilmezse BES hesaplanmaz ve uyarı gösterilir. Brüt modunda BES ayrıca gösterilir, brüt toplamdan düşülmez.
- Maaş, BES ve mesai katsayısı ayarları hesap ve ay bazında bu tarayıcının yerel depolamasında kalır. Günlük iş/tatil bilgileri Supabase'e kaydedilir. JSON yedeği ayarları da içerir.
- Maaş, mesai ve yol parası ayrı gösterilir. Yol parasının prime/vergiye tabi bölümü bordroya bağlı olduğundan bu takipte BES matrahına dahil edilmez. Net tutarlar tahmindir; kümülatif vergi matrahı ve kişisel bordro kesintileri bilinmediğinden kesin bordro neti hesaplanmaz.

Resmi kaynak bağlantıları uygulamanın maaş dökümünde ve `js/payroll.js` içinde bulunur. İş takibi CSV/Excel dosyası yalnızca `Tarih` ve `Mesai saati` sütunlarını içerir; ayrıntılı maaş dökümü ayrıca CSV olarak indirilebilir.

## Doğrulama

Node.js 22 ve üzeriyle bağımlılık kurmadan:

```sh
node --test --test-isolation=none tests/payroll.test.cjs tests/persistence.test.cjs
```

Tarayıcı akışını Playwright ve Chromium/Chrome kurulu bir ortamda doğrulamak için:

```sh
node tests/browser-smoke.cjs
```

Gerekirse `PLAYWRIGHT_MODULE` mevcut Playwright modülünün, `BROWSER_EXECUTABLE` tarayıcının yoluna ayarlanabilir. Eski tarayıcı birim testleri `tests/unit.html` adresindedir. Uygulamayı yerelde sunmak için `python -m http.server 8000` kullanılabilir. Testler canlı kullanıcı kayıtlarına yazmaz; tarayıcı testi yerel sahte Supabase kullanır.
