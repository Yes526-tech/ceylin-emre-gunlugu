# C&E'NİN GÜNLÜĞÜ 💕 (Ceylin & Emre'nin Masalı)

Ceylin ve Emre için özel olarak tasarlanmış, modern ve aşk temalı tek sayfa (SPA) günlük web sitesi.

---

## 🔒 Güvenlik & Şifre
- **Giriş Şifresi:** `24042008`
- Yanlış girildiğinde sevimli bir sallanma ve uyarı verir.
- Doğru girildiğinde romantik bir akor sesi ve animasyon eşliğinde günlüğün kapağı açılır.
- Üst menüdeki kilit butonuna basılarak site tekrar kilitlenebilir.

---

## 🌟 Sayfa Bölümleri ve Özellikler

1. **Giriş / Karşılama (`#hero`)**:
   - Romantik başlık ve Ceylin'e özel karşılama.
   - **Canlı Aşk Sayacı:** 24 Nisan 2008'den günümüze geçen Gün, Saat, Dakika ve Saniye'yi anlık olarak sayar.
   - Washi-tape bantlı, döner polaroid kapak fotoğrafı.

2. **Aşk Günlüğümüz (`#diary`)**:
   - Özel tarihli anı ve günlük kartları.
   - Klasördeki el çizimi kalp SVG'leriyle mühürlenmiş tasarım.
   - **"Devamını Oku"** butonu ile anıları detaylı okuma penceresi.
   - **"+ Yeni Bir Anı / Günlük Notu Yaz"** butonu ile tarayıcı üzerinden kalıcı olarak yeni anılar ekleyebilme.

3. **Fotoğraf Albümümüz (`#gallery`)**:
   - Polaroid tarzında, hafif eğik açılı ve washi bant efektli fotoğraf kartları.
   - Fotoğraflara tıklayınca açılan **Büyük Görsel (Lightbox)** modu.
   - **Fotoğraf Yükle / Önizle Butonu:** Fotoğrafları tarayıcıda hemen seçip anında önizleme imkanı.

4. **Mektubum & Melodimiz (`#letters`)**:
   - **Kırmızı Balmumu Mühürlü Mektup:** Tıklandığında Ceylin'e özel aşk mektubunu açan interaktif zarf.
   - **Spotify Tarzı Romantik Müzik Çalar:** Dönen plak animasyonu, ilerleme çubuğu ve Web Audio ile çalınan huzur verici romantik arpej melodisi (harici ses dosyası gerektirmez, kendi mp3'ünü de ekleyebilirsin).
   - **"Bana Bir Aşk Sözü Fısılda":** Her tıklamada rastgele romantik ve tatlı sözler üreten buton.

5. **Bizim Dileklerimiz / Hayallerimiz (`#bucketlist`)**:
   - Birlikte yapılacaklar / bucket list listesi.
   - Tıklanarak tamamlanabilen interaktif onay kutuları (hafızada saklanır).
   - Yeni ortak hayaller ekleme formu.

6. **Modern Yüzen Alt Menü (Floating Bottom Bar)**:
   - Sayfanın en altında iOS cam efekti (glassmorphism) ile yüzen dock menüsü.
   - Tıklandığında ilgili bölüme akıcı bir şekilde kaydırır (Smooth Scroll).
   - Sayfa kaydırıldıkça hangi bölümde olunduğunu otomatik algılayıp parlayan aktif göstergeye sahiptir.

---

## 📸 Fotoğrafları Ekleme / Değiştirme
Fotoğrafları eklemek istediğinde `ceylin_project/assets/images/` klasörüne gidip:
- `hero.jpg` -> Kapak fotoğrafı
- `photo1.jpg` -> 1. Fotoğraf
- `photo2.jpg` -> 2. Fotoğraf
- `photo3.jpg` -> 3. Fotoğraf
- `photo4.jpg` -> 4. Fotoğraf
- `photo5.jpg` -> 5. Fotoğraf
- `photo6.jpg` -> 6. Fotoğraf

olarak kendi fotoğraflarını yerleştirmen yeterlidir!

---

## 🚀 Nasıl Açılır?
Herhangi bir kurulum veya derleme gerektirmez:
- `index.html` dosyasına çift tıklayarak doğrudan Safari, Chrome veya herhangi bir tarayıcıda açabilirsin.
