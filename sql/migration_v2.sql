-- Warman TaskFlow 2.0 — isteğe bağlı, geriye uyumlu şema genişletmesi
-- Bu dosyayı canlı veritabanında otomatik çalıştırmayın.
-- Uygulama mevcut projects / assignments / work_tracking tablolarıyla
-- ek sütun OLMADAN da çalışır. Yeni alanlar subtasks_json içindeki
-- { "v": 2, "items": [], "meta": {} } zarfında tutulur.
--
-- Çalıştırmadan önce yedek alın:
--   supabase db dump  veya  Table Editor > Export
--
-- Hiçbir tablo veya sütun silinmez.

-- 1) Mesai saatlerinde 1.5 gibi ondalık değerlerin korunması
ALTER TABLE work_tracking
  ALTER COLUMN overtime_hours TYPE numeric USING NULLIF(overtime_hours::text, '')::numeric;

-- 2) Görevlerde boş teslim tarihi (uygulama boş string de kabul eder)
ALTER TABLE assignments ALTER COLUMN date DROP NOT NULL;
ALTER TABLE assignments ALTER COLUMN time DROP NOT NULL;

-- 3) Projelerde tarihsiz kayıt
ALTER TABLE projects ALTER COLUMN date DROP NOT NULL;

-- 4) İsteğe bağlı açık sütunlar (uygulama bunları zorunlu kullanmaz)
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS project_id bigint;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS due_date text;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS due_time text;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- 5) RLS önerisi — tablolarda user_id varsa politikaları sıkılaştırın
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "own_projects" ON projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- assignments ve work_tracking için aynı kalıp.

-- 6) Geri dönüş: yeni sütunlar kullanılmıyorsa bırakılabilir.
-- DROP COLUMN ÇALIŞTIRMAYIN; mevcut kayıtlar subtasks_json / flow_data içinde durur.
