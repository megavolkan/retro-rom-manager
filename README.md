# 🎮 Retro ROM Manager & Scraper

Retro el konsolları (Trimui Smart Pro, Miyoo Mini, Anbernic, Powkiddy vb.) ve retro emülasyon dağıtımları (CrossMix, OnionOS, ArkOS, JelOS, AmberELEC vb.) için özel olarak tasarlanmış, **görsel odaklı, platform bağımsız ve tarayıcı tabanlı** bir ROM yönetim ve kapak görseli scrape etme arayüzüdür.

Tamamen modern **HTML5 File System Access API** (`showDirectoryPicker`) ile geliştirildiği için hiçbir kuruluma ihtiyaç duymadan Google Chrome veya Microsoft Edge üzerinden **Windows, macOS ve Linux** işletim sistemlerinde doğrudan yerel SD kart dizinlerinizi okuyup güncelleyebilir.

---

## ✨ Öne Çıkan Özellikler

* **🌟 Görsel Öncelikli Arayüz (Grid Thumbnail)**: Oyunlarınızı el konsolunuzdaki kapak görselleriyle zenginleştirilmiş, 3 boyutlu kaset hissiyatı veren şık bir ızgara düzeninde listeler. Kapağı eksik oyunlar için o konsolun türüne göre nostaljik kartuş yer tutucuları dinamik olarak oluşturulur.
* **📂 Cihaz Profil Sistemi (.rrmas)**: SD kartınızın kök dizininde gizli bir `.rrmas` JSON ayar dosyası oluşturur. Bu sayede standart dışı dizin kullanan **Trimui Smart Pro (CrossMix)** gibi sistemler için ROM klasörü (`/Roms/`) ile görseller klasörünü (`/Imgs/`) otomatik eşleştirir. Profil modalından mevcut profili düzenleyebilir veya tek tıkla geri alınamaz şekilde kalıcı olarak silebilirsiniz.
* **🔄 Akıllı Otomatik Kapak Keşfi (Auto-Detect)**: `gamelist.xml` dosyanız olmasa bile, `/Imgs/` veya `/media/images/` klasörünüzün içindeki oyun adıyla birebir eşleşen resimleri (`.png`, `.jpg`, `.jpeg` vb.) anında sıfır gecikmeyle tespit edip oyunlarınızla ilişkilendirir.
* **💾 Emulation Station XML Entegrasyonu**: Oyunlara ait metadata (Başlık, Tür, Açıklama, Puan, Geliştirici, Çıkış Yılı vb.) güncellemelerini ve kapak görsel yollarını standart `gamelist.xml` formatına tam uyumlu olarak SD kartınıza yazar.
* **📥 Sürükle - Bırak (Drag & Drop) ROM Yükleme**: Bilgisayarınızdaki ROM dosyalarını arayüze sürükleyip bırakarak doğrudan SD kartınızdaki doğru konsol klasörüne kopyalanmasını sağlayabilirsiniz. Uyumsuz formatlar için otomatik koruma uyarısı gösterilir.
* **🛸 Siber-Retro Estetik**: Neon mor ve retro yeşil tonları, CRT televizyon tarama çizgileri efekti ve akıcı hover animasyonlarıyla bezenmiş premium cam (Glassmorphism) tasarımı.

---

## 🛠️ Klasör Yapısı

```
retro-rom-manager/
├── index.html         # Arayüz iskeleti, modaller ve yapılar
├── index.css          # Siber-retro tasarım sistemi ve animasyonlar
├── app.js             # File System API, XML parsing, kopyalama ve scraper mantığı
├── rom_db.js          # Çevrimdışı popüler oyunlar veritabanı kütüphanesi
├── .gitignore         # Git dışı bırakılacak sistem dosyaları
└── README.md          # Kullanım kılavuzu
```

---

## 🚀 Çalıştırma Talimatları

Uygulama yerel bir web sunucusu üzerinden çalışmalıdır (tarayıcıların dosya sistemi güvenlik protokolleri gereği):

### Seçenek 1: Node.js / npx ile Çalıştırma (Tavsiye Edilen)
Proje klasörünün içerisindeyken terminalinizde aşağıdaki komutu çalıştırın:
```bash
npx http-server -p 8080
```
Ardından tarayıcınızdan **`http://127.0.0.1:8080`** adresine gidin.

### Seçenek 2: Python3 ile Çalıştırma
Eğer bilgisayarınızda Python kuruluysa:
```bash
python3 -m http.server 8080
```
Yine tarayıcınızdan **`http://127.0.0.1:8080`** adresine giderek kullanmaya başlayabilirsiniz.

---

## 🎮 Desteklenen Sistemler (17 Klasik Platform)

* Super Nintendo (SNES)
* Game Boy Advance (GBA)
* Nintendo (NES)
* Game Boy (GB)
* Game Boy Color (GBC)
* Sega Genesis / Megadrive
* PlayStation 1 (PSX)
* Nintendo 64 (N64)
* Capcom CPS1
* Capcom CPS2
* Capcom CPS3
* Neo Geo
* Arcade / MAME
* Nintendo DS (NDS)
* Sega Master System (SMS)
* Sega Game Gear (GG)
* PC Engine (PCE)

---

Keyifli oyunlar ve iyi eğlenceler! 🕹️👾
