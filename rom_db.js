const RETRO_GAME_DB = [
  // ==================== SNES (Super Nintendo) ====================
  {
    id: "super-mario-world",
    title: "Super Mario World",
    system: "snes",
    filenameKeywords: ["super mario world", "smw", "mario world"],
    developer: "Nintendo EAD",
    publisher: "Nintendo",
    releasedate: "1990-11-21",
    genre: "Platform",
    players: "2",
    rating: "0.98",
    description: "Mario ve Luigi'nin Dinosaur Land'deki maceralarını konu alan efsanevi platform oyunu. İlk kez Yoshi ile tanıştığımız ve Bowser'ı alt etmeye çalıştığımız bu oyun, tüm zamanların en iyi platform oyunlarından biri kabul edilir.",
    image: "https://upload.wikimedia.org/wikipedia/en/3/32/Super_Mario_World_Coverart.png"
  },
  {
    id: "legend-of-zelda-link-to-the-past",
    title: "The Legend of Zelda: A Link to the Past",
    system: "snes",
    filenameKeywords: ["zelda", "link to the past", "alttp"],
    developer: "Nintendo EAD",
    publisher: "Nintendo",
    releasedate: "1991-11-21",
    genre: "Action-Adventure",
    players: "1",
    rating: "0.97",
    description: "Link, Hyrule Krallığı'nı karanlık büyücü Agahnim ve ardından domuz iblis Ganon'dan kurtarmak için Işık Dünyası ile Karanlık Dünya arasında seyahat ediyor. 16-bit macera türünün zirvesidir.",
    image: "https://upload.wikimedia.org/wikipedia/en/2/21/The_Legend_of_Zelda_A_Link_to_the_Past_SNES_Game_Cover.jpg"
  },
  {
    id: "chrono-trigger",
    title: "Chrono Trigger",
    system: "snes",
    filenameKeywords: ["chrono trigger", "ct"],
    developer: "Square",
    publisher: "Square",
    releasedate: "1995-03-11",
    genre: "Role-Playing",
    players: "1",
    rating: "0.99",
    description: "Crono ve arkadaşlarının zamanda yolculuk yaparak dünyayı yok edecek olan parazitik uzaylı Lavos'u engellemeye çalıştığı unutulmaz bir JRPG. Birden fazla sonu, dinamik dövüş sistemi ve muhteşem müzikleriyle bir başyapıt.",
    image: "https://upload.wikimedia.org/wikipedia/en/a/a7/Chrono_Trigger_%2528SNES_game_art%2529.jpg"
  },
  {
    id: "super-metroid",
    title: "Super Metroid",
    system: "snes",
    filenameKeywords: ["super metroid", "metroid 3"],
    developer: "Nintendo R&D1",
    publisher: "Nintendo",
    releasedate: "1994-03-19",
    genre: "Action-Adventure",
    players: "1",
    rating: "0.96",
    description: "Samus Aran'ın son Metroid larvasını kaçıran Uzay Korsanları lideri Ridley'i takip etmek için Zebes gezegenine geri döndüğü, atmosferik ve keşif odaklı efsanevi Metroidvania oyunu.",
    image: "https://upload.wikimedia.org/wikipedia/en/e/e4/Super_Metroid_box_art.jpg"
  },
  {
    id: "donkey-kong-country",
    title: "Donkey Kong Country",
    system: "snes",
    filenameKeywords: ["donkey kong country", "dkc"],
    developer: "Rare",
    publisher: "Nintendo",
    releasedate: "1994-11-21",
    genre: "Platform",
    players: "2",
    rating: "0.94",
    description: "Donkey Kong ve Diddy Kong'un, çalınan muz stoklarını King K. Rool ve Kremlinglerden geri almak için çıktığı macera. Dönemi için çığır açan 3D önceden işlenmiş (pre-rendered) grafikleriyle ünlüdür.",
    image: "https://upload.wikimedia.org/wikipedia/en/1/1d/DKC_SNES_US_Cover.png"
  },

  // ==================== GBA (Game Boy Advance) ====================
  {
    id: "pokemon-emerald",
    title: "Pokémon Emerald Version",
    system: "gba",
    filenameKeywords: ["pokemon emerald", "emerald version", "pokemon zümrüt"],
    developer: "Game Freak",
    publisher: "Nintendo",
    releasedate: "2004-09-16",
    genre: "Role-Playing",
    players: "1",
    rating: "0.95",
    description: "Hoenn bölgesinde geçen efsanevi Pokémon oyunu. Ruby ve Sapphire sürümlerinin zenginleştirilmiş versiyonu olup, efsanevi Rayquaza'yı konu alır ve meşhur Battle Frontier özelliğini barındırır.",
    image: "https://upload.wikimedia.org/wikipedia/en/a/a2/PokemonEmeraldBoxart.jpg"
  },
  {
    id: "legend-of-zelda-minish-cap",
    title: "The Legend of Zelda: The Minish Cap",
    system: "gba",
    filenameKeywords: ["minish cap", "zelda minish"],
    developer: "Capcom",
    publisher: "Nintendo",
    releasedate: "2004-11-04",
    genre: "Action-Adventure",
    players: "1",
    rating: "0.93",
    description: "Link, konuşan sihirli şapkası Ezlo sayesinde Picori (Minish) adı verilen küçük canlıların dünyasına girmek için küçülüyor. Harika görselleri, zindanları ve Kinstone birleştirme mekaniğiyle öne çıkar.",
    image: "https://upload.wikimedia.org/wikipedia/en/a/a5/The_Legend_of_Zelda_The_Minish_Cap_Game_Boy_Advance_Game_Cover.jpg"
  },
  {
    id: "pokemon-firered",
    title: "Pokémon FireRed Version",
    system: "gba",
    filenameKeywords: ["pokemon firered", "firered"],
    developer: "Game Freak",
    publisher: "Nintendo",
    releasedate: "2004-01-29",
    genre: "Role-Playing",
    players: "1",
    rating: "0.92",
    description: "İlk nesil Pokémon Red oyununun Game Boy Advance için yeniden yapılmış (remake) hali. Kanto bölgesindeki orijinal 151 Pokémon macerasını yepyeni grafikler ve Sevii Adaları keşif bölgesiyle sunar.",
    image: "https://upload.wikimedia.org/wikipedia/en/5/5e/Pokemon_FireRed_box_art.jpg"
  },
  {
    id: "mario-kart-super-circuit",
    title: "Mario Kart: Super Circuit",
    system: "gba",
    filenameKeywords: ["mario kart super circuit", "mario kart gba", "mk gba"],
    developer: "Intelligent Systems",
    publisher: "Nintendo",
    releasedate: "2001-07-21",
    genre: "Racing",
    players: "4",
    rating: "0.90",
    description: "Taşınabilir konsoldaki ilk Mario Kart oyunu. Klasik Mode 7 grafik tarzını yepyeni pistler ve eski SNES pistleri ile birleştirerek harika bir el konsolu yarış deneyimi sunar.",
    image: "https://upload.wikimedia.org/wikipedia/en/e/e0/Mario_Kart_Super_Circuit_GBA_Game_Cover.jpg"
  },

  // ==================== NES (Nintendo Entertainment System) ====================
  {
    id: "super-mario-bros-3",
    title: "Super Mario Bros. 3",
    system: "nes",
    filenameKeywords: ["super mario bros 3", "smb3", "mario 3"],
    developer: "Nintendo EAD",
    publisher: "Nintendo",
    releasedate: "1988-10-23",
    genre: "Platform",
    players: "2",
    rating: "0.98",
    description: "Mario ve Luigi'nin dünyayı gezdiği, yaprak kostümü ile uçma, kurbağa kostümü ile yüzme gibi efsanevi özelliklerin ilk kez sunulduğu, 8-bit çağının en muhteşem platform oyunu.",
    image: "https://upload.wikimedia.org/wikipedia/en/a/a5/Super_Mario_Bros._3_coverart.png"
  },
  {
    id: "legend-of-zelda-nes",
    title: "The Legend of Zelda",
    system: "nes",
    filenameKeywords: ["legend of zelda nes", "zelda 1 nes", "zelda1"],
    developer: "Nintendo EAD",
    publisher: "Nintendo",
    releasedate: "1986-02-21",
    genre: "Action-Adventure",
    players: "1",
    rating: "0.91",
    description: "Link'in Prenses Zelda'yı kurtarmak ve Triforce parçalarını toplamak için zindanları keşfettiği, tüm macera türünün atası kabul edilen efsanevi altın kasetli NES oyunu.",
    image: "https://upload.wikimedia.org/wikipedia/en/4/41/Legend_of_zelda_cover.jpg"
  },

  // ==================== Megadrive (Sega Genesis) ====================
  {
    id: "sonic-the-hedgehog-2",
    title: "Sonic the Hedgehog 2",
    system: "megadrive",
    filenameKeywords: ["sonic the hedgehog 2", "sonic 2", "sonic2"],
    developer: "Sonic Team",
    publisher: "Sega",
    releasedate: "1992-11-21",
    genre: "Platform",
    players: "2",
    rating: "0.95",
    description: "Sega'nın maskotu hızlı kirpi Sonic ve iki kuyruklu sadık dostu Tails'in, Dr. Robotnik'in Death Egg silahını engellemeye çalıştığı hızlı, akıcı ve mükemmel müzikli 16-bit Sega klasiği.",
    image: "https://upload.wikimedia.org/wikipedia/en/0/0c/Sonic_2_US_Cover.jpg"
  },
  {
    id: "streets-of-rage-2",
    title: "Streets of Rage 2",
    system: "megadrive",
    filenameKeywords: ["streets of rage 2", "sor2", "streets of rage ii"],
    developer: "Ancient",
    publisher: "Sega",
    releasedate: "1992-12-20",
    genre: "Beat 'em up",
    players: "2",
    rating: "0.96",
    description: "Axel, Blaze, Max ve Skate'in, kaçırılan arkadaşları Adam'ı kurtarmak ve Mr. X'in suç örgütünü çökertmek için sokakları temizlediği, Yuzo Koshiro imzalı müzikleriyle ünlü gelmiş geçmiş en iyi dövüş-ilerlemeli (Beat 'em up) oyun.",
    image: "https://upload.wikimedia.org/wikipedia/en/1/1a/Streets_of_Rage_2_Genesis_Cover_Art.jpg"
  },

  // ==================== PS1 (PlayStation 1) ====================
  {
    id: "crash-bandicoot-3",
    title: "Crash Bandicoot: Warped",
    system: "psx",
    filenameKeywords: ["crash bandicoot 3", "crash 3", "crash warped"],
    developer: "Naughty Dog",
    publisher: "Sony Computer Entertainment",
    releasedate: "1998-10-31",
    genre: "Platform",
    players: "1",
    rating: "0.94",
    description: "Crash ve Coco'nun, Neo Cortex ve Dr. N. Tropy'nin zamanda yarattığı portallardan geçerek kristalleri topladığı, PlayStation 1 döneminin en eğlenceli ve ikonik 3D platform macera oyunu.",
    image: "https://upload.wikimedia.org/wikipedia/en/3/3a/Crash_Bandicoot_Warped_Original_Box_Art.jpg"
  },
  {
    id: "final-fantasy-7",
    title: "Final Fantasy VII",
    system: "psx",
    filenameKeywords: ["final fantasy 7", "ff7", "final fantasy vii"],
    developer: "Square",
    publisher: "Square",
    releasedate: "1997-01-31",
    genre: "Role-Playing",
    players: "1",
    rating: "0.98",
    description: "Cloud Strife'ın eko-terörist grup AVALANCHE ile birlikte mega-şirket Shinra'ya karşı mücadele ettiği ve ardından efsanevi Sephiroth'u durdurmaya çalıştığı, RPG tarihini sonsuza dek değiştiren sinematik şaheser.",
    image: "https://upload.wikimedia.org/wikipedia/en/c/c2/Ff7boxart.jpg"
  },

  // ==================== N64 (Nintendo 64) ====================
  {
    id: "super-mario-64",
    title: "Super Mario 64",
    system: "n64",
    filenameKeywords: ["super mario 64", "mario 64", "sm64"],
    developer: "Nintendo EAD",
    publisher: "Nintendo",
    releasedate: "1996-06-23",
    genre: "Platform",
    players: "1",
    rating: "0.96",
    description: "3D kamera kontrolleri ve analog hareket özgürlüğüyle 3D platform oyunlarının standartlarını belirleyen, Peach'in kalesini ve tabloların arkasındaki dünyaları keşfettiğimiz başyapıt.",
    image: "https://upload.wikimedia.org/wikipedia/en/6/6a/Super_Mario_64_box_cover.jpg"
  },
  {
    id: "legend-of-zelda-ocarina-of-time",
    title: "The Legend of Zelda: Ocarina of Time",
    system: "n64",
    filenameKeywords: ["ocarina of time", "oot", "zelda ocarina"],
    developer: "Nintendo EAD",
    publisher: "Nintendo",
    releasedate: "1998-11-21",
    genre: "Action-Adventure",
    players: "1",
    rating: "0.99",
    description: "Link'in çocukluk ve yetişkinlik dönemleri arasında zamanda yolculuk yaparak Ganondorf'u engellemeye çalıştığı, oyun eleştirmenleri tarafından sıkça 'gelmiş geçmiş en iyi oyun' seçilen muazzam başyapıt.",
    image: "https://upload.wikimedia.org/wikipedia/en/5/57/The_Legend_of_Zelda_Ocarina_of_Time_Dec_1998_Developer_Nintendo_Publisher_Nintendo_Genre_Action-Adventure_Platform_Nintendo_64.jpg"
  }
];

if (typeof module !== 'undefined') {
  module.exports = RETRO_GAME_DB;
}
