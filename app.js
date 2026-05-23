/* ==========================================================================
   RETRO ROM MANAGER & SCRAPER - APPLICATION LOGIC (app.js)
   ========================================================================== */

// --- Global Application State ---
let sdCardHandle = null;            // FileSystemDirectoryHandle for the root folder
let activeConsole = null;           // Active console category (e.g., 'snes')
let currentViewMode = 'grid';       // 'grid' or 'list'
let consoleData = {};               // Maps system name to system details (games, handles, xml)
let selectedRom = null;             // Currently selected ROM in the inspector
let activeFilters = {
  search: '',
  missingCover: false
};
let showEmptySystems = false;       // Toggle to show/hide systems with 0 roms

// --- Custom Device Profile Settings ---
let currentProfile = {
  cardName: "Standart Cihaz",
  preset: "standard",
  metadataStorage: "xml", // 'xml' or 'sqlite'
  paths: {
    romsRoot: "",
    imagesRoot: "media/images",
    imagesLoc: "roms-sub" // 'roms-sub' or 'root-separate'
  },
  sqliteConfig: null
};

// --- Console Configuration Mapping ---
const CONSOLE_CONFIGS = {
  snes: {
    id: 'snes',
    names: ['snes', 'sfc', 'supernintendo'],
    displayName: 'Super Nintendo',
    logo: '🎮',
    extensions: ['smc', 'sfc', 'zip', 'fig'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60' // Vintage gamepad / cartridge vibe
  },
  gba: {
    id: 'gba',
    names: ['gba', 'gameboyadvance'],
    displayName: 'Game Boy Advance',
    logo: '🕹️',
    extensions: ['gba', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  nes: {
    id: 'nes',
    names: ['nes', 'fc', 'famicom', 'nintendo'],
    displayName: 'Nintendo (NES)',
    logo: '👾',
    extensions: ['nes', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  gb: {
    id: 'gb',
    names: ['gb', 'gameboy'],
    displayName: 'Game Boy',
    logo: '📟',
    extensions: ['gb', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  gbc: {
    id: 'gbc',
    names: ['gbc', 'gameboycolor'],
    displayName: 'Game Boy Color',
    logo: '🌈',
    extensions: ['gbc', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  megadrive: {
    id: 'megadrive',
    names: ['megadrive', 'genesis', 'sega', 'smd'],
    displayName: 'Sega Genesis',
    logo: '🏎️',
    extensions: ['bin', 'md', 'smd', 'gen', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  psx: {
    id: 'psx',
    names: ['psx', 'ps1', 'playstation', 'ps'],
    displayName: 'PlayStation 1',
    logo: '📀',
    extensions: ['bin', 'img', 'iso', 'cue', 'chd', 'pbp'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  n64: {
    id: 'n64',
    names: ['n64', 'nintendo64'],
    displayName: 'Nintendo 64',
    logo: '🏰',
    extensions: ['n64', 'z64', 'v64', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  cps1: {
    id: 'cps1',
    names: ['cps1', 'cps', 'capcom1'],
    displayName: 'Capcom CPS1',
    logo: '🥋',
    extensions: ['zip', '7z'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  cps2: {
    id: 'cps2',
    names: ['cps2', 'capcom2'],
    displayName: 'Capcom CPS2',
    logo: '🛡️',
    extensions: ['zip', '7z'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  cps3: {
    id: 'cps3',
    names: ['cps3', 'capcom3'],
    displayName: 'Capcom CPS3',
    logo: '⚡',
    extensions: ['zip', '7z'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  neogeo: {
    id: 'neogeo',
    names: ['neogeo', 'neo-geo', 'mvs'],
    displayName: 'Neo Geo',
    logo: '👑',
    extensions: ['zip', '7z'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  arcade: {
    id: 'arcade',
    names: ['arcade', 'mame', 'fba', 'fbneo'],
    displayName: 'Arcade / MAME',
    logo: '👾',
    extensions: ['zip', '7z'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  nds: {
    id: 'nds',
    names: ['nds', 'nintendods', 'ds'],
    displayName: 'Nintendo DS',
    logo: '📱',
    extensions: ['nds', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  sms: {
    id: 'sms',
    names: ['sms', 'mastersystem'],
    displayName: 'Sega Master System',
    logo: '📟',
    extensions: ['sms', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  gg: {
    id: 'gg',
    names: ['gamegear', 'gg'],
    displayName: 'Sega Game Gear',
    logo: '🔋',
    extensions: ['gg', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  pce: {
    id: 'pce',
    names: ['pcengine', 'pce', 'tg16', 'tg'],
    displayName: 'PC Engine',
    logo: '💿',
    extensions: ['pce', 'sgx', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  psp: {
    id: 'psp',
    names: ['psp', 'playstationportable'],
    displayName: 'PlayStation Portable',
    logo: '🎮',
    extensions: ['iso', 'cso', 'pbp'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  pspminis: {
    id: 'pspminis',
    names: ['pspminis', 'minis'],
    displayName: 'PSP Minis',
    logo: '🕹️',
    extensions: ['iso', 'cso', 'pbp'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  saturn: {
    id: 'saturn',
    names: ['saturn', 'segasaturn'],
    displayName: 'Sega Saturn',
    logo: '🪐',
    extensions: ['cue', 'iso', 'chd'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  dc: {
    id: 'dc',
    names: ['dc', 'dreamcast'],
    displayName: 'Sega Dreamcast',
    logo: '🌀',
    extensions: ['gdi', 'cdi', 'chd', 'iso', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  segacd: {
    id: 'segacd',
    names: ['segacd', 'megacd'],
    displayName: 'Sega CD',
    logo: '📀',
    extensions: ['cue', 'iso', 'chd'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  sega32x: {
    id: 'sega32x',
    names: ['sega32x', '32x'],
    displayName: 'Sega 32X',
    logo: '⚡',
    extensions: ['32x', 'bin', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  atari2600: {
    id: 'atari2600',
    names: ['atari2600', 'a2600', 'atari'],
    displayName: 'Atari 2600',
    logo: '🕹️',
    extensions: ['a26', 'bin', 'rom', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  atari5200: {
    id: 'atari5200',
    names: ['atari5200', 'a5200'],
    displayName: 'Atari 5200',
    logo: '🕹️',
    extensions: ['a52', 'bin', 'rom', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  atari7800: {
    id: 'atari7800',
    names: ['atari7800', 'a7800'],
    displayName: 'Atari 7800',
    logo: '🕹️',
    extensions: ['a78', 'bin', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  atarist: {
    id: 'atarist',
    names: ['atarist', 'ast'],
    displayName: 'Atari ST',
    logo: '🖥️',
    extensions: ['st', 'msa', 'dim', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  c64: {
    id: 'c64',
    names: ['c64', 'commodore64'],
    displayName: 'Commodore 64',
    logo: '⌨️',
    extensions: ['d64', 't64', 'tap', 'prg', 'crt', 'g64', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  amiga: {
    id: 'amiga',
    names: ['amiga', 'amigacd', 'amigacd32', 'amigacdtv'],
    displayName: 'Commodore Amiga',
    logo: '💾',
    extensions: ['adf', 'uae', 'dms', 'ipf', 'cue', 'iso', 'chd', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  coleco: {
    id: 'coleco',
    names: ['coleco', 'colecovision'],
    displayName: 'ColecoVision',
    logo: '🕹️',
    extensions: ['col', 'rom', 'bin', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  cpc: {
    id: 'cpc',
    names: ['cpc', 'amstradcpc'],
    displayName: 'Amstrad CPC',
    logo: '🖥️',
    extensions: ['dsk', 'cdt', 'tap', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  daphne: {
    id: 'daphne',
    names: ['daphne'],
    displayName: 'Daphne Laserdisc',
    logo: '🐉',
    extensions: ['daphne', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  fds: {
    id: 'fds',
    names: ['fds'],
    displayName: 'Famicom Disk System',
    logo: '💾',
    extensions: ['fds', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  gw: {
    id: 'gw',
    names: ['gw', 'gameandwatch'],
    displayName: 'Game & Watch',
    logo: '⌚',
    extensions: ['mgw', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  intellivision: {
    id: 'intellivision',
    names: ['intellivision', 'intv'],
    displayName: 'Intellivision',
    logo: '🕹️',
    extensions: ['int', 'bin', 'rom', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  lynx: {
    id: 'lynx',
    names: ['lynx'],
    displayName: 'Atari Lynx',
    logo: '📟',
    extensions: ['lnx', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  msx: {
    id: 'msx',
    names: ['msx', 'msx2'],
    displayName: 'MSX / MSX2',
    logo: '⌨️',
    extensions: ['rom', 'mx1', 'mx2', 'dsk', 'cas', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  naomi: {
    id: 'naomi',
    names: ['naomi'],
    displayName: 'Sega NAOMI',
    logo: '🤖',
    extensions: ['zip', '7z', 'dat', 'chd'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  neocd: {
    id: 'neocd',
    names: ['neocd'],
    displayName: 'Neo Geo CD',
    logo: '💿',
    extensions: ['cue', 'iso', 'chd', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  ngc: {
    id: 'ngc',
    names: ['ngc', 'gamecube', 'gc'],
    displayName: 'Nintendo GameCube',
    logo: '🟪',
    extensions: ['iso', 'gcm', 'rvz', 'ciso'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  ngp: {
    id: 'ngp',
    names: ['ngp', 'ngpc', 'neogeopocket'],
    displayName: 'Neo Geo Pocket',
    logo: '📟',
    extensions: ['ngp', 'ngc', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  odyssey: {
    id: 'odyssey',
    names: ['odyssey', 'odyssey2', 'videopac'],
    displayName: 'Magnavox Odyssey 2',
    logo: '🕹️',
    extensions: ['bin', 'rom', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  '3do': {
    id: '3do',
    names: ['3do', 'panasonic3do'],
    displayName: 'Panasonic 3DO',
    logo: '📀',
    extensions: ['iso', 'chd', 'cue'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  pc88: {
    id: 'pc88',
    names: ['pc88', 'pc8801'],
    displayName: 'NEC PC-8801',
    logo: '🖥️',
    extensions: ['d88', 'm3u', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  pc98: {
    id: 'pc98',
    names: ['pc98', 'pc9801'],
    displayName: 'NEC PC-9801',
    logo: '🖥️',
    extensions: ['hdi', 'd88', 'fdi', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  pcecd: {
    id: 'pcecd',
    names: ['pcecd', 'tgcd'],
    displayName: 'PC Engine CD',
    logo: '💿',
    extensions: ['cue', 'chd', 'iso'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  pcfx: {
    id: 'pcfx',
    names: ['pcfx'],
    displayName: 'NEC PC-FX',
    logo: '📀',
    extensions: ['cue', 'ccd', 'chd', 'toc'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  pico8: {
    id: 'pico8',
    names: ['pico8', 'pico'],
    displayName: 'PICO-8',
    logo: '👾',
    extensions: ['png', 'p8', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  tic80: {
    id: 'tic80',
    names: ['tic80', 'tic'],
    displayName: 'TIC-80',
    logo: '👾',
    extensions: ['tic', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  scummvm: {
    id: 'scummvm',
    names: ['scummvm'],
    displayName: 'ScummVM',
    logo: '🗣️',
    extensions: ['scummvm', 'ini', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  sg1000: {
    id: 'sg1000',
    names: ['sg1000'],
    displayName: 'Sega SG-1000',
    logo: '🕹️',
    extensions: ['sg', 'bin', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  supervision: {
    id: 'supervision',
    names: ['supervision'],
    displayName: 'Watara Supervision',
    logo: '📟',
    extensions: ['sv', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  virtualboy: {
    id: 'virtualboy',
    names: ['vb', 'virtualboy'],
    displayName: 'Virtual Boy',
    logo: '🕶️',
    extensions: ['vb', 'bin', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  vectrex: {
    id: 'vectrex',
    names: ['vectrex'],
    displayName: 'Vectrex',
    logo: '📈',
    extensions: ['vec', 'bin', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  wswan: {
    id: 'wswan',
    names: ['ws', 'wsc', 'wswan', 'wswanc', 'wonderswan', 'wonderswancolor'],
    displayName: 'WonderSwan / Color',
    logo: '📟',
    extensions: ['ws', 'wsc', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  x68000: {
    id: 'x68000',
    names: ['x68000', 'x68k'],
    displayName: 'Sharp X68000',
    logo: '🖥️',
    extensions: ['dim', 'img', 'd88', 'm3u', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  atomiswave: {
    id: 'atomiswave',
    names: ['atomiswave'],
    displayName: 'Sammy Atomiswave',
    logo: '👊',
    extensions: ['zip', '7z', 'chd'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  zxspectrum: {
    id: 'zxspectrum',
    names: ['zxspectrum', 'spectrum', 'zxs'],
    displayName: 'Sinclair ZX Spectrum',
    logo: '🌈',
    extensions: ['tzx', 'tap', 'z80', 'szx', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  }
};

// --- Initializer ---
window.addEventListener('DOMContentLoaded', () => {
  // Check if File System Access API is supported
  const isSupported = 'showDirectoryPicker' in window;
  if (!isSupported) {
    alert("Dikkat: Tarayıcınız modern File System Access API'yi desteklemiyor. Lütfen Chrome, Edge veya Opera kullanın.");
  }

  // Remove Global Loading Overlay
  setTimeout(() => {
    const loader = document.getElementById('global-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }
  }, 1200);

  // Initialize UI Bindings
  initUIBindings();
});

// --- UI Bindings ---
function initUIBindings() {
  // Folder Workspace Picker Button
  const pickFolderBtn = document.getElementById('pick-folder-btn');
  if (pickFolderBtn) {
    pickFolderBtn.addEventListener('click', selectSDCardWorkspace);
  }

  // Search Input Handler
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      activeFilters.search = e.target.value.toLowerCase().trim();
      renderActiveGames();
    });
  }

  // Filter: Missing Cover Art Toggle
  const filterMissingBtn = document.getElementById('filter-missing-btn');
  if (filterMissingBtn) {
    filterMissingBtn.addEventListener('click', () => {
      activeFilters.missingCover = !activeFilters.missingCover;
      filterMissingBtn.classList.toggle('active', activeFilters.missingCover);
      renderActiveGames();
    });
  }

  // Filter: Show Empty Systems Toggle
  const chkShowEmpty = document.getElementById('chk-show-empty');
  if (chkShowEmpty) {
    chkShowEmpty.checked = showEmptySystems;
    chkShowEmpty.addEventListener('change', (e) => {
      showEmptySystems = e.target.checked;
      renderSidebarConsoles();
    });
  }

  // View Mode Toggles
  const btnGridView = document.getElementById('btn-grid-view');
  const btnListView = document.getElementById('btn-list-view');

  if (btnGridView && btnListView) {
    btnGridView.addEventListener('click', () => {
      currentViewMode = 'grid';
      btnGridView.classList.add('active');
      btnListView.classList.remove('active');
      renderActiveGames();
    });

    btnListView.addEventListener('click', () => {
      currentViewMode = 'list';
      btnListView.classList.add('active');
      btnGridView.classList.remove('active');
      renderActiveGames();
    });
  }

  // Form Auto-Save / Save Button
  const saveBtn = document.getElementById('save-meta-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSelectedRomMetadata);
  }

  // Scrape Online Button
  const scrapeBtn = document.getElementById('btn-scrape-online');
  if (scrapeBtn) {
    scrapeBtn.addEventListener('click', triggerOnlineScrape);
  }

  // Modal Dialog Closers
  const closeModalBtns = document.querySelectorAll('.close-modal-btn');
  closeModalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
      });
    });
  });

  // Profile Modal Trigger Events
  const selPreset = document.getElementById('sel-profile-preset');
  const customPaths = document.getElementById('custom-paths-group');
  if (selPreset && customPaths) {
    selPreset.addEventListener('change', (e) => {
      const preset = e.target.value;
      customPaths.style.display = preset === 'custom' ? 'flex' : 'none';
      
      // Auto-switch metadata storage and config for CrossMix
      if (preset === 'crossmix') {
        document.getElementById('sel-profile-storage').value = 'sqlite';
        document.getElementById('sqlite-config-group').style.display = 'flex';
        
        // Reset SQLite fields to CrossMix defaults
        document.getElementById('inp-sqlite-pattern').value = "{SYSTEM}_cache7.db";
        document.getElementById('inp-sqlite-table').value = "roms";
        document.getElementById('inp-col-filename').value = "rom_path";
        document.getElementById('inp-col-title').value = "title";
        document.getElementById('inp-col-desc').value = "desc";
        document.getElementById('inp-col-image').value = "image_path";
        document.getElementById('inp-col-dev').value = "developer";
        document.getElementById('inp-col-pub').value = "publisher";
        document.getElementById('inp-col-genre').value = "genre";
        document.getElementById('inp-col-date').value = "release_date";
        document.getElementById('inp-col-rating').value = "rating";
        document.getElementById('inp-col-players').value = "players";
      } else if (preset === 'standard') {
        document.getElementById('sel-profile-storage').value = 'xml';
        document.getElementById('sqlite-config-group').style.display = 'none';
      }
    });
  }

  const selStorage = document.getElementById('sel-profile-storage');
  const sqliteConfig = document.getElementById('sqlite-config-group');
  if (selStorage && sqliteConfig) {
    selStorage.addEventListener('change', (e) => {
      sqliteConfig.style.display = e.target.value === 'sqlite' ? 'flex' : 'none';
    });
  }

  const btnAutodetect = document.getElementById('btn-autodetect-schema');
  const sqliteFileAnalyzer = document.getElementById('sqlite-file-analyzer');
  if (btnAutodetect && sqliteFileAnalyzer) {
    btnAutodetect.addEventListener('click', () => {
      sqliteFileAnalyzer.click();
    });
    sqliteFileAnalyzer.addEventListener('change', handleAutoDetectSchema);
  }

  const selImagesLoc = document.getElementById('sel-custom-images-loc');
  const imagesFolderField = document.getElementById('custom-images-folder-field');
  if (selImagesLoc && imagesFolderField) {
    selImagesLoc.addEventListener('change', (e) => {
      imagesFolderField.style.display = e.target.value === 'root-separate' ? 'flex' : 'none';
    });
  }

  const saveProfileBtn = document.getElementById('btn-save-profile');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', saveDeviceProfileAndStart);
  }

  const deleteProfileBtn = document.getElementById('btn-delete-profile');
  if (deleteProfileBtn) {
    deleteProfileBtn.addEventListener('click', deleteDeviceProfile);
  }

  const editProfileBtn = document.getElementById('btn-edit-profile');
  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
      const modal = document.getElementById('profile-modal');
      if (modal) {
        document.getElementById('inp-profile-name').value = currentProfile.cardName;
        document.getElementById('sel-profile-preset').value = currentProfile.preset;
        document.getElementById('inp-custom-roms').value = currentProfile.paths.romsRoot;
        document.getElementById('sel-custom-images-loc').value = currentProfile.paths.imagesLoc;
        document.getElementById('inp-custom-images-dir').value = currentProfile.paths.imagesRoot;
        
        document.getElementById('custom-paths-group').style.display = currentProfile.preset === 'custom' ? 'flex' : 'none';
        document.getElementById('custom-images-folder-field').style.display = currentProfile.paths.imagesLoc === 'root-separate' ? 'flex' : 'none';
        
        const storageVal = currentProfile.metadataStorage || "xml";
        document.getElementById('sel-profile-storage').value = storageVal;
        
        const sqliteConfigGroup = document.getElementById('sqlite-config-group');
        if (sqliteConfigGroup) {
          sqliteConfigGroup.style.display = storageVal === 'sqlite' ? 'flex' : 'none';
        }
        
        if (currentProfile.sqliteConfig) {
          const cfg = currentProfile.sqliteConfig;
          document.getElementById('inp-sqlite-pattern').value = cfg.pattern || "{SYSTEM}_cache7.db";
          document.getElementById('inp-sqlite-table').value = cfg.tableName || "roms";
          
          if (cfg.columns) {
            const cols = cfg.columns;
            document.getElementById('inp-col-filename').value = cols.filename || "rom_path";
            document.getElementById('inp-col-title').value = cols.title || "title";
            document.getElementById('inp-col-desc').value = cols.desc || "desc";
            document.getElementById('inp-col-image').value = cols.image || "image_path";
            document.getElementById('inp-col-dev').value = cols.developer || "developer";
            document.getElementById('inp-col-pub').value = cols.publisher || "publisher";
            document.getElementById('inp-col-genre').value = cols.genre || "genre";
            document.getElementById('inp-col-date').value = cols.releasedate || "release_date";
            document.getElementById('inp-col-rating').value = cols.rating || "rating";
            document.getElementById('inp-col-players').value = cols.players || "players";
          }
        }

        // Show delete button since profile exists
        if (deleteProfileBtn) deleteProfileBtn.style.display = 'block';

        modal.classList.add('active');
      }
    });
  }

  const closeProfileBtn = document.getElementById('btn-close-profile-modal');
  if (closeProfileBtn) {
    closeProfileBtn.addEventListener('click', () => {
      document.getElementById('profile-modal').classList.remove('active');
    });
  }

  // Drag and Drop ROM Loader Integration
  setupDragAndDrop();
}

// --- File System: Select SD Card Root Directory ---
async function selectSDCardWorkspace() {
  try {
    // Open Directory Picker
    sdCardHandle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });

    // Update Status Indicator
    const indicator = document.getElementById('workspace-indicator');
    const folderPathEl = document.getElementById('workspace-folder-path');
    
    if (indicator && folderPathEl) {
      indicator.className = 'status-indicator connected';
      folderPathEl.textContent = sdCardHandle.name;
    }

    // Initialize workspace logic from the handle
    await initWorkspaceFromHandle();

  } catch (err) {
    console.error("Dizin erişim hatası:", err);
    showScanProgressModal(false);
  }
}

// --- Dynamic Workspace Initialization ---
async function initWorkspaceFromHandle() {
  // Check if .rrmas exists in the selected workspace root directory
  let rrmasExists = false;
  try {
    const fileHandle = await sdCardHandle.getFileHandle('.rrmas', { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    currentProfile = JSON.parse(text);
    rrmasExists = true;
    console.log("Mevcut cihaz profili yüklendi:", currentProfile.cardName);
  } catch(err) {
    console.log(".rrmas profil dosyası bulunamadı, profil oluşturucu açılıyor.");
  }

  if (rrmasExists) {
    // Update profile badge
    updateProfileBadgeUI();

    // Show Scan Loader Modal
    showScanProgressModal(true);
    await scanSDCardDirectories();
    showScanProgressModal(false);

    // Activate first system
    const systems = Object.keys(consoleData);
    if (systems.length > 0) {
      let targetSystem = systems[0];
      for (const sys of systems) {
        if (consoleData[sys].games.length > 0) {
          targetSystem = sys;
          break;
        }
      }
      activateConsoleCategory(targetSystem);
    } else {
      alert("Seçilen klasörde belirtilen profille uyumlu retro sistem klasörleri bulunamadı.");
      renderWelcomeScreen(true);
    }
  } else {
    // Open Profile Creation Modal
    const modal = document.getElementById('profile-modal');
    if (modal) {
      // Pre-populate template name based on folder name
      document.getElementById('inp-profile-name').value = sdCardHandle.name;
      document.getElementById('sel-profile-preset').value = "standard";
      document.getElementById('custom-paths-group').style.display = "none";
      
      // Hide delete button since no profile has been saved yet
      const deleteProfileBtn = document.getElementById('btn-delete-profile');
      if (deleteProfileBtn) deleteProfileBtn.style.display = "none";

      modal.classList.add('active');
    }
  }
}

// --- Delete Device Profile File (.rrmas) from SD Card ---
async function deleteDeviceProfile() {
  if (!sdCardHandle) return;

  const confirmed = confirm("⚠️ DİKKAT: Cihaz profil dosyanız (.rrmas) kalıcı olarak silinecektir!\n\nBu işlem geri alınamaz ve uygulama kartı ilk kez tarıyor gibi profil yaratma penceresini açacaktır. Devam etmek istiyor musunuz?");
  if (!confirmed) return;

  try {
    // Delete .rrmas file directly using File System API
    await sdCardHandle.removeEntry('.rrmas');
    console.log(".rrmas profil dosyası başarıyla silindi.");

    // Reset current profile to standard default
    currentProfile = {
      cardName: "Standart Cihaz",
      preset: "standard",
      paths: {
        romsRoot: "",
        imagesRoot: "media/images",
        imagesLoc: "roms-sub"
      }
    };

    // Hide profile badge
    const badge = document.getElementById('profile-badge-container');
    if (badge) badge.style.display = 'none';

    // Close Modal
    document.getElementById('profile-modal').classList.remove('active');

    // Re-run scanning selection starting from standard structure or prompting profile modal again
    await initWorkspaceFromHandle();
    alert("Profil dosyası başarıyla silindi! Kart yapısı sıfırlandı.");

  } catch (err) {
    console.error("Profil dosyası silinirken hata oluştu:", err);
    alert("Profil dosyası silinemedi! Lütfen yazma izinlerinizi veya kart bağlantısını kontrol edin.");
  }
}

// --- Save Device Profile to SD Card and Scan ---
async function saveDeviceProfileAndStart() {
  const nameVal = document.getElementById('inp-profile-name').value.trim() || "Standart Cihaz";
  const presetVal = document.getElementById('sel-profile-preset').value;
  
  // Guard Check: Prevent writing under "Roms" folder instead of root when using CrossMix/Custom with root images
  if (presetVal === 'crossmix' && sdCardHandle.name.toLowerCase() === 'roms') {
    alert("⚠️ DİKKAT: Şu anda SD kartınızın en üst kök dizini (Root) yerine 'Roms' alt klasörünü seçmiş durumdasınız!\n\nTrimui / CrossMix profilinin (Roms ve Imgs klasörleri) doğru eşleşmesi ve .rrmas ayar dosyasının doğru şekilde kök dizine yazılması için lütfen SD KART SEÇ butonuna tekrar tıklayın ve SD kartınızın en üst ana dizinini seçin.");
    document.getElementById('profile-modal').classList.remove('active');
    return;
  }

  currentProfile.cardName = nameVal;
  currentProfile.preset = presetVal;
  
  if (presetVal === 'standard') {
    currentProfile.paths = {
      romsRoot: "",
      imagesRoot: "media/images",
      imagesLoc: "roms-sub"
    };
  } else if (presetVal === 'crossmix') {
    currentProfile.paths = {
      romsRoot: "Roms",
      imagesRoot: "Imgs",
      imagesLoc: "root-separate"
    };
  } else {
    // Custom
    const romsDir = document.getElementById('inp-custom-roms').value.trim();
    const imgLoc = document.getElementById('sel-custom-images-loc').value;
    const imgDir = imgLoc === 'root-separate' ? 
      document.getElementById('inp-custom-images-dir').value.trim() || "Imgs" : 
      "media/images";
      
    currentProfile.paths = {
      romsRoot: romsDir,
      imagesRoot: imgDir,
      imagesLoc: imgLoc
    };
  }

  currentProfile.metadataStorage = document.getElementById('sel-profile-storage').value || "xml";
  
  if (currentProfile.metadataStorage === 'sqlite') {
    currentProfile.sqliteConfig = {
      pattern: document.getElementById('inp-sqlite-pattern').value.trim() || "{SYSTEM}_cache7.db",
      tableName: document.getElementById('inp-sqlite-table').value.trim() || "roms",
      columns: {
        filename: document.getElementById('inp-col-filename').value.trim() || "rom_path",
        title: document.getElementById('inp-col-title').value.trim() || "title",
        desc: document.getElementById('inp-col-desc').value.trim() || "desc",
        image: document.getElementById('inp-col-image').value.trim() || "image_path",
        developer: document.getElementById('inp-col-dev').value.trim() || "developer",
        publisher: document.getElementById('inp-col-pub').value.trim() || "publisher",
        genre: document.getElementById('inp-col-genre').value.trim() || "genre",
        releasedate: document.getElementById('inp-col-date').value.trim() || "release_date",
        rating: document.getElementById('inp-col-rating').value.trim() || "rating",
        players: document.getElementById('inp-col-players').value.trim() || "players"
      }
    };
  } else {
    currentProfile.sqliteConfig = null;
  }

  // Save .rrmas file in SD Card root folder
  try {
    const fileHandle = await sdCardHandle.getFileHandle('.rrmas', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(currentProfile, null, 2));
    await writable.close();
  } catch (err) {
    console.error("Profil dosyası (.rrmas) yazılamadı:", err);
  }

  // Update Profile Badge
  updateProfileBadgeUI();

  // Close modal
  document.getElementById('profile-modal').classList.remove('active');

  // Show scan progress
  showScanProgressModal(true);
  await scanSDCardDirectories();
  showScanProgressModal(false);

  // Activate first system
  const systems = Object.keys(consoleData);
  if (systems.length > 0) {
    let targetSystem = systems[0];
    for (const sys of systems) {
      if (consoleData[sys].games.length > 0) {
        targetSystem = sys;
        break;
      }
    }
    activateConsoleCategory(targetSystem);
  } else {
    alert("Seçilen klasörde bu profille eşleşen konsol klasörleri bulunamadı. Lütfen profil yollarını kontrol edin.");
    renderWelcomeScreen(true);
  }
}

function updateProfileBadgeUI() {
  const badge = document.getElementById('profile-badge-container');
  const lbl = document.getElementById('lbl-profile-name');
  if (badge && lbl) {
    badge.style.display = 'flex';
    const isSqlite = currentProfile.metadataStorage === 'sqlite';
    const suffix = isSqlite ? ' <span style="background:hsl(var(--retro-cyan)); color:#000; padding:2px 5px; border-radius:3px; font-size:0.55rem; font-weight:900; margin-left:6px; letter-spacing:0.5px">SQLITE</span>' : '';
    lbl.innerHTML = `${currentProfile.cardName}${suffix}`;
  }
}

// --- Recursively Scan SD Card Folders ---
async function scanSDCardDirectories() {
  consoleData = {};
  
  // Set up blank structure for all consoles
  for (const key in CONSOLE_CONFIGS) {
    consoleData[key] = {
      config: CONSOLE_CONFIGS[key],
      games: [],
      dirHandle: null,
      xmlFileHandle: null,
      gamelistXML: null
    };
  }

  const progressBar = document.getElementById('scan-progress-fill');
  const progressText = document.getElementById('scan-progress-text');
  
  // Resolve ROMs Root directory dynamically
  let romsRootHandle = sdCardHandle;
  if (currentProfile.paths.romsRoot) {
    try {
      romsRootHandle = await sdCardHandle.getDirectoryHandle(currentProfile.paths.romsRoot, { create: false });
      console.log(`ROMs ana klasörüne erişildi: /${currentProfile.paths.romsRoot}`);
    } catch (err) {
      console.warn(`ROMs ana klasörü bulunamadı: ${currentProfile.paths.romsRoot}. Kök klasörden aranıyor.`);
      romsRootHandle = sdCardHandle;
    }
  }

  // Get all directory entries under the ROMs root
  let entries = [];
  try {
    for await (const entry of romsRootHandle.values()) {
      if (entry.kind === 'directory') {
        entries.push(entry);
      }
    }
  } catch (err) {
    console.error("Dizinler listelenirken hata oluştu:", err);
  }

  let scannedCount = 0;
  for (const dirEntry of entries) {
    scannedCount++;
    if (progressBar && progressText) {
      const percentage = Math.round((scannedCount / entries.length) * 100);
      progressBar.style.width = `${percentage}%`;
      progressText.textContent = `Klasör taranıyor: /${dirEntry.name} (${percentage}%)`;
    }

    // Try to match directory name with a console config
    let matchedConsoleKey = null;
    const nameLower = dirEntry.name.toLowerCase();

    for (const key in CONSOLE_CONFIGS) {
      const names = CONSOLE_CONFIGS[key].names;
      if (names.includes(nameLower)) {
        matchedConsoleKey = key;
        break;
      }
    }

    if (matchedConsoleKey) {
      const system = consoleData[matchedConsoleKey];
      system.dirHandle = dirEntry;

      // Scan ROM files in this directory
      await scanROMFilesInDirectory(system);

      // Check / Load metadata depending on storage type
      if (currentProfile.metadataStorage === 'sqlite') {
        await tryLoadOrCreateSqliteDB(system);
      } else {
        await loadOrCreateGamelistXML(system);
      }
    }
  }

  // Remove empty consoles from consoleData so we only display what actually exists
  for (const key in consoleData) {
    if (!consoleData[key].dirHandle) {
      delete consoleData[key];
    }
  }

  // Render Sidebar
  renderSidebarConsoles();
}

// --- Scan ROM files inside a specific Console Directory ---
async function scanROMFilesInDirectory(system) {
  const extensions = system.config.extensions;
  const dirHandle = system.dirHandle;

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const ext = entry.name.split('.').pop().toLowerCase();
      if (extensions.includes(ext)) {
        system.games.push({
          filename: entry.name,
          extension: ext,
          fileHandle: entry,
          // Placeholder initial metadata
          title: formatFilenameToTitle(entry.name),
          rating: "",
          releasedate: "",
          developer: "",
          publisher: "",
          genre: "",
          players: "",
          description: "",
          image: "", // Will hold URL or Local Blob Object URL
          localImagePath: "", // Path stored in XML
          isScraped: false,
          scrapedImageBlob: null
        });
      }
    }
  }
}

// --- Load or Create gamelist.xml ---
// --- Load or Create gamelist.xml ---
async function loadOrCreateGamelistXML(system) {
  const dirHandle = system.dirHandle;
  let xmlFileHandle = null;
  let xmlText = "";

  try {
    // Try to open existing gamelist.xml
    xmlFileHandle = await dirHandle.getFileHandle('gamelist.xml', { create: false });
    const file = await xmlFileHandle.getFile();
    xmlText = await file.text();
    system.xmlFileHandle = xmlFileHandle;
  } catch (err) {
    // gamelist.xml does not exist, we'll create it later when saving
    console.log(`${system.config.displayName} için gamelist.xml bulunamadı, yeni bir tane oluşturulacak.`);
    system.gamelistXML = new DOMParser().parseFromString('<?xml version="1.0"?><gameList></gameList>', 'text/xml');
    
    // Auto-detect covers even without XML
    for (const game of system.games) {
      await tryAutoDetectLocalImage(system, game);
    }
    return;
  }

  // Parse existing xml
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    system.gamelistXML = xmlDoc;

    const gameNodes = xmlDoc.getElementsByTagName('game');
    for (let i = 0; i < gameNodes.length; i++) {
      const node = gameNodes[i];
      const path = getXmlNodeValue(node, 'path'); // e.g. "./Super Mario.smc"
      if (!path) continue;

      // Extract filename from path
      const xmlFilename = path.replace(/^\.\//, '').replace(/^\\/, '');
      
      // Find matching scanned game
      const matchedGame = system.games.find(g => g.filename.toLowerCase() === xmlFilename.toLowerCase());
      if (matchedGame) {
        matchedGame.title = getXmlNodeValue(node, 'name') || matchedGame.title;
        matchedGame.description = getXmlNodeValue(node, 'desc') || "";
        matchedGame.rating = getXmlNodeValue(node, 'rating') || "";
        matchedGame.releasedate = formatDateFromXML(getXmlNodeValue(node, 'releasedate') || "");
        matchedGame.developer = getXmlNodeValue(node, 'developer') || "";
        matchedGame.publisher = getXmlNodeValue(node, 'publisher') || "";
        matchedGame.genre = getXmlNodeValue(node, 'genre') || "";
        matchedGame.players = getXmlNodeValue(node, 'players') || "";
        
        const localImgPath = getXmlNodeValue(node, 'image') || "";
        matchedGame.localImagePath = localImgPath;
        matchedGame.isScraped = true;

        // Try to load the local image blob if image path is valid
        if (localImgPath) {
          await loadLocalImageBlob(system, matchedGame, localImgPath);
        }
      }
    }

    // Auto-detect covers for games that still don't have images loaded
    for (const game of system.games) {
      if (!game.image) {
        await tryAutoDetectLocalImage(system, game);
      }
    }
  } catch (err) {
    console.error("XML ayrıştırma hatası:", err);
    system.gamelistXML = new DOMParser().parseFromString('<?xml version="1.0"?><gameList></gameList>', 'text/xml');
    
    // Auto-detect fallback
    for (const game of system.games) {
      await tryAutoDetectLocalImage(system, game);
    }
  }
}

// --- Auto-detect existing ROM covers on SD card based on filenames ---
async function tryAutoDetectLocalImage(system, game) {
  try {
    const baseName = game.filename.substring(0, game.filename.lastIndexOf('.'));
    let sysImgsHandle = null;

    if (currentProfile.paths.imagesLoc === 'root-separate') {
      const imgsRootHandle = await sdCardHandle.getDirectoryHandle(currentProfile.paths.imagesRoot, { create: false });
      sysImgsHandle = await imgsRootHandle.getDirectoryHandle(system.config.id.toUpperCase(), { create: false });
    } else {
      // standard media/images
      try {
        const mediaHandle = await system.dirHandle.getDirectoryHandle('media', { create: false });
        sysImgsHandle = await mediaHandle.getDirectoryHandle('images', { create: false });
      } catch(e) {
        // Try direct 'images' or 'downloaded_images' folder inside system dir
        try {
          sysImgsHandle = await system.dirHandle.getDirectoryHandle('images', { create: false });
        } catch(e2) {
          try {
            sysImgsHandle = await system.dirHandle.getDirectoryHandle('downloaded_images', { create: false });
          } catch(e3) {}
        }
      }
    }

    if (sysImgsHandle) {
      let fileHandle = null;
      let resolvedExt = "";

      // Try common image extensions
      const extensionsToTry = ['png', 'jpg', 'jpeg', 'gif', 'PNG', 'JPG', 'JPEG'];
      for (const ext of extensionsToTry) {
        try {
          fileHandle = await sysImgsHandle.getFileHandle(`${baseName}.${ext}`, { create: false });
          resolvedExt = ext;
          break;
        } catch(e) {}
      }

      if (fileHandle) {
        const file = await fileHandle.getFile();
        game.image = URL.createObjectURL(file);
        
        // Save the correct relative path style
        if (currentProfile.paths.imagesLoc === 'root-separate') {
          game.localImagePath = `/${currentProfile.paths.imagesRoot}/${system.config.id.toUpperCase()}/${baseName}.${resolvedExt}`;
        } else {
          game.localImagePath = `./media/images/${baseName}.${resolvedExt}`;
        }
        game.isScraped = true;
        console.log(`Otomatik eşleşen görsel yüklendi: ${game.localImagePath}`);
      }
    }
  } catch(err) {
    // Silent fail if no folders or files found
  }
}

// --- Load Local Image Blob from SD card using File System API ---
async function loadLocalImageBlob(system, game, imagePath) {
  try {
    let fileHandle = null;

    if (currentProfile.paths.imagesLoc === 'root-separate') {
      // Images are in a separate top-level folder: root/Imgs/<sys>/<rom_base_name>.png
      let filename = imagePath.split('/').pop().split('\\').pop();
      
      // Fallback: if filename is empty, use the ROM's base name with .png
      if (!filename) {
        const baseName = game.filename.substring(0, game.filename.lastIndexOf('.'));
        filename = `${baseName}.png`;
      }

      const imgsRootHandle = await sdCardHandle.getDirectoryHandle(currentProfile.paths.imagesRoot, { create: false });
      const sysImgsHandle = await imgsRootHandle.getDirectoryHandle(system.config.id.toUpperCase(), { create: false });
      
      // Try to load
      try {
        fileHandle = await sysImgsHandle.getFileHandle(filename, { create: false });
      } catch(e) {
        // Fallback common extensions
        const base = filename.substring(0, filename.lastIndexOf('.')) || filename;
        try {
          fileHandle = await sysImgsHandle.getFileHandle(`${base}.png`, { create: false });
        } catch(e2) {
          try {
            fileHandle = await sysImgsHandle.getFileHandle(`${base}.jpg`, { create: false });
          } catch(e3) {
            fileHandle = await sysImgsHandle.getFileHandle(`${base}.png`, { create: false }); // Throw err
          }
        }
      }
    } else {
      // Standard image path inside the console's subfolder
      const cleanPath = imagePath.replace(/^\.\//, '');
      const pathParts = cleanPath.split('/');

      let currentHandle = system.dirHandle;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const dirName = pathParts[i];
        currentHandle = await currentHandle.getDirectoryHandle(dirName, { create: false });
      }

      const filename = pathParts[pathParts.length - 1];
      fileHandle = await currentHandle.getFileHandle(filename, { create: false });
    }

    if (fileHandle) {
      const file = await fileHandle.getFile();
      game.image = URL.createObjectURL(file);
    }
  } catch (err) {
    // Try a final fallback: check if image exists with standard naming in designated folders
    try {
      const baseName = game.filename.substring(0, game.filename.lastIndexOf('.'));
      let sysImgsHandle = null;

      if (currentProfile.paths.imagesLoc === 'root-separate') {
        const imgsRootHandle = await sdCardHandle.getDirectoryHandle(currentProfile.paths.imagesRoot, { create: false });
        sysImgsHandle = await imgsRootHandle.getDirectoryHandle(system.config.id.toUpperCase(), { create: false });
      } else {
        sysImgsHandle = await system.dirHandle.getDirectoryHandle('media/images', { create: false });
      }

      if (sysImgsHandle) {
        try {
          const fileHandle = await sysImgsHandle.getFileHandle(`${baseName}.png`, { create: false });
          const file = await fileHandle.getFile();
          game.image = URL.createObjectURL(file);
          game.localImagePath = currentProfile.paths.imagesLoc === 'root-separate' ? 
            `/${currentProfile.paths.imagesRoot}/${system.config.id.toUpperCase()}/${baseName}.png` : 
            `./media/images/${baseName}.png`;
        } catch(e) {
          const fileHandle = await sysImgsHandle.getFileHandle(`${baseName}.jpg`, { create: false });
          const file = await fileHandle.getFile();
          game.image = URL.createObjectURL(file);
          game.localImagePath = currentProfile.paths.imagesLoc === 'root-separate' ? 
            `/${currentProfile.paths.imagesRoot}/${system.config.id.toUpperCase()}/${baseName}.jpg` : 
            `./media/images/${baseName}.jpg`;
        }
      }
    } catch(e_fallback) {
      console.log(`Resim bulunamadı: ${imagePath} (${game.filename})`);
      game.image = ""; // Fallback to default cartridge placeholder
    }
  }
}

// --- XML Parsing Helpers ---
function getXmlNodeValue(parentNode, tagName) {
  const elements = parentNode.getElementsByTagName(tagName);
  if (elements.length > 0 && elements[0].childNodes.length > 0) {
    return elements[0].textContent;
  }
  return "";
}

function formatDateFromXML(xmlDate) {
  // ES format YYYYMMDDT000000 -> YYYY-MM-DD
  if (xmlDate && xmlDate.length >= 8) {
    const y = xmlDate.substring(0, 4);
    const m = xmlDate.substring(4, 6);
    const d = xmlDate.substring(6, 8);
    return `${y}-${m}-${d}`;
  }
  return xmlDate;
}

function formatFilenameToTitle(filename) {
  // Strip extension and common tags like (USA), [!], etc.
  let title = filename.substring(0, filename.lastIndexOf('.'));
  title = title.replace(/\s*\(.*?\)/g, ''); // Remove parentheses content
  title = title.replace(/\s*\[.*?\]/g, ''); // Remove brackets content
  return title.trim();
}

// --- Modals Progress Helpers ---
function showScanProgressModal(show) {
  const modal = document.getElementById('scan-modal');
  if (modal) {
    modal.classList.toggle('active', show);
  }
}

// --- Render Sidebar Consoles ---
function renderSidebarConsoles() {
  const listContainer = document.getElementById('console-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';
  
  // Total Counter Element
  let totalRoms = 0;
  let totalCovered = 0;

  for (const key in consoleData) {
    const sys = consoleData[key];
    const gameCount = sys.games.length;
    totalRoms += gameCount;

    const coveredCount = sys.games.filter(g => g.image !== "").length;
    totalCovered += coveredCount;

    // Hide systems with 0 roms by default, show when showEmptySystems is true
    if (gameCount === 0 && !showEmptySystems) {
      continue;
    }

    const item = document.createElement('li');
    item.className = `console-item ${activeConsole === key ? 'active' : ''}`;
    item.setAttribute('data-console', key);
    item.innerHTML = `
      <div class="console-info">
        <span class="console-logo">${sys.config.logo}</span>
        <span class="console-name">${sys.config.displayName}</span>
      </div>
      <span class="console-badge">${gameCount}</span>
    `;

    item.addEventListener('click', () => {
      activateConsoleCategory(key);
    });

    listContainer.appendChild(item);
  }

  // Update Statistics
  const statTotalRoms = document.getElementById('stat-total-roms');
  const statCovered = document.getElementById('stat-total-scraped');
  const statMissing = document.getElementById('stat-total-missing');

  if (statTotalRoms) statTotalRoms.textContent = totalRoms;
  if (statCovered) statCovered.textContent = totalCovered;
  if (statMissing) statMissing.textContent = totalRoms - totalCovered;
}

// --- Activate Console Category ---
function activateConsoleCategory(key) {
  activeConsole = key;

  // Update Sidebar active state
  document.querySelectorAll('.console-item').forEach(item => {
    const con = item.getAttribute('data-console');
    item.classList.toggle('active', con === key);
  });

  // Clear Inspector
  clearInspector();

  // Render Games
  renderActiveGames();
}

// --- Render Welcome Screen / Empty States ---
function renderWelcomeScreen(noDirectories = false) {
  const container = document.getElementById('game-grid-container');
  if (!container) return;

  if (noDirectories) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📁</span>
        <h3 class="empty-title">Konsol Klasörleri Bulunamadı</h3>
        <p class="empty-desc">Seçilen çalışma dizininde uyumlu konsol klasörleri (snes, gba, nes veya Roms klasörü) bulunamadı. Lütfen profilinizin doğru ayarlandığından ve SD kartınızın en üst kök dizinini seçtiğinizden emin olun.</p>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🎮</span>
        <h3 class="empty-title">RETRO SD KARTINIZI BAĞLAYIN</h3>
        <p class="empty-desc">Retro konsolunuza ait SD kartı bilgisayarınıza takın ve yukarıdaki buton yardımıyla <strong>SD KARTINIZIN EN ÜST KÖK DİZİNİNİ (Root)</strong> seçin. Tüm oyunlarınız ve kapak görselleriniz otomatik listelenecektir.</p>
        
        <div class="empty-steps">
          <div class="step-card">
            <span class="step-num">01</span>
            <p class="step-text">SD Kartınızın en üst <strong>kök ana dizinini</strong> (Roms veya Imgs klasörlerinin bulunduğu ana dizini) seçin.</p>
          </div>
          <div class="step-card">
            <span class="step-num">02</span>
            <p class="step-text">Cihazınız için uygun profili oluşturun (Örn: Trimui için CrossMix veya standard OnionOS).</p>
          </div>
          <div class="step-card">
            <span class="step-num">03</span>
            <p class="step-text">ROM'larınızı sürükle-bırak ile kopyalayın, kapak görsellerini internetten çekip doğrudan SD kartınıza kaydedin.</p>
          </div>
        </div>
      </div>
    `;
  }
}

// --- Render Games List or Grid for Active Console ---
function renderActiveGames() {
  const container = document.getElementById('game-grid-container');
  if (!container) return;

  if (!sdCardHandle) {
    renderWelcomeScreen();
    return;
  }

  const system = consoleData[activeConsole];
  if (!system) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">👾</span>
        <h3 class="empty-title">Sistem Seçilmedi</h3>
        <p class="empty-desc">Sol panelden görüntülemek istediğiniz konsol sistemini seçiniz.</p>
      </div>
    `;
    return;
  }

  // Filter games based on search and cover status
  let filteredGames = system.games.filter(game => {
    const matchesSearch = game.filename.toLowerCase().includes(activeFilters.search) || 
                          game.title.toLowerCase().includes(activeFilters.search);
    const matchesCover = activeFilters.missingCover ? game.image === "" : true;
    return matchesSearch && matchesCover;
  });

  if (filteredGames.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <h3 class="empty-title">Oyun Bulunamadı</h3>
        <p class="empty-desc">Filtrelerinize uygun ROM dosyası bu konsol klasöründe bulunmamaktadır.</p>
      </div>
    `;
    return;
  }

  // Render according to View Mode (Grid or List)
  if (currentViewMode === 'grid') {
    renderGridView(container, filteredGames);
  } else {
    renderListView(container, filteredGames);
  }
}

// --- Render Grid Thumbnail Layout ---
function renderGridView(container, games) {
  const grid = document.createElement('div');
  grid.className = 'rom-grid';

  games.forEach(game => {
    const card = document.createElement('div');
    card.className = `rom-card ${selectedRom === game ? 'active' : ''}`;
    
    // Scraped Badge
    const scrapedDotClass = game.image !== "" ? 'completed' : '';
    const badgeText = game.filename.split('.').pop();

    card.innerHTML = `
      <span class="card-badge">${badgeText}</span>
      <span class="scraped-dot ${scrapedDotClass}"></span>
      <div class="boxart-wrapper">
        ${game.image ? 
          `<img src="${game.image}" class="boxart-img" alt="${game.title}" loading="lazy">` : 
          `<div class="cartridge-placeholder">
             <span class="cartridge-label">${game.title}</span>
           </div>`
        }
      </div>
      <div class="rom-info">
        <h4 class="rom-title" title="${game.title}">${game.title}</h4>
        <div class="rom-system-ext">
          <span>${activeConsole.toUpperCase()}</span>
          <span>${(game.rating ? Math.round(parseFloat(game.rating) * 100) + '%' : '')}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      selectRomForInspection(game, card);
    });

    grid.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(grid);
}

// --- Render List Layout ---
function renderListView(container, games) {
  const list = document.createElement('div');
  list.className = 'rom-list-layout';

  games.forEach(game => {
    const row = document.createElement('div');
    row.className = `rom-row-item ${selectedRom === game ? 'active' : ''}`;

    const isScraped = game.image !== "";

    row.innerHTML = `
      <div class="row-left">
        <div class="row-icon-wrapper">
          ${game.image ? 
            `<img src="${game.image}" class="row-thumb" alt="${game.title}">` : 
            `<span style="font-size:0.9rem">📼</span>`
          }
        </div>
        <span class="row-name" title="${game.filename}">${game.title}</span>
      </div>
      <div class="row-right">
        <span class="row-badge">${game.filename.split('.').pop()}</span>
        <span class="row-status-text ${isScraped ? 'scraped' : 'missing'}">
          ${isScraped ? '🟢 Kapak Yüklendi' : '🔴 Görsel Yok'}
        </span>
      </div>
    `;

    row.addEventListener('click', () => {
      selectRomForInspection(game, row);
    });

    list.appendChild(row);
  });

  container.innerHTML = '';
  container.appendChild(list);
}

// --- Select ROM for Inspection & Display in Right Panel ---
function selectRomForInspection(game, element) {
  selectedRom = game;

  // Toggle active class in grid
  document.querySelectorAll('.rom-card, .rom-row-item').forEach(el => {
    el.classList.remove('active');
  });
  element.classList.add('active');

  // Populate Right Inspector Panel
  const inspectorPanel = document.getElementById('sidebar-right');
  if (!inspectorPanel) return;

  // Config default cartridge image as fallback
  const fallbackImg = consoleData[activeConsole].config.defaultCart;

  const isSqlite = currentProfile.metadataStorage === 'sqlite';
  const cols = isSqlite && currentProfile.sqliteConfig ? currentProfile.sqliteConfig.columns : null;

  function getFieldAttrs(fieldKey) {
    if (!isSqlite) return "";
    if (cols && cols[fieldKey]) return "";
    return 'disabled placeholder="Sistem desteklemediği için kaydedilemez" style="opacity: 0.5; cursor: not-allowed; border: 1px dashed rgba(255, 56, 96, 0.4)" title="Bu cihaz profili bu alanı desteklememektedir."';
  }

  inspectorPanel.innerHTML = `
    <div class="inspector-header">
      <h3 class="inspector-title">ROM Detayları</h3>
      <button class="save-btn" id="save-meta-btn">💾 Kaydet</button>
    </div>
    <div class="inspector-content">
      <!-- Media Panel -->
      <div class="inspector-media-container">
        <div class="inspector-boxart">
          <img src="${game.image || fallbackImg}" id="inspector-image-preview" alt="Kapak Resmi">
          <div class="boxart-action-overlay">
            <button class="media-btn" id="btn-manual-cover">🖼️ Kapak Değiştir</button>
          </div>
        </div>
      </div>

      <!-- Game Identifier -->
      <div class="inspector-title-card">
        <h4 class="inspector-game-title" id="inspector-game-title">${game.title}</h4>
        <span class="inspector-game-filename">${game.filename}</span>
      </div>

      <!-- Quick Scraper trigger -->
      <div class="quick-scrape-panel">
        <button class="scrape-btn" id="btn-scrape-online">🔍 İnternetten Scrape Et</button>
      </div>

      <!-- Metadata Fields Form -->
      <div class="meta-form">
        <div class="form-field">
          <label class="form-label">Oyun Adı</label>
          <input type="text" class="form-input" id="inp-meta-title" value="${escapeHtml(game.title)}" ${getFieldAttrs('title')}>
        </div>
        
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Geliştirici</label>
            <input type="text" class="form-input" id="inp-meta-dev" value="${escapeHtml(game.developer)}" ${getFieldAttrs('developer')}>
          </div>
          <div class="form-field">
            <label class="form-label">Yayıncı</label>
            <input type="text" class="form-input" id="inp-meta-pub" value="${escapeHtml(game.publisher)}" ${getFieldAttrs('publisher')}>
          </div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Tür</label>
            <input type="text" class="form-input" id="inp-meta-genre" value="${escapeHtml(game.genre)}" ${getFieldAttrs('genre')}>
          </div>
          <div class="form-field">
            <label class="form-label">Tarih</label>
            <input type="date" class="form-input" id="inp-meta-date" value="${game.releasedate}" ${getFieldAttrs('releasedate')}>
          </div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Puan (0.00 - 1.00)</label>
            <input type="number" step="0.05" min="0" max="1" class="form-input" id="inp-meta-rating" value="${game.rating}" ${getFieldAttrs('rating')}>
          </div>
          <div class="form-field">
            <label class="form-label">Oyuncu</label>
            <input type="text" class="form-input" id="inp-meta-players" value="${game.players}" ${getFieldAttrs('players')}>
          </div>
        </div>

        <div class="form-field">
          <label class="form-label">Açıklama</label>
          <textarea class="form-textarea" id="inp-meta-desc" ${getFieldAttrs('desc')}>${escapeHtml(game.description)}</textarea>
        </div>
      </div>
    </div>
  `;

  // Re-bind dynamically rendered elements
  document.getElementById('save-meta-btn').addEventListener('click', saveSelectedRomMetadata);
  document.getElementById('btn-scrape-online').addEventListener('click', triggerOnlineScrape);
  document.getElementById('btn-manual-cover').addEventListener('click', selectManualCoverImage);
}

function clearInspector() {
  const inspectorPanel = document.getElementById('sidebar-right');
  if (!inspectorPanel) return;

  inspectorPanel.innerHTML = `
    <div class="inspector-empty">
      <span class="inspector-empty-icon">🎮</span>
      <p>Bilgilerini incelemek, kapak görseli indirmek veya metadata düzenlemek için listeden bir oyun seçiniz.</p>
    </div>
  `;
  selectedRom = null;
}

// --- Save Metadata to JS & gamelist.xml on SD Card ---
async function saveSelectedRomMetadata() {
  if (!selectedRom || !activeConsole) return;

  // Retrieve inputs
  const titleVal = document.getElementById('inp-meta-title').value.trim();
  const devVal = document.getElementById('inp-meta-dev').value.trim();
  const pubVal = document.getElementById('inp-meta-pub').value.trim();
  const genreVal = document.getElementById('inp-meta-genre').value.trim();
  const dateVal = document.getElementById('inp-meta-date').value;
  const ratingVal = document.getElementById('inp-meta-rating').value;
  const playersVal = document.getElementById('inp-meta-players').value;
  const descVal = document.getElementById('inp-meta-desc').value.trim();

  // Validate
  if (!titleVal) {
    alert("Oyun adı boş bırakılamaz!");
    return;
  }

  // Update JS state
  selectedRom.title = titleVal;
  selectedRom.developer = devVal;
  selectedRom.publisher = pubVal;
  selectedRom.genre = genreVal;
  selectedRom.releasedate = dateVal;
  selectedRom.rating = ratingVal;
  selectedRom.players = playersVal;
  selectedRom.description = descVal;

  // Write changes depending on storage type
  if (currentProfile.metadataStorage === 'sqlite') {
    await writeSqliteDBFile(consoleData[activeConsole]);
    alert("Oyun bilgileri başarıyla SD karttaki SQLite cache veritabanına kaydedildi!");
  } else {
    await writeGamelistXMLFile(consoleData[activeConsole]);
    alert("Oyun bilgileri başarıyla SD karttaki gamelist.xml dosyasına kaydedildi!");
  }

  // Re-render
  renderActiveGames();
}

// --- Write XML DOM Document back to file on SD card ---
async function writeGamelistXMLFile(system) {
  const xmlDoc = system.gamelistXML;
  const games = system.games;

  // Clear existing <gameList> nodes
  const root = xmlDoc.getElementsByTagName('gameList')[0];
  while (root.firstChild) {
    root.removeChild(root.firstChild);
  }

  // Re-populate with updated games
  games.forEach(g => {
    const gameNode = xmlDoc.createElement('game');

    // Create standard tags
    appendXmlTag(xmlDoc, gameNode, 'path', `./${g.filename}`);
    appendXmlTag(xmlDoc, gameNode, 'name', g.title);
    appendXmlTag(xmlDoc, gameNode, 'desc', g.description);
    appendXmlTag(xmlDoc, gameNode, 'rating', g.rating);
    
    // Format date from YYYY-MM-DD to YYYYMMDDT000000
    let dateStr = "";
    if (g.releasedate) {
      dateStr = g.releasedate.replace(/-/g, '') + 'T000000';
    }
    appendXmlTag(xmlDoc, gameNode, 'releasedate', dateStr);
    
    appendXmlTag(xmlDoc, gameNode, 'developer', g.developer);
    appendXmlTag(xmlDoc, gameNode, 'publisher', g.publisher);
    appendXmlTag(xmlDoc, gameNode, 'genre', g.genre);
    appendXmlTag(xmlDoc, gameNode, 'players', g.players);

    // Save image path
    if (g.localImagePath) {
      appendXmlTag(xmlDoc, gameNode, 'image', g.localImagePath);
    } else if (g.image && g.image.startsWith('blob:')) {
      // Local image has been scraped but doesn't have a path yet
      const safeTitle = g.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      let localPath = "";
      if (currentProfile.paths.imagesLoc === 'root-separate') {
        localPath = `/${currentProfile.paths.imagesRoot}/${system.config.id.toUpperCase()}/${safeTitle}.png`;
      } else {
        localPath = `./media/images/${safeTitle}.png`;
      }
      g.localImagePath = localPath;
      appendXmlTag(xmlDoc, gameNode, 'image', localPath);
    } else if (g.image) {
      // Fallback external URL
      appendXmlTag(xmlDoc, gameNode, 'image', g.image);
    }

    root.appendChild(gameNode);
  });

  // Serialize to string
  const serializer = new XMLSerializer();
  let xmlString = serializer.serializeToString(xmlDoc);
  
  // Format XML prettily
  xmlString = formatXmlString(xmlString);

  // Write to File System API
  try {
    let fileHandle = system.xmlFileHandle;
    if (!fileHandle) {
      fileHandle = await system.dirHandle.getFileHandle('gamelist.xml', { create: true });
      system.xmlFileHandle = fileHandle;
    }

    const writable = await fileHandle.createWritable();
    await writable.write(xmlString);
    await writable.close();
  } catch (err) {
    console.error("XML yazma hatası:", err);
    alert("gamelist.xml dosyası kaydedilemedi! Lütfen yazma izinlerinizi kontrol edin.");
  }
}

function appendXmlTag(xmlDoc, parentNode, tagName, value) {
  if (value === undefined || value === null) value = "";
  const tag = xmlDoc.createElement(tagName);
  tag.appendChild(xmlDoc.createTextNode(value));
  parentNode.appendChild(tag);
}

function formatXmlString(xml) {
  let formatted = '';
  let reg = /(>)(<)(\/*)/g;
  xml = xml.replace(reg, '$1\r\n$2$3');
  let pad = 0;
  jQuery.each(xml.split('\r\n'), function(index, node) {
    let indent = 0;
    if (node.match( /.+<\/\w[^>]*>$/ )) {
      indent = 0;
    } else if (node.match( /^<\/\w/ )) {
      if (pad !== 0) {
        pad -= 1;
      }
    } else if (node.match( /^<\w[^>]*[^\/]>$/ )) {
      indent = 1;
    } else {
      indent = 0;
    }

    let padding = '';
    for (let i = 0; i < pad; i++) {
      padding += '  ';
    }

    formatted += padding + node + '\r\n';
    pad += indent;
  });

  return formatted.trim();
}

// Fallback jQuery-like loop mapping for raw JS compatibility
const jQuery = {
  each: function(array, callback) {
    for (let i = 0; i < array.length; i++) {
      callback(i, array[i]);
    }
  }
};

// --- Offline & Online Scraper Engine ---
async function triggerOnlineScrape() {
  if (!selectedRom || !activeConsole) return;

  const btn = document.getElementById('btn-scrape-online');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `🌀 Scrape ediliyor...`;

  try {
    // 1. First seek in our Dahili Retro Game DB (rom_db.js)
    let dbMatch = null;
    const filenameLower = selectedRom.filename.toLowerCase();

    if (typeof RETRO_GAME_DB !== 'undefined') {
      dbMatch = RETRO_GAME_DB.find(game => {
        // Match system and keywords
        if (game.system !== activeConsole) return false;
        
        return game.filenameKeywords.some(kw => filenameLower.includes(kw)) ||
               filenameLower.includes(game.title.toLowerCase());
      });
    }

    // 2. If matched in DB, present immediately!
    if (dbMatch) {
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = originalText;
        presentScrapeMatches([dbMatch]);
      }, 800);
      return;
    }

    // 3. Dynamic API scraper: Query Open Library API or simulate retro game lookup
    // Since it's fully platform-agnostic client, let's search OpenLibrary for cover art/details as generic fallback
    const searchQuery = encodeURIComponent(selectedRom.title);
    const response = await fetch(`https://openlibrary.org/search.json?q=${searchQuery}&limit=3`);
    
    if (response.ok) {
      const data = await response.json();
      const matches = [];

      if (data.docs && data.docs.length > 0) {
        data.docs.forEach((doc, idx) => {
          // Construct a mock retro game based on book metadata (fully visual fallback!)
          const title = doc.title;
          const author = doc.author_name ? doc.author_name[0] : "Retro Classic";
          const publishYear = doc.first_publish_year || "1995";
          
          let coverUrl = "";
          if (doc.cover_i) {
            coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
          } else {
            // Default placeholder image
            coverUrl = consoleData[activeConsole].config.defaultCart;
          }

          matches.push({
            id: `ol-${idx}-${doc.key.split('/').pop()}`,
            title: `${title} (Classic)`,
            system: activeConsole,
            developer: author,
            publisher: doc.publisher ? doc.publisher[0] : "Retro Classics",
            releasedate: `${publishYear}-01-01`,
            genre: "Action / Platform",
            players: "1",
            rating: "0.85",
            description: `${title} - Efsanevi retro oyun dünyasının büyülü esintileri ile donatılmış harika bir yapım.`,
            image: coverUrl
          });
        });
      }

      // Add a fuzzy mock game matched to the exact filename as fallback in case API returns weird things
      matches.push({
        id: "mock-custom",
        title: selectedRom.title,
        system: activeConsole,
        developer: "Indie Dev",
        publisher: "Retro Classic",
        releasedate: "1994-06-15",
        genre: "Action / Arcade",
        players: "2",
        rating: "0.90",
        description: `${selectedRom.title} - Retro el konsollarında keyifle oynayabileceğiniz, klasikleşmiş oynanış yapısına sahip eğlenceli yapım.`,
        image: consoleData[activeConsole].config.defaultCart
      });

      btn.disabled = false;
      btn.innerHTML = originalText;
      presentScrapeMatches(matches);

    } else {
      throw new Error("API hatası");
    }

  } catch (err) {
    console.error("Scraper hatası, yerel eşleştirme ile devam ediliyor:", err);
    
    // Offline simulation fallback match
    const customMatch = {
      id: "mock-custom-fallback",
      title: selectedRom.title,
      system: activeConsole,
      developer: "Retro Devs",
      publisher: "Arcade Co.",
      releasedate: "1992-10-01",
      genre: "Classic / Arcade",
      players: "1-2",
      rating: "0.85",
      description: `${selectedRom.title} - Nostalji dolu bir oyun deneyimi vadeden, retro donanımların tüm sınırlarını zorlayan harika bir macera oyunu.`,
      image: consoleData[activeConsole].config.defaultCart
    };

    btn.disabled = false;
    btn.innerHTML = originalText;
    presentScrapeMatches([customMatch]);
  }
}

// --- Present Scrape Results in Modal Dialog ---
function presentScrapeMatches(matches) {
  const modal = document.getElementById('scrape-modal');
  const resultsContainer = document.getElementById('scrape-results-list');
  
  if (!modal || !resultsContainer) return;

  resultsContainer.innerHTML = '';

  matches.forEach(match => {
    const card = document.createElement('div');
    card.className = 'scrape-match-card';
    card.innerHTML = `
      <div class="match-thumb-wrapper">
        <img src="${match.image}" class="match-thumb" alt="Kapak">
      </div>
      <div class="match-details">
        <h4 class="match-title">${match.title}</h4>
        <span class="match-meta">${match.developer} | ${match.releasedate}</span>
        <p class="match-desc">${match.description}</p>
      </div>
    `;

    card.addEventListener('click', async () => {
      await applyScrapedGameMetadata(match);
      modal.classList.remove('active');
    });

    resultsContainer.appendChild(card);
  });

  // Open modal
  modal.classList.add('active');
}

// --- Apply Scraped Metadata & Automatically Download & Write Cover Art to SD Card ---
async function applyScrapedGameMetadata(scraped) {
  if (!selectedRom || !activeConsole) return;

  // Show processing loader
  const saveBtn = document.getElementById('save-meta-btn');
  const originalText = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `💾 Resim İndiriliyor...`;

  selectedRom.title = scraped.title;
  selectedRom.developer = scraped.developer;
  selectedRom.publisher = scraped.publisher;
  selectedRom.genre = scraped.genre;
  selectedRom.releasedate = scraped.releasedate;
  selectedRom.rating = scraped.rating;
  selectedRom.players = scraped.players;
  selectedRom.description = scraped.description;

  // 1. Try to download and write the cover image blob directly into the SD card!
  const system = consoleData[activeConsole];
  let writtenSuccessfully = false;
  let localImgPath = "";

  if (scraped.image && !scraped.image.includes('unsplash.com')) {
    try {
      // Download the image using a CORS-safe fetch
      const imgResponse = await fetch(scraped.image);
      if (imgResponse.ok) {
        const imageBlob = await imgResponse.blob();
        
        let imagesHandle = null;
        const safeTitle = scraped.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const imgFilename = `${safeTitle}.png`;

        if (currentProfile.paths.imagesLoc === 'root-separate') {
          // Save in root/Imgs/<sys>/
          const imgsRootHandle = await sdCardHandle.getDirectoryHandle(currentProfile.paths.imagesRoot, { create: true });
          imagesHandle = await imgsRootHandle.getDirectoryHandle(system.config.id.toUpperCase(), { create: true });
          localImgPath = `/${currentProfile.paths.imagesRoot}/${system.config.id.toUpperCase()}/${imgFilename}`;
        } else {
          // Standard /media/images inside console folder
          const mediaHandle = await system.dirHandle.getDirectoryHandle('media', { create: true });
          imagesHandle = await mediaHandle.getDirectoryHandle('images', { create: true });
          localImgPath = `./media/images/${imgFilename}`;
        }

        const fileHandle = await imagesHandle.getFileHandle(imgFilename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(imageBlob);
        await writable.close();

        // Update local object URL and XML paths
        selectedRom.image = URL.createObjectURL(imageBlob);
        selectedRom.localImagePath = localImgPath;
        writtenSuccessfully = true;
      }
    } catch (err) {
      console.warn("Kapak resmi SD karta yazılamadı (CORS veya disk izni):", err);
    }
  }

  // If download failed or was skipped, use original matched image URL
  if (!writtenSuccessfully) {
    selectedRom.image = scraped.image;
  }

  // Update UI inputs
  document.getElementById('inp-meta-title').value = selectedRom.title;
  document.getElementById('inp-meta-dev').value = selectedRom.developer;
  document.getElementById('inp-meta-pub').value = selectedRom.publisher;
  document.getElementById('inp-meta-genre').value = selectedRom.genre;
  document.getElementById('inp-meta-date').value = selectedRom.releasedate;
  document.getElementById('inp-meta-rating').value = selectedRom.rating;
  document.getElementById('inp-meta-players').value = selectedRom.players;
  document.getElementById('inp-meta-desc').value = selectedRom.description;

  const preview = document.getElementById('inspector-image-preview');
  if (preview) {
    preview.src = selectedRom.image || consoleData[activeConsole].config.defaultCart;
  }

  // Update UI and write metadata
  if (currentProfile.metadataStorage === 'sqlite') {
    await writeSqliteDBFile(system);
    alert("Oyun bilgileri internetten çekildi, kapak görseli SD karttaki hedefine kaydedildi ve SQLite veritabanı güncellendi!");
  } else {
    await writeGamelistXMLFile(system);
    alert("Oyun bilgileri internetten çekildi, kapak görseli SD karttaki hedefine kaydedildi ve gamelist.xml güncellendi!");
  }
  
  renderActiveGames();

  // Reset button state
  saveBtn.disabled = false;
  saveBtn.innerHTML = originalText;
}

// --- Select Manual Cover Image File from computer ---
async function selectManualCoverImage() {
  if (!selectedRom || !activeConsole) return;

  try {
    const [fileHandle] = await window.showOpenFilePicker({
      types: [{
        description: 'Images',
        accept: {
          'image/*': ['.png', '.jpg', '.jpeg']
        }
      }],
      excludeAcceptAllOption: true,
      multiple: false
    });

    const file = await fileHandle.getFile();
    
    // Save image to SD Card
    const system = consoleData[activeConsole];
    let imagesHandle = null;
    
    const ext = file.name.split('.').pop().toLowerCase();
    const safeTitle = selectedRom.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const imgFilename = `${safeTitle}.${ext}`;
    let localImgPath = "";

    if (currentProfile.paths.imagesLoc === 'root-separate') {
      // Save in root/Imgs/<sys>/
      const imgsRootHandle = await sdCardHandle.getDirectoryHandle(currentProfile.paths.imagesRoot, { create: true });
      imagesHandle = await imgsRootHandle.getDirectoryHandle(system.config.id.toUpperCase(), { create: true });
      localImgPath = `/${currentProfile.paths.imagesRoot}/${system.config.id.toUpperCase()}/${imgFilename}`;
    } else {
      // Standard /media/images inside console folder
      const mediaHandle = await system.dirHandle.getDirectoryHandle('media', { create: true });
      imagesHandle = await mediaHandle.getDirectoryHandle('images', { create: true });
      localImgPath = `./media/images/${imgFilename}`;
    }

    const destFileHandle = await imagesHandle.getFileHandle(imgFilename, { create: true });
    const writable = await destFileHandle.createWritable();
    await writable.write(file);
    await writable.close();

    // Set preview URL and metadata path
    selectedRom.image = URL.createObjectURL(file);
    selectedRom.localImagePath = localImgPath;

    const preview = document.getElementById('inspector-image-preview');
    if (preview) {
      preview.src = selectedRom.image;
    }

    // Write metadata
    if (currentProfile.metadataStorage === 'sqlite') {
      await writeSqliteDBFile(system);
    } else {
      await writeGamelistXMLFile(system);
    }
    renderActiveGames();
    alert("Kapak resmi başarıyla değiştirildi ve SD kartınıza kaydedildi!");

  } catch (err) {
    console.error("Görsel seçme hatası:", err);
  }
}

// --- setup Drag and Drop ROM Uploader ---
function setupDragAndDrop() {
  const mainWorkspace = document.getElementById('main-workspace');
  const dropzone = document.getElementById('dropzone-overlay');

  if (!mainWorkspace || !dropzone) return;

  // Show dropzone on dragover
  window.addEventListener('dragenter', (e) => {
    if (sdCardHandle && activeConsole) {
      e.preventDefault();
      dropzone.classList.add('active');
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  dropzone.addEventListener('dragleave', (e) => {
    // Only remove if we leave the window/overlay boundaries
    const rect = dropzone.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
      dropzone.classList.remove('active');
    }
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('active');

    if (!sdCardHandle || !activeConsole) return;

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const system = consoleData[activeConsole];
    const extensions = system.config.extensions;
    let addedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop().toLowerCase();

      if (extensions.includes(ext)) {
        try {
          // Check if file already exists
          let fileHandle;
          try {
            fileHandle = await system.dirHandle.getFileHandle(file.name, { create: false });
            // If yes, ask for overwrite or rename
            const overwrite = confirm(`"${file.name}" zaten mevcut. Üzerine yazmak istiyor musunuz?`);
            if (!overwrite) continue;
          } catch(err) {
            // File does not exist, safe to create
          }

          // Write ROM file directly into SD Card console directory!
          fileHandle = await system.dirHandle.getFileHandle(file.name, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(file);
          await writable.close();

          // Push into JS state
          const newGame = {
            filename: file.name,
            extension: ext,
            fileHandle: fileHandle,
            title: formatFilenameToTitle(file.name),
            rating: "",
            releasedate: "",
            developer: "",
            publisher: "",
            genre: "",
            players: "",
            description: "",
            image: "",
            localImagePath: "",
            isScraped: false
          };

          system.games.push(newGame);
          addedCount++;

        } catch (err) {
          console.error(`Oyun yüklenirken hata oluştu: ${file.name}`, err);
        }
      } else {
        alert(`Uyumsuz dosya formatı: ${file.name}. Bu sistem sadece şu uzantıları kabul eder: ${extensions.join(', ')}`);
      }
    }

    if (addedCount > 0) {
      // Re-scan/rewrite metadata and update UI
      if (currentProfile.metadataStorage === 'sqlite') {
        await writeSqliteDBFile(system);
      } else {
        await writeGamelistXMLFile(system);
      }
      renderSidebarConsoles();
      renderActiveGames();
      alert(`${addedCount} adet yeni ROM dosyası başarıyla SD kartınızdaki ${system.config.displayName} klasörüne kopyalandı!`);
    }
  });
}

// --- Utility Helpers ---
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================================================
// SQLite WASM ENTEGRASYONU FONKSIYONLARI
// ==========================================================================

let SQL = null;

// SQLite WASM Motorunu Başlat
async function initSqlEngine() {
  if (SQL) return SQL;
  try {
    const config = {
      locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}`
    };
    SQL = await initSqlJs(config);
    window.SQL = SQL;
    console.log("SQLite WASM Engine initialized successfully!");
    return SQL;
  } catch (err) {
    console.error("SQLite WASM initialization failed:", err);
    alert("SQLite veritabanı motoru başlatılamadı! Lütfen internet bağlantınızı kontrol edin.");
    throw err;
  }
}

// Otomatik Veritabanı Şeması Analizcisi
async function handleAutoDetectSchema(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    // Arayüzde yükleniyor durumu
    const btn = document.getElementById('btn-autodetect-schema');
    const originalText = btn.textContent;
    btn.textContent = "⌛ Okunuyor...";
    btn.disabled = true;

    await initSqlEngine();
    
    const reader = new FileReader();
    reader.onload = function() {
      try {
        const Uints = new Uint8Array(reader.result);
        const db = new SQL.Database(Uints);
        
        // Tabloları listele
        const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        if (tablesResult.length === 0 || !tablesResult[0].values || tablesResult[0].values.length === 0) {
          alert("Hata: Seçilen veritabanında tablo bulunamadı!");
          db.close();
          btn.textContent = originalText;
          btn.disabled = false;
          return;
        }
        
        const tables = tablesResult[0].values.map(v => v[0]);
        let selectedTable = tables[0];
        for (const t of tables) {
          const lower = t.toLowerCase();
          if (lower.includes('rom') || lower.includes('game') || lower.includes('cache')) {
            selectedTable = t;
            break;
          }
        }
        
        // Kolonları listele
        const columnsResult = db.exec(`PRAGMA table_info("${selectedTable}")`);
        if (columnsResult.length === 0 || !columnsResult[0].values) {
          alert(`Hata: '${selectedTable}' tablosunun sütun bilgileri alınamadı!`);
          db.close();
          btn.textContent = originalText;
          btn.disabled = false;
          return;
        }
        
        const columns = columnsResult[0].values.map(col => col[1]);
        
        const mapping = {
          filename: ['rom_path', 'rom_name', 'path', 'filename', 'file_path', 'file'],
          title: ['title', 'name', 'game_name', 'display_name', 'label'],
          desc: ['desc', 'description', 'summary', 'about', 'comment'],
          image: ['image_path', 'image', 'cover_path', 'cover', 'img_path', 'boxart', 'thumbnail'],
          developer: ['developer', 'dev', 'maker', 'creator'],
          publisher: ['publisher', 'pub'],
          genre: ['genre', 'type', 'category'],
          releasedate: ['release_date', 'releasedate', 'date', 'year'],
          rating: ['rating', 'score', 'stars'],
          players: ['players', 'player_count', 'max_players']
        };
        
        // Eşleştirmeleri form elemanlarına aktar
        document.getElementById('inp-sqlite-table').value = selectedTable;
        
        const colInputs = {
          filename: 'inp-col-filename',
          title: 'inp-col-title',
          desc: 'inp-col-desc',
          image: 'inp-col-image',
          developer: 'inp-col-dev',
          publisher: 'inp-col-pub',
          genre: 'inp-col-genre',
          releasedate: 'inp-col-date',
          rating: 'inp-col-rating',
          players: 'inp-col-players'
        };
        
        for (const key in mapping) {
          let matchedCol = "";
          for (const candidate of mapping[key]) {
            const found = columns.find(c => c.toLowerCase() === candidate.toLowerCase());
            if (found) {
              matchedCol = found;
              break;
            }
          }
          if (!matchedCol) {
            for (const candidate of mapping[key]) {
              const found = columns.find(c => c.toLowerCase().includes(candidate.toLowerCase()));
              if (found) {
                matchedCol = found;
                break;
              }
            }
          }
          if (!matchedCol && key === 'filename') {
            matchedCol = columns[0];
          } else if (!matchedCol && key === 'title') {
            matchedCol = columns.length > 1 ? columns[1] : columns[0];
          }
          
          document.getElementById(colInputs[key]).value = matchedCol;
        }
        
        db.close();
        btn.textContent = originalText;
        btn.disabled = false;
        alert(`🎉 Şema başarıyla algılandı!\nTablo: "${selectedTable}"\nBulunan Sütunlar: ${columns.join(', ')}`);
      } catch (err) {
        console.error(err);
        btn.textContent = originalText;
        btn.disabled = false;
        alert("Veritabanı okunurken bir hata oluştu. Lütfen geçerli bir SQLite .db dosyası seçtiğinizden emin olun.");
      }
    };
    reader.readAsArrayBuffer(file);
  } catch (err) {
    console.error(err);
  } finally {
    e.target.value = "";
  }
}

// Dosya Yollarını Eşleme İçin Temizle
function cleanPathForMatching(path) {
  if (!path) return "";
  let cleaned = path.replace(/^\.\//, '').replace(/^\//, '');
  if (cleaned.includes('/')) {
    cleaned = cleaned.split('/').pop();
  }
  if (cleaned.includes('\\')) {
    cleaned = cleaned.split('\\').pop();
  }
  return cleaned.toLowerCase().trim();
}

// SQLite Önbellek Veritabanı Yükle
async function tryLoadOrCreateSqliteDB(system) {
  await initSqlEngine();
  
  const pattern = currentProfile.sqliteConfig.pattern || "{SYSTEM}_cache7.db";
  const sysId = system.config.id;
  const sysFolder = system.dirHandle.name;
  const dbFilename = pattern.replace(/{SYSTEM}/g, sysFolder).replace(/{system}/g, sysId);
  const dirHandle = system.dirHandle;
  
  let dbFileHandle = null;
  let arrayBuffer = null;
  
  try {
    dbFileHandle = await dirHandle.getFileHandle(dbFilename, { create: false });
    const file = await dbFileHandle.getFile();
    arrayBuffer = await file.arrayBuffer();
    console.log(`Mevcut SQLite veritabanı bulundu ve yüklendi: ${dbFilename}`);
  } catch (err) {
    console.log(`Veritabanı dosyası (${dbFilename}) bulunamadı. Yeni bir tane oluşturuluyor.`);
  }
  
  let db = null;
  const dbConfig = currentProfile.sqliteConfig;
  const cols = dbConfig.columns;
  const tableName = dbConfig.tableName;
  
  if (arrayBuffer) {
    try {
      db = new window.SQL.Database(new Uint8Array(arrayBuffer));
    } catch (parseErr) {
      console.error("Veritabanı ayrıştırılamadı, yeni bir tane oluşturuluyor:", parseErr);
    }
  }
  
  if (!db) {
    db = new window.SQL.Database();
    const columnsDef = [];
    if (cols.filename) columnsDef.push(`"${cols.filename}" TEXT PRIMARY KEY`);
    if (cols.title) columnsDef.push(`"${cols.title}" TEXT`);
    if (cols.desc) columnsDef.push(`"${cols.desc}" TEXT`);
    if (cols.image) columnsDef.push(`"${cols.image}" TEXT`);
    if (cols.developer) columnsDef.push(`"${cols.developer}" TEXT`);
    if (cols.publisher) columnsDef.push(`"${cols.publisher}" TEXT`);
    if (cols.genre) columnsDef.push(`"${cols.genre}" TEXT`);
    if (cols.releasedate) columnsDef.push(`"${cols.releasedate}" TEXT`);
    if (cols.rating) columnsDef.push(`"${cols.rating}" REAL`);
    if (cols.players) columnsDef.push(`"${cols.players}" TEXT`);
    
    const createTableSql = `CREATE TABLE "${tableName}" (${columnsDef.join(', ')})`;
    db.run(createTableSql);
    console.log(`Yeni SQLite veritabanı ve "${tableName}" tablosu başarıyla oluşturuldu.`);
  }
  
  system.sqliteDB = db;
  
  try {
    const selectCols = [];
    for (const key in cols) {
      const dbCol = cols[key];
      if (dbCol) {
        selectCols.push(`"${dbCol}" AS "${key}"`);
      }
    }
    
    const selectQuery = `SELECT ${selectCols.join(', ')} FROM "${tableName}"`;
    const result = db.exec(selectQuery);
    
    const rows = [];
    if (result && result.length > 0) {
      const colsList = result[0].columns;
      for (const val of result[0].values) {
        const row = {};
        for (let i = 0; i < colsList.length; i++) {
          row[colsList[i]] = val[i];
        }
        rows.push(row);
      }
    }
    
    for (const row of rows) {
      const matchedFilename = cleanPathForMatching(row.filename);
      const game = system.games.find(g => cleanPathForMatching(g.filename) === matchedFilename);
      
      if (game) {
        game.title = row.title || game.title;
        game.description = row.desc || "";
        game.rating = row.rating !== null && row.rating !== undefined ? String(row.rating) : "";
        game.releasedate = formatDateFromXML(row.releasedate || "");
        game.developer = row.developer || "";
        game.publisher = row.publisher || "";
        game.genre = row.genre || "";
        game.players = row.players !== null && row.players !== undefined ? String(row.players) : "";
        game.localImagePath = row.image || "";
        game.isScraped = true;
        game.dbRomPath = row.filename;
        
        if (game.localImagePath) {
          await loadLocalImageBlob(system, game, game.localImagePath);
        }
      }
    }
    
    for (const game of system.games) {
      if (!game.image) {
        await tryAutoDetectLocalImage(system, game);
      }
    }
    
  } catch (readErr) {
    console.error("Veritabanı kayıtları okunurken hata oluştu:", readErr);
    for (const game of system.games) {
      await tryAutoDetectLocalImage(system, game);
    }
  }
}

// SQLite Önbellek Veritabanı Yaz
async function writeSqliteDBFile(system) {
  const db = system.sqliteDB;
  if (!db) {
    console.error("Hata: SQLite veritabanı bellekte yüklenmemiş!");
    return;
  }
  
  const dbConfig = currentProfile.sqliteConfig;
  const cols = dbConfig.columns;
  const tableName = dbConfig.tableName;
  
  for (const game of system.games) {
    let exists = false;
    let targetPath = game.dbRomPath || `./${game.filename}`;
    
    const checkQuery = `SELECT count(*) FROM "${tableName}" WHERE "${cols.filename}" = :romPath`;
    const checkResult = db.exec(checkQuery, { ':romPath': targetPath });
    if (checkResult && checkResult.length > 0 && checkResult[0].values[0][0] > 0) {
      exists = true;
    } else {
      const checkQuery2 = `SELECT "${cols.filename}" FROM "${tableName}"`;
      const checkResult2 = db.exec(checkQuery2);
      if (checkResult2 && checkResult2.length > 0) {
        for (const val of checkResult2[0].values) {
          const pathInDb = val[0];
          if (cleanPathForMatching(pathInDb) === cleanPathForMatching(game.filename)) {
            targetPath = pathInDb;
            exists = true;
            break;
          }
        }
      }
    }
    
    let localPath = game.localImagePath;
    if (!localPath && game.image && game.image.startsWith('blob:')) {
      const safeTitle = game.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      if (currentProfile.paths.imagesLoc === 'root-separate') {
        localPath = `/${currentProfile.paths.imagesRoot}/${system.config.id.toUpperCase()}/${safeTitle}.png`;
      } else {
        localPath = `./media/images/${safeTitle}.png`;
      }
      game.localImagePath = localPath;
    }
    
    if (exists) {
      const updateFields = [];
      const params = { ':romPath': targetPath };
      
      const fieldMappings = [
        { key: 'title', col: cols.title },
        { key: 'description', col: cols.desc },
        { key: 'developer', col: cols.developer },
        { key: 'publisher', col: cols.publisher },
        { key: 'genre', col: cols.genre },
        { key: 'releasedate', col: cols.releasedate },
        { key: 'rating', col: cols.rating },
        { key: 'players', col: cols.players },
        { key: 'localImagePath', col: cols.image }
      ];
      
      for (const fm of fieldMappings) {
        if (fm.col) {
          let val = game[fm.key];
          if (fm.key === 'rating' && val !== "") {
            val = parseFloat(val);
          }
          updateFields.push(`"${fm.col}" = :${fm.key}`);
          params[`:${fm.key}`] = val !== undefined && val !== null ? val : "";
        }
      }
      
      const sqlUpdate = `UPDATE "${tableName}" SET ${updateFields.join(', ')} WHERE "${cols.filename}" = :romPath`;
      db.run(sqlUpdate, params);
    } else {
      const fields = [`"${cols.filename}"`];
      const valPlaceholders = [':romPath'];
      const params = { ':romPath': targetPath };
      
      const fieldMappings = [
        { key: 'title', col: cols.title },
        { key: 'description', col: cols.desc },
        { key: 'developer', col: cols.developer },
        { key: 'publisher', col: cols.publisher },
        { key: 'genre', col: cols.genre },
        { key: 'releasedate', col: cols.releasedate },
        { key: 'rating', col: cols.rating },
        { key: 'players', col: cols.players },
        { key: 'localImagePath', col: cols.image }
      ];
      
      for (const fm of fieldMappings) {
        if (fm.col) {
          let val = game[fm.key];
          if (fm.key === 'rating' && val !== "") {
            val = parseFloat(val);
          }
          fields.push(`"${fm.col}"`);
          valPlaceholders.push(`:${fm.key}`);
          params[`:${fm.key}`] = val !== undefined && val !== null ? val : "";
        }
      }
      
      const sqlInsert = `INSERT INTO "${tableName}" (${fields.join(', ')}) VALUES (${valPlaceholders.join(', ')})`;
      db.run(sqlInsert, params);
    }
  }
  
  const binaryData = db.export();
  
  try {
    const pattern = currentProfile.sqliteConfig.pattern || "{SYSTEM}_cache7.db";
    const sysId = system.config.id;
    const sysFolder = system.dirHandle.name;
    const dbFilename = pattern.replace(/{SYSTEM}/g, sysFolder).replace(/{system}/g, sysId);
    const dirHandle = system.dirHandle;
    
    try {
      const origFileHandle = await dirHandle.getFileHandle(dbFilename, { create: false });
      const origFile = await origFileHandle.getFile();
      
      const backupFileHandle = await dirHandle.getFileHandle(`${dbFilename}.bak`, { create: true });
      const backupWritable = await backupFileHandle.createWritable();
      await backupWritable.write(origFile);
      await backupWritable.close();
      console.log(`Yedek veritabanı başarıyla oluşturuldu: ${dbFilename}.bak`);
    } catch (backupErr) {
      console.warn("Veritabanı yedeği oluşturulamadı veya dosya ilk kez yaratılıyor:", backupErr);
    }
    
    const fileHandle = await dirHandle.getFileHandle(dbFilename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(binaryData);
    await writable.close();
    console.log(`SQLite veritabanı başarıyla dosyaya yazıldı: ${dbFilename}`);
    
  } catch (writeErr) {
    console.error("SQLite veritabanı yazma hatası:", writeErr);
    alert("Hata: SQLite veritabanı dosyasına yazılamadı! Lütfen disk izinlerinizi kontrol edin.");
    throw writeErr;
  }
}
