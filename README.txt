BRAINROT HIRSIZI ONLINE

1) Sadece kendin oynayacaksan (botlara karşı, çevrim dışı):
   "brainrot-hirsizi-online.html" dosyasını tarayıcıda aç.
   Girişte "Çevrim dışı"yı seç, hesap aç. Hesaplar o cihazda kalır.

2) Gerçek çevrim içi (arkadaşlar, 8 kişilik sunucular):
   Bilgisayarında Node.js 18+ kurulu olmalı.
     node server.js
   Sonra tarayıcıda http://localhost:3000 adresini aç.
   Başkalarının girebilmesi için sunucunun internette durması gerekir
   (Render, Railway, Fly.io, kendi VPS'in vb. Başlatma komutu: node server.js).
   Port için PORT, kayıt klasörü için DATA_DIR ortam değişkeni kullanılır.
   Hesaplar data/users.json içinde, şifreler hash'li saklanır.

ADMIN: kullanıcı adı XXBrainrotXX, şifre XXşifreXX
   Giriş yapınca sol altta admin paneli açılır.
   Herkese açık bir sunucuda şifreyi değiştirmek için ilk çalıştırmadan önce
   ADMIN_PASS=yenisifre node server.js yaz. (Hesap bir kez oluşunca şifre
   data/users.json içinden değil, hesabı silip yeniden başlatarak değişir.)

Brainrot yeri fiyatları: 1.000, 10.000, 30.000, 50.000, 75.000, 80.000
Mağaza: 1.000.000 ile sunucuya 10 dakikalık 2x şans.
