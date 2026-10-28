# Warman TaskFlow

Görev, proje ve günlük iş takibi. Statik HTML/CSS/JavaScript uygulaması; veriler mevcut Supabase tablolarında, yayın GitHub Pages üzerinde `main` dalının kökünden yapılır.

## Kayıtlar

Görevler, projeler ve iş kayıtları kimliğe göre upsert edilir. Veritabanı kaydı döndürmeden arayüz başarı bildirmez. Yenilemede veriler oturum açılan hesaptan yeniden yüklenir. İş kaydının çalışma süresi ve tatil bilgileri mevcut `description` alanında sürümlü bir zarfla saklanır; eski düz metin açıklamaları okunmaya devam eder. Yeni sütun veya SQL migrasyonu gerekmez.

## Maaş hesabı

- Ay seçimi kayıt listesini, özeti ve dökümü filtreler. Dönemi kapatmak yalnızca seçili ayın güncel kayıtlarını arşivler.
- 2025 ve 2026 için doğrulanmış net/brüt asgari ücretler tanımlıdır; diğer yıllar için özel ücret gerekir.
- Günlük ücret, aylık temel ücretin seçili ayın gerçek gün sayısına (28, 29, 30 veya 31) bölünmesiyle hesaplanır. Biriken maaş yalnızca kaydedilen günlük kayıtların toplamıdır; kayıt yoksa 0'dır. Yeni gün kaydetmek kazancı artırır, silmek azaltır. Aynı tarihi tekrar kaydetmek o günü günceller; ikinci kez ücret eklemez. Seçili aya kaydedilmiş geçmiş ve gelecek tarihli günler bugünün tarihinden bağımsız hesaplanır.
- Saatlik mesai ücreti aylık / 225; fazla mesai girilen saat × saatlik ücret × katsayıdır. Mesai süresi doğrudan sayı olarak girilir; 1000 saat gibi büyük değerler dahil günlük veya haftalık üst sınır uygulanmaz. Giriş/çıkış, AM/PM ve mola alanı yoktur; otomatik mola kesilmez.
- Resmi tatilde çalışma, aylık ücrete ek bir günlük ücret getirir. Yarım gün tatil seçimi ek yarım günlük ücrettir. Girilen mesai saati, vardiya süresine göre sınırlandırılmaz.
- BES oranı varsayılan %3'tür ve ayarlarla değiştirilebilir ya da sıfırlanabilir. Yalnızca kayıtlı günlerde kazanılan temel ücretten tahmini kesinti yapılır; mesai/tatil eklerine uygulanmaz. Kayıt yoksa BES de 0'dır.
- İşe gelinen günler ve ücretli izin temel ücret kazandırır. Gelinmeyen günler, açıkça seçilen ücretsiz izinler ve kayıt girilmeyen günler 0 temel ücret kazandırır. Kullanıcının ayrıca girdiği mesai saatleri seçilen devam durumuna göre sınırlandırılmaz.
- Maaş, BES ve mesai katsayısı ayarları hesap ve ay bazında bu tarayıcının yerel depolamasında kalır. Günlük iş/tatil bilgileri Supabase'e kaydedilir. JSON yedeği ayarları da içerir.
- Net hesap tahmindir. Brüt hesapta vergi/SGK kesintileri yapılmaz. Gün sayısına göre dağıtım ve BES oranı kullanıcının seçtiği takip hesabıdır; kişisel bordro kesintileri ayrıca hesaplanmaz.

Resmi kaynak bağlantıları uygulamanın maaş dökümünde ve `js/payroll.js` içinde bulunur. İş takibi CSV/Excel dosyası yalnızca `Tarih` ve `Mesai saati` sütunlarını içerir; ayrıntılı maaş dökümü ayrıca CSV olarak indirilebilir.

## Doğrulama

Node.js 22 ve üzeriyle bağımlılık kurmadan:

```sh
node --test --test-isolation=none tests/payroll.test.cjs tests/persistence.test.cjs
```

Eski tarayıcı birim testleri `tests/unit.html` adresindedir. Uygulamayı yerelde sunmak için `python -m http.server 8000` kullanılabilir. Testler canlı kullanıcı kayıtlarına yazmaz.
