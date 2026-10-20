-- Har bir akkauntga alohida SOCKS5 proksi.
--
-- NEGA: hozir barcha akkauntlar bitta serverdan, bitta IP'dan ulanadi.
-- Telegram uchun bu ochiq signal — bir IP'dagi o'nlab akkaunt o'zaro
-- bog'liq deb qaralishi mumkin.
--
-- Hammasi NULL bo'lishi mumkin: proksisiz akkaunt avvalgidek
-- to'g'ridan-to'g'ri ulanadi, ya'ni mavjud akkauntlar o'zgarishsiz
-- ishlashda davom etadi.
--
-- Parol api_hash bilan bir xil yo'lda shifrlanadi — bazaga ochiq
-- tushmaydi.
ALTER TABLE telegram_accounts
  ADD COLUMN proxy_host         TEXT,
  ADD COLUMN proxy_port         INTEGER,
  ADD COLUMN proxy_username     TEXT,
  ADD COLUMN proxy_password_enc TEXT;
