# 🎮 Retro ROM Manager & Scraper

> [!NOTE]
> **🤖 Yapay Zeka (AI) İş Birliğiyle Geliştirilmiştir (AI-Assisted Development)**
> Bu proje; şeffaflık, etik yapay zeka kullanımı ve açık kaynak prensipleri doğrultusunda, bir insan geliştirici ile gelişmiş yapay zeka kodlama asistanının (Google DeepMind Antigravity) pair-programming (ortak programlama) yöntemiyle baştan sona iş birliği içinde tasarlayıp geliştirdiği bir yazılımdır.

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

## 🎮 Desteklenen Sistemler (40+ Klasik Platform)

Uygulama, hem otomatik klasör tarayıcılarında hem de ScreenScraper API entegrasyonlarında aşağıdaki popüler retro oyun platformlarını ve daha fazlasını tam kapsamlı olarak tanır:

* **🎮 Nintendo:** Super Nintendo (SNES), Super Famicom (SFC), Game Boy (GB), Game Boy Color (GBC), Game Boy Advance (GBA), Nintendo DS (NDS), Nintendo 64 (N64), NES / Family Computer (Famicom), Famicom Disk System, GameCube
* **🚀 Sega:** Sega Mega Drive, Sega Genesis, Sega Master System (SMS), Sega Game Gear (GG), Sega Saturn, Sega Dreamcast, Sega CD, Sega 32X, Sega NAOMI
* **📀 Sony PlayStation:** PlayStation (PSX / PS1), PlayStation Portable (PSP), PSP Minis
* **👾 Arcade / Jetonlu:** Capcom CPS1, CPS2, CPS3, Neo Geo, Neo Geo CD, Arcade / MAME, Daphne Laserdisc
* **⌨️ Bilgisayar / Home Computer:** MSX, MSX2, Commodore 64, Commodore Amiga, Atari ST, Amstrad CPC, ZX Spectrum
* **🌈 Diğer Popüler Sistemler:** WonderSwan (WS), WonderSwan Color (WSC), PICO-8, TIC-80, ScummVM, Atari 2600 / 5200 / 7800, Atari Lynx, ColecoVision, PC Engine (PCE), Intellivision

---

Keyifli oyunlar ve iyi eğlenceler! 🕹️👾
