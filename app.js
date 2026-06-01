/* ==========================================================================
   RETRO ROM MANAGER & SCRAPER - APPLICATION LOGIC (app.js)
   ========================================================================== */

// --- Global Application State ---
let sdCardHandle = null;            // FileSystemDirectoryHandle for the root folder
let activeConsole = null;           // Active console category (e.g., 'snes')
let currentViewMode = 'grid';       // 'grid' or 'list'
let consoleData = {};               // Maps system name to system details (games, handles, xml)
let selectedRom = null;             // Currently selected ROM in the inspector
let selectedRomsBulk = [];          // Currently checked ROMs for bulk actions
let lastCheckedGame = null;         // Last checked ROM for shift-click selection
let activeFilters = {
  search: '',
  missingCover: false
};
let showEmptySystems = false;       // Toggle to show/hide systems with 0 roms
let showDuplicatesOnly = false;      // Toggle to show duplicate ROMs grouped

// --- Helper to resolve matching system folder name symmetrically ---
function getSystemFolderName(system) {
  if (!system) return "";
  return system.dirHandle ? system.dirHandle.name : system.config.id.toUpperCase();
}

// --- Sidebar Manufacturer Grouping State ---
let sidebarCollapseState = {};
try {
  sidebarCollapseState = JSON.parse(localStorage.getItem('rrm_sidebar_collapse') || '{}');
} catch (e) {
  sidebarCollapseState = {};
}

// --- Bulk Scraper State ---
let bulkQueue = [];                  // ROM objects to be processed
let bulkActiveIndex = 0;             // Index of the currently processed ROM
let bulkSuccessCount = 0;            // Total successfully scraped ROMs
let bulkFailedCount = 0;             // Total failed ROMs
let isBulkCancelled = false;         // Cancellation state flag
let isBulkRunning = false;           // Running status flag

// --- IndexedDB for Directory Handle Storage & Games Cache ---
const DB_NAME = 'RetroRomManagerDB';
const STORE_NAME = 'handles';
const KEY_NAME = 'last_sd_card';
const DB_VERSION = 2;
const CACHE_STORE_NAME = 'games_cache';

// --- Logger State & Utility (v1.9.0) ---
let loggerSessionLogs = [];
const LOGGER_MAX_LIMIT = 1000;
let logWriteTimeout = null;

const Logger = {
  enabled: false,

  init() {
    // Load enabled state from localStorage or default to false
    this.enabled = localStorage.getItem('rrm_logger_enabled') === 'true';
    const chk = document.getElementById('chk-enable-logger');
    if (chk) {
      chk.checked = this.enabled;
    }
    this.updatePanelVisibility();
  },

  updatePanelVisibility() {
    const panel = document.getElementById('log-panel');
    const expandBtn = document.getElementById('btn-expand-logs');
    if (!panel || !expandBtn) return;
    
    if (this.enabled) {
      // Check if collapsed
      const isCollapsed = localStorage.getItem('rrm_logs_collapsed') === 'true';
      if (isCollapsed) {
        panel.style.display = 'none';
        expandBtn.style.display = 'flex';
      } else {
        panel.style.display = 'flex';
        expandBtn.style.display = 'none';
        this.scrollToBottom();
      }
    } else {
      panel.style.display = 'none';
      expandBtn.style.display = 'none';
    }
  },

  log(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString('tr-TR', { hour12: false });
    const logEntry = { timestamp, message, level };
    
    // Add to memory
    loggerSessionLogs.push(logEntry);
    if (loggerSessionLogs.length > LOGGER_MAX_LIMIT) {
      loggerSessionLogs.shift();
    }

    // Output to real browser console as well
    const consoleMsg = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    if (level === 'error') console.error(consoleMsg);
    else if (level === 'warn') console.warn(consoleMsg);
    else console.log(consoleMsg);

    // Render in UI if enabled
    if (this.enabled) {
      this.appendLogToUI(logEntry);
    }

    // Write to disk
    this.writeLogFileDebounced();
  },

  info(msg) { this.log(msg, 'info'); },
  success(msg) { this.log(msg, 'success'); },
  warn(msg) { this.log(msg, 'warn'); },
  error(msg) { this.log(msg, 'error'); },

  appendLogToUI(logEntry) {
    const body = document.getElementById('log-panel-body');
    if (!body) return;

    const line = document.createElement('div');
    line.className = `log-line log-${logEntry.level}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-timestamp';
    timeSpan.textContent = `[${logEntry.timestamp}]`;
    
    const contentSpan = document.createElement('span');
    contentSpan.className = 'log-content';
    contentSpan.textContent = logEntry.message;

    line.appendChild(timeSpan);
    line.appendChild(contentSpan);
    body.appendChild(line);

    // Auto scroll
    this.scrollToBottom();
  },

  scrollToBottom() {
    const body = document.getElementById('log-panel-body');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  },

  clear() {
    loggerSessionLogs = [];
    const body = document.getElementById('log-panel-body');
    if (body) body.innerHTML = '';
    this.info("Oturum günlüğü temizlendi.");
  },

  writeLogFileDebounced() {
    if (!sdCardHandle) return; // Need loaded SD card to write file
    
    // Debounce to prevent massive write overhead
    if (logWriteTimeout) clearTimeout(logWriteTimeout);
    logWriteTimeout = setTimeout(() => {
      this.writeLogFile();
    }, 1000);
  },

  async writeLogFile() {
    if (!sdCardHandle) return;
    try {
      const fileHandle = await sdCardHandle.getFileHandle('retromgr.log', { create: true });
      const writable = await fileHandle.createWritable();
      
      const fileContent = loggerSessionLogs
        .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
        .join('\n');
        
      await writable.write(fileContent);
      await writable.close();
    } catch (err) {
      console.error("Logger: retromgr.log yazma hatası:", err);
    }
  }
};

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveGamesCache(systemKey, games) {
  try {
    const db = await openIndexedDB();
    const serializedGames = games.map(game => {
      return {
        filename: game.filename,
        extension: game.extension,
        title: game.title || "",
        rating: game.rating || "",
        releasedate: game.releasedate || "",
        developer: game.developer || "",
        publisher: game.publisher || "",
        genre: game.genre || "",
        players: game.players || "",
        description: game.description || "",
        localImagePath: game.localImagePath || "",
        video: game.video || "",
        isScraped: game.isScraped || false,
        dbRomPath: game.dbRomPath || ""
      };
    });

    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.put(serializedGames, systemKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`[IndexedDB Cache] '${systemKey}' için oyunlar kaydedilemedi:`, err);
  }
}

async function loadGamesCache(systemKey) {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.get(systemKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`[IndexedDB Cache] '${systemKey}' için önbellek okuma hatası:`, err);
    return null;
  }
}

async function clearGamesCache(systemKey) {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.delete(systemKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`[IndexedDB Cache] '${systemKey}' için önbellek silme hatası:`, err);
  }
}

async function saveSDCardHandle(handle) {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(handle, KEY_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB yazma hatası:", err);
  }
}

async function loadSDCardHandle() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(KEY_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB okuma hatası:", err);
    return null;
  }
}

async function clearSDCardHandle() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(KEY_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("IndexedDB silme hatası:", err);
  }
}

// --- Custom Device Profile Settings ---
let currentProfile = {
  cardName: "Standart Cihaz",
  preset: "standard",
  metadataStorage: "xml", // 'xml' or 'sqlite'
  paths: {
    romsRoot: "",
    imagesRoot: "./images",
    imagesLoc: "roms-sub" // 'roms-sub' or 'root-separate'
  },
  sqliteConfig: null,
  scraper: {
    ssid: "",
    sspassword: "",
    devid: "",
    devpassword: ""
  },
  autoReconnect: true, // Default enabled
  eulaAccepted: false
};

// --- Console Configuration Mapping ---
const CONSOLE_CONFIGS = {
  snes: {
    id: 'snes',
    names: ['snes', 'supernintendo'],
    displayName: 'Super Nintendo (SNES)',
    logo: '🎮',
    extensions: ['smc', 'sfc', 'zip', 'fig'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60' // Vintage gamepad / cartridge vibe
  },
  sfc: {
    id: 'sfc',
    names: ['sfc', 'superfamicom'],
    displayName: 'Super Famicom (SFC)',
    logo: '🎌',
    extensions: ['smc', 'sfc', 'zip', 'fig'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
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
    names: ['nes', 'nintendo'],
    displayName: 'Nintendo (NES)',
    logo: '👾',
    extensions: ['nes', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  fc: {
    id: 'fc',
    names: ['fc', 'famicom'],
    displayName: 'Family Computer (Famicom)',
    logo: '🎌',
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
    names: ['megadrive', 'smd'],
    displayName: 'Sega Mega Drive',
    logo: '🏎️',
    extensions: ['bin', 'md', 'smd', 'gen', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  genesis: {
    id: 'genesis',
    names: ['genesis', 'sega'],
    displayName: 'Sega Genesis',
    logo: '🚀',
    extensions: ['bin', 'md', 'smd', 'gen', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  psx: {
    id: 'psx',
    names: ['psx', 'playstation'],
    displayName: 'PlayStation (PSX)',
    logo: '📀',
    extensions: ['bin', 'img', 'iso', 'cue', 'chd', 'pbp'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  ps1: {
    id: 'ps1',
    names: ['ps1', 'ps'],
    displayName: 'PlayStation (PS1)',
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
    names: ['msx'],
    displayName: 'MSX',
    logo: '⌨️',
    extensions: ['rom', 'mx1', 'dsk', 'cas', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  msx2: {
    id: 'msx2',
    names: ['msx2'],
    displayName: 'MSX2',
    logo: '💾',
    extensions: ['rom', 'mx2', 'dsk', 'cas', 'zip'],
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
    names: ['ws', 'wswan', 'wonderswan'],
    displayName: 'WonderSwan',
    logo: '📟',
    extensions: ['ws', 'zip'],
    defaultCart: 'https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?w=150&auto=format&fit=crop&q=60'
  },
  wsc: {
    id: 'wsc',
    names: ['wsc', 'wswanc', 'wonderswancolor'],
    displayName: 'WonderSwan Color',
    logo: '🌈',
    extensions: ['wsc', 'zip'],
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

// --- Get Console Manufacturer mapping for group listing ---
function getConsoleManufacturer(consoleId) {
  const cid = consoleId.toLowerCase();
  
  if (['snes', 'sfc', 'gba', 'nes', 'fc', 'gb', 'gbc', 'n64', 'nds', 'nds_arm9', 'wii', 'gamecube', 'virtualboy', 'pokemini'].includes(cid)) {
    return { name: 'Nintendo', logo: '🔴' };
  }
  if (['megadrive', 'genesis', 'sega32x', 'segacd', 'sms', 'gg', 'sega', 'dreamcast', 'saturn', 'sg1000'].includes(cid)) {
    return { name: 'Sega', logo: '🔵' };
  }
  if (['psx', 'ps1', 'psp', 'ps2', 'pspminis'].includes(cid)) {
    return { name: 'Sony', logo: '🖤' };
  }
  if (['atari', 'atari2600', 'atari5200', 'atari7800', 'atarist', 'lynx'].includes(cid)) {
    return { name: 'Atari', logo: '🕹️' };
  }
  if (['neogeo', 'neogeopocket', 'ngpc', 'ngp'].includes(cid)) {
    return { name: 'SNK', logo: '⚡' };
  }
  if (['pcengine', 'tg16', 'pce', 'tgcd'].includes(cid)) {
    return { name: 'NEC', logo: '📟' };
  }
  if (['wswan', 'wsc'].includes(cid)) {
    return { name: 'Bandai', logo: '📟' };
  }
  
  return { name: 'Retro PC & Diğer', logo: '🖥️' };
}

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

  // Initialize Logger Module
  Logger.init();

  // Check and prepare quick reconnect
  checkAndPrepareReconnect();

  // Check EULA acceptance status
  checkEulaStatus();
});

// --- EULA Acceptance Check ---
function checkEulaStatus() {
  const isEulaAccepted = localStorage.getItem('rrm_eula_accepted') === 'true';
  if (!isEulaAccepted) {
    const eulaModal = document.getElementById('eula-modal');
    if (eulaModal) {
      eulaModal.classList.add('active');
    }
  }
}

// --- Check and Prepare Reconnection to Last Connected SD Card ---
async function checkAndPrepareReconnect() {
  const isAutoReconnectEnabled = localStorage.getItem('rrm_auto_reconnect') !== 'false';
  if (!isAutoReconnectEnabled) return;

  try {
    const savedHandle = await loadSDCardHandle();
    if (savedHandle) {
      Logger.info(`Hızlı bağlanmak için kayıtlı SD kart bulundu: ${savedHandle.name}`);
      const reconnectBtn = document.getElementById('btn-reconnect-sd');
      if (reconnectBtn) {
        reconnectBtn.style.display = 'block';
        reconnectBtn.textContent = `🔌 HIZLI BAĞLAN: ${savedHandle.name.toUpperCase()}`;
        
        reconnectBtn.addEventListener('click', async () => {
          reconnectBtn.disabled = true;
          reconnectBtn.textContent = `🔌 Bağlanıyor...`;
          Logger.info(`Kayıtlı SD karta hızlı bağlantı isteği gönderildi: ${savedHandle.name}`);
          
          try {
            const permission = await savedHandle.requestPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
              sdCardHandle = savedHandle;
              Logger.success(`Hızlı bağlantı izni verildi, kart yükleniyor: ${savedHandle.name}`);
              
              // Update Status Indicator
              const indicator = document.getElementById('workspace-indicator');
              const folderPathEl = document.getElementById('workspace-folder-path');
              if (indicator && folderPathEl) {
                indicator.className = 'status-indicator connected';
                folderPathEl.textContent = sdCardHandle.name;
              }
              
              await initWorkspaceFromHandle();
              reconnectBtn.style.display = 'none';
            } else {
              Logger.warn("Hızlı bağlantı izni kullanıcı tarafından reddedildi.");
              reconnectBtn.disabled = false;
              reconnectBtn.textContent = `🔌 TEKRAR DENE: ${savedHandle.name.toUpperCase()}`;
            }
          } catch (err) {
            Logger.error(`Hızlı bağlantı izni alınamadı: ${err.message}`);
            console.error("Yeniden bağlanma izni alınamadı:", err);
            await clearSDCardHandle();
            reconnectBtn.style.display = 'none';
          }
        });
      }
    }
  } catch (err) {
    console.error("Yeniden bağlanma hazırlığı hatası:", err);
  }
}

// --- UI Bindings ---
function initUIBindings() {
  // Folder Workspace Picker Button
  const pickFolderBtn = document.getElementById('pick-folder-btn');
  if (pickFolderBtn) {
    pickFolderBtn.addEventListener('click', selectSDCardWorkspace);
  }

  // Search Input Handler
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      activeFilters.search = val.toLowerCase().trim();
      
      // Show/hide clear button based on text content
      if (searchClearBtn) {
        searchClearBtn.style.display = val.length > 0 ? 'block' : 'none';
      }
      
      renderActiveGames();
    });
  }

  // Search Clear Button click handler
  if (searchClearBtn && searchInput) {
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      activeFilters.search = '';
      searchClearBtn.style.display = 'none';
      searchInput.focus();
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

  // Filter: Find Duplicates Toggle
  const btnToggleDuplicates = document.getElementById('btn-toggle-duplicates');
  if (btnToggleDuplicates) {
    btnToggleDuplicates.addEventListener('click', () => {
      showDuplicatesOnly = !showDuplicatesOnly;
      btnToggleDuplicates.classList.toggle('active', showDuplicatesOnly);
      
      if (showDuplicatesOnly) {
        showToast("Mükerrer kopya filtreleme modu aktif!", "success");
      }
      
      renderActiveGames();
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
      } else if (preset === 'standard' || preset === 'r36s') {
        document.getElementById('sel-profile-storage').value = 'xml';
        document.getElementById('sqlite-config-group').style.display = 'none';
      }
      
      // Update advanced path default values
      updateAdvancedPathsDefaults(preset);
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

        // Populate Advanced Settings
        document.getElementById('inp-adv-roms-root').value = currentProfile.paths.romsRoot || "";
        document.getElementById('inp-adv-images-root').value = currentProfile.paths.imagesRoot || "./images";
        document.getElementById('inp-adv-videos-root').value = currentProfile.paths.videosRoot || "./videos";

        // Populate Scraper Settings
        if (currentProfile.scraper) {
          document.getElementById('inp-scraper-ssid').value = currentProfile.scraper.ssid || "";
          document.getElementById('inp-scraper-sspassword').value = currentProfile.scraper.sspassword || "";
          document.getElementById('inp-scraper-devid').value = currentProfile.scraper.devid || "";
          document.getElementById('inp-scraper-devpassword').value = currentProfile.scraper.devpassword || "";
          document.getElementById('inp-scraper-media').value = currentProfile.scraper.mediaPref || "mixrbv1";
          document.getElementById('chk-scraper-compress').checked = currentProfile.scraper.compress === true;
        } else {
          document.getElementById('inp-scraper-ssid').value = "";
          document.getElementById('inp-scraper-sspassword').value = "";
          document.getElementById('inp-scraper-devid').value = "";
          document.getElementById('inp-scraper-devpassword').value = "";
          document.getElementById('inp-scraper-media').value = "mixrbv1";
          document.getElementById('chk-scraper-compress').checked = false;
        }

        // Populate Auto Reconnect Preference
        document.getElementById('chk-auto-reconnect').checked = currentProfile.autoReconnect !== false;

        // Populate Logger Preference
        document.getElementById('chk-enable-logger').checked = currentProfile.enableLogger === true;

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

  // Advanced Paths Collapsible Toggle
  const btnToggleAdv = document.getElementById('btn-toggle-advanced-paths');
  const advGroup = document.getElementById('advanced-paths-group');
  const advIcon = document.getElementById('adv-toggle-icon');
  if (btnToggleAdv && advGroup) {
    btnToggleAdv.addEventListener('click', () => {
      const isHidden = advGroup.style.display === 'none';
      advGroup.style.display = isHidden ? 'flex' : 'none';
      if (advIcon) advIcon.textContent = isHidden ? '▲' : '▼';
    });
  }

  // Scraper Settings Collapsible Toggle
  const btnToggleScraper = document.getElementById('btn-toggle-scraper-settings');
  const scraperGroup = document.getElementById('scraper-settings-group');
  const scraperIcon = document.getElementById('scraper-toggle-icon');
  if (btnToggleScraper && scraperGroup) {
    btnToggleScraper.addEventListener('click', () => {
      const isHidden = scraperGroup.style.display === 'none';
      scraperGroup.style.display = isHidden ? 'flex' : 'none';
      if (scraperIcon) scraperIcon.textContent = isHidden ? '▲' : '▼';
    });
  }

  // Reset Advanced Defaults Button
  const btnResetAdv = document.getElementById('btn-reset-adv-defaults');
  if (btnResetAdv) {
    btnResetAdv.addEventListener('click', () => {
      const preset = document.getElementById('sel-profile-preset').value;
      updateAdvancedPathsDefaults(preset);
    });
  }

  // Image Fit Toggles
  const btnFitContain = document.getElementById('btn-fit-contain');
  const btnFitCover = document.getElementById('btn-fit-cover');
  if (btnFitContain && btnFitCover) {
    btnFitContain.addEventListener('click', () => {
      document.body.classList.add('image-fit-contain');
      document.body.classList.remove('image-fit-cover');
      btnFitContain.classList.add('active');
      btnFitCover.classList.remove('active');
    });

    btnFitCover.addEventListener('click', () => {
      document.body.classList.add('image-fit-cover');
      document.body.classList.remove('image-fit-contain');
      btnFitCover.classList.add('active');
      btnFitContain.classList.remove('active');
    });
  }

  // Drag and Drop ROM Loader Integration
  setupDragAndDrop();

  // Bulk Actions Bar Listeners
  const btnBulkDeselect = document.getElementById('btn-bulk-deselect');
  if (btnBulkDeselect) {
    btnBulkDeselect.addEventListener('click', () => {
      selectedRomsBulk = [];
      renderActiveGames();
      updateBulkActionBarUI();
    });
  }

  const btnBulkSelectAll = document.getElementById('btn-bulk-select-all');
  if (btnBulkSelectAll) {
    btnBulkSelectAll.addEventListener('click', () => {
      const system = consoleData[activeConsole];
      if (!system) return;

      // Filter exactly the games currently active/visible in UI matching filters & search query
      const filteredGames = system.games.filter(game => {
        const matchesSearch = game.filename.toLowerCase().includes(activeFilters.search) || 
                              game.title.toLowerCase().includes(activeFilters.search);
        const matchesCover = activeFilters.missingCover ? game.image === "" : true;
        return matchesSearch && matchesCover;
      });

      selectedRomsBulk = [...filteredGames];
      renderActiveGames();
      updateBulkActionBarUI();
      showToast(`${filteredGames.length} adet arama sonucu başarıyla seçildi!`, "success");
    });
  }

  const btnBulkDelete = document.getElementById('btn-bulk-delete');
  if (btnBulkDelete) {
    btnBulkDelete.addEventListener('click', () => {
      deleteBulkRoms();
    });
  }

  // Bulk Scrape triggers
  const btnSystemBulkScrape = document.getElementById('btn-system-bulk-scrape');
  if (btnSystemBulkScrape) {
    btnSystemBulkScrape.addEventListener('click', () => {
      const system = consoleData[activeConsole];
      if (!system || !system.games || system.games.length === 0) {
        showToast("Scrape edilecek oyun bulunamadı!", "error");
        return;
      }
      // Get filtered games in the active system
      const filtered = system.games.filter(game => {
        const matchesSearch = game.filename.toLowerCase().includes(activeFilters.search) || 
                              game.title.toLowerCase().includes(activeFilters.search);
        const matchesCover = activeFilters.missingCover ? game.image === "" : true;
        return matchesSearch && matchesCover;
      });
      if (filtered.length === 0) {
        showToast("Filtrelere uygun oyun bulunamadı!", "error");
        return;
      }

      // Check if there are already scraped games in the queue
      const scrapedCount = filtered.filter(g => g.image !== "" || g.localImagePath !== "").length;
      let finalQueue = [...filtered];
      
      if (scrapedCount > 0 && !activeFilters.missingCover) {
        const skipScraped = confirm(`Sistemde halihazırda kapak resmi/görseli olan ${scrapedCount} oyun bulunuyor.\n\nScreenScraper günlük sorgu kotanızı korumak için halihazırda scrape edilmiş olan bu oyunları ATLAMAK ister misiniz?\n\n(Sadece kapak resmi eksik olanları taramak için 'Tamam' butonuna, tüm oyunları sıfırdan yeniden taramak için 'İptal' butonuna basın.)`);
        if (skipScraped) {
          finalQueue = filtered.filter(g => g.image === "" && g.localImagePath === "");
          if (finalQueue.length === 0) {
            showToast("Taranacak eksik kapaklı oyun bulunamadı!", "info");
            return;
          }
        }
      }

      startBulkScrape(finalQueue);
    });
  }

  const btnBulkScrapeSelected = document.getElementById('btn-bulk-scrape-selected');
  if (btnBulkScrapeSelected) {
    btnBulkScrapeSelected.addEventListener('click', () => {
      if (selectedRomsBulk.length === 0) {
        showToast("Scrape etmek için en az 1 oyun seçmelisiniz!", "error");
        return;
      }
      startBulkScrape([...selectedRomsBulk]);
    });
  }

  const btnBulkCancel = document.getElementById('btn-bulk-cancel');
  if (btnBulkCancel) {
    btnBulkCancel.addEventListener('click', () => {
      if (confirm("Toplu tarama işlemini iptal etmek istediğinize emin misiniz? O ana kadar indirilen tüm veriler kaydedilecektir.")) {
        isBulkCancelled = true;
        btnBulkCancel.disabled = true;
        btnBulkCancel.innerHTML = `🛑 İptal ediliyor...`;
      }
    });
  }

  const btnBulkClose = document.getElementById('btn-bulk-close');
  if (btnBulkClose) {
    btnBulkClose.addEventListener('click', () => {
      const modal = document.getElementById('bulk-scrape-modal');
      if (modal) modal.style.display = 'none';
      renderActiveGames();
    });
  }

  // EULA Accept Button Listener
  const btnAcceptEula = document.getElementById('btn-accept-eula');
  if (btnAcceptEula) {
    btnAcceptEula.addEventListener('click', () => {
      localStorage.setItem('rrm_eula_accepted', 'true');
      const eulaModal = document.getElementById('eula-modal');
      if (eulaModal) {
        eulaModal.classList.remove('active');
      }
      showToast("Kullanım koşulları kabul edildi!", "success");
    });
  }

  // --- Logger Event Listeners (v1.9.0) ---
  const logPanel = document.getElementById('log-panel');
  const resizer = document.getElementById('log-panel-resizer');
  if (resizer && logPanel) {
    // Restore saved height
    const savedHeight = localStorage.getItem('rrm_logs_height') || '220px';
    logPanel.style.height = savedHeight;

    let startY, startHeight;
    const doDrag = (e) => {
      let newHeight = startHeight - (e.clientY - startY);
      const minHeight = 80;
      const maxHeight = window.innerHeight * 0.5; // Max 50% of viewport height
      if (newHeight < minHeight) newHeight = minHeight;
      if (newHeight > maxHeight) newHeight = maxHeight;
      logPanel.style.height = `${newHeight}px`;
      localStorage.setItem('rrm_logs_height', `${newHeight}px`);
    };
    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
      Logger.scrollToBottom();
    };
    resizer.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startHeight = parseInt(document.defaultView.getComputedStyle(logPanel).height, 10);
      document.addEventListener('mousemove', doDrag);
      document.addEventListener('mouseup', stopDrag);
      e.preventDefault();
    });
  }

  const btnClearLogs = document.getElementById('btn-clear-logs');
  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
      Logger.clear();
    });
  }

  const btnCollapseLogs = document.getElementById('btn-collapse-logs');
  if (btnCollapseLogs) {
    btnCollapseLogs.addEventListener('click', () => {
      localStorage.setItem('rrm_logs_collapsed', 'true');
      Logger.updatePanelVisibility();
    });
  }

  const btnExpandLogs = document.getElementById('btn-expand-logs');
  if (btnExpandLogs) {
    btnExpandLogs.addEventListener('click', () => {
      localStorage.setItem('rrm_logs_collapsed', 'false');
      Logger.updatePanelVisibility();
    });
  }
}

// --- Update Advanced Folder Paths Default Inputs ---
function updateAdvancedPathsDefaults(preset) {
  const inpAdvImages = document.getElementById('inp-adv-images-root');
  const inpAdvRoms = document.getElementById('inp-adv-roms-root');
  const inpAdvVideos = document.getElementById('inp-adv-videos-root');
  
  if (!inpAdvImages || !inpAdvRoms || !inpAdvVideos) return;
  
  if (preset === 'standard') {
    inpAdvRoms.value = "";
    inpAdvImages.value = "./images";
    inpAdvVideos.value = "./videos";
  } else if (preset === 'crossmix') {
    inpAdvRoms.value = "./Roms";
    inpAdvImages.value = "/Imgs";
    inpAdvVideos.value = "./videos";
  } else if (preset === 'r36s') {
    inpAdvRoms.value = "";
    inpAdvImages.value = "./images";
    inpAdvVideos.value = "./videos";
  } else if (preset === 'custom') {
    const romsDir = document.getElementById('inp-custom-roms').value.trim();
    inpAdvRoms.value = romsDir ? (romsDir.startsWith('./') || romsDir.startsWith('/') ? romsDir : `./${romsDir}`) : "";
    
    const imgLoc = document.getElementById('sel-custom-images-loc').value;
    if (imgLoc === 'root-separate') {
      const imgDir = document.getElementById('inp-custom-images-dir').value.trim() || "Imgs";
      inpAdvImages.value = imgDir.startsWith('/') ? imgDir : `/${imgDir}`;
    } else {
      inpAdvImages.value = "./images";
    }
    inpAdvVideos.value = "./videos";
  }
}

// --- File System: Select SD Card Root Directory ---
async function selectSDCardWorkspace() {
  try {
    // Open Directory Picker
    sdCardHandle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });

    Logger.success("SD Kart başarıyla seçildi: " + sdCardHandle.name);

    // Update Status Indicator
    const indicator = document.getElementById('workspace-indicator');
    const folderPathEl = document.getElementById('workspace-folder-path');
    
    if (indicator && folderPathEl) {
      indicator.className = 'status-indicator connected';
      folderPathEl.textContent = sdCardHandle.name;
    }

    // Save to IndexedDB if auto-reconnect is allowed
    const isAutoReconnectEnabled = localStorage.getItem('rrm_auto_reconnect') !== 'false';
    if (isAutoReconnectEnabled) {
      await saveSDCardHandle(sdCardHandle);
    }

    // Hide reconnect button if visible
    const reconnectBtn = document.getElementById('btn-reconnect-sd');
    if (reconnectBtn) reconnectBtn.style.display = 'none';

    // Initialize workspace logic from the handle
    await initWorkspaceFromHandle();

  } catch (err) {
    Logger.error("Dizin erişim hatası: " + err.message);
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
    Logger.success("Cihaz profili başarıyla yüklendi: " + currentProfile.cardName);

    // Load logger preference
    if (currentProfile.enableLogger === true) {
      Logger.enabled = true;
      localStorage.setItem('rrm_logger_enabled', 'true');
    } else {
      Logger.enabled = false;
      localStorage.setItem('rrm_logger_enabled', 'false');
    }
    Logger.updatePanelVisibility();

    // Auto-accept EULA in localStorage if it was already accepted on this SD card (.rrmas)
    if (currentProfile.eulaAccepted === true) {
      localStorage.setItem('rrm_eula_accepted', 'true');
      Logger.info("EULA Kullanım Koşulları önceden onaylanmış.");
      const eulaModal = document.getElementById('eula-modal');
      if (eulaModal) {
        eulaModal.classList.remove('active');
      }
    }
  } catch(err) {
    Logger.warn(".rrmas profil dosyası bulunamadı, profil oluşturucu penceresi açılıyor.");
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
      
      // Update advanced default paths
      updateAdvancedPathsDefaults("standard");
      
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
        imagesRoot: "./images",
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
    showToast("Profil dosyası başarıyla silindi! Kart yapısı sıfırlandı.", 'success');

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

  // Save Reconnect setting
  const autoReconnectVal = document.getElementById('chk-auto-reconnect').checked;
  currentProfile.autoReconnect = autoReconnectVal;
  localStorage.setItem('rrm_auto_reconnect', autoReconnectVal ? 'true' : 'false');
  if (!autoReconnectVal) {
    await clearSDCardHandle();
  } else if (sdCardHandle) {
    await saveSDCardHandle(sdCardHandle);
  }
  
  const customRomsRoot = document.getElementById('inp-adv-roms-root').value.trim();
  const customImagesRoot = document.getElementById('inp-adv-images-root').value.trim() || "./images";
  const customVideosRoot = document.getElementById('inp-adv-videos-root').value.trim() || "./videos";
  
  let imagesLocVal = "roms-sub";
  if (presetVal === 'crossmix') {
    imagesLocVal = "root-separate";
  } else if (presetVal === 'custom') {
    imagesLocVal = document.getElementById('sel-custom-images-loc').value;
  }

  currentProfile.paths = {
    romsRoot: customRomsRoot,
    imagesRoot: customImagesRoot,
    videosRoot: customVideosRoot,
    imagesLoc: imagesLocVal
  };

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

  // Save Scraper credentials
  currentProfile.scraper = {
    ssid: document.getElementById('inp-scraper-ssid').value.trim(),
    sspassword: document.getElementById('inp-scraper-sspassword').value.trim(),
    devid: document.getElementById('inp-scraper-devid').value.trim(),
    devpassword: document.getElementById('inp-scraper-devpassword').value.trim(),
    mediaPref: document.getElementById('inp-scraper-media').value,
    compress: document.getElementById('chk-scraper-compress').checked
  };

  // Save Logger preference
  const enableLoggerVal = document.getElementById('chk-enable-logger').checked;
  currentProfile.enableLogger = enableLoggerVal;
  localStorage.setItem('rrm_logger_enabled', enableLoggerVal ? 'true' : 'false');
  Logger.enabled = enableLoggerVal;
  Logger.updatePanelVisibility();
  if (enableLoggerVal) {
    Logger.info("Canlı Sistem Log Penceresi etkinleştirildi.");
  }

  // Save EULA acceptance
  currentProfile.eulaAccepted = localStorage.getItem('rrm_eula_accepted') === 'true';

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

// --- Recursively Scan SD Card Folders (Lazy Scanning) ---
async function scanSDCardDirectories() {
  Logger.info("SD Kart dizinleri taranıyor...");
  consoleData = {};
  
  // Set up blank structure for all consoles
  for (const key in CONSOLE_CONFIGS) {
    consoleData[key] = {
      config: CONSOLE_CONFIGS[key],
      games: [],
      dirHandle: null,
      xmlFileHandle: null,
      gamelistXML: null,
      sqliteDB: null,
      isFullyLoaded: false
    };
  }

  const progressBar = document.getElementById('scan-progress-fill');
  const progressText = document.getElementById('scan-progress-text');
  
  // Resolve ROMs Root directory dynamically with recursive cleaning (supports leading/trailing slashes and dots)
  let romsRootHandle = sdCardHandle;
  if (currentProfile.paths.romsRoot) {
    try {
      const cleanRomsRoot = currentProfile.paths.romsRoot
        .replace(/^\.\//, '')
        .replace(/^\//, '')
        .replace(/\/$/, '')
        .trim();
      
      if (cleanRomsRoot) {
        const pathParts = cleanRomsRoot.split('/');
        let currentHandle = sdCardHandle;
        for (const part of pathParts) {
          if (part) {
            currentHandle = await currentHandle.getDirectoryHandle(part, { create: false });
          }
        }
        romsRootHandle = currentHandle;
      }
      Logger.info(`ROMs ana klasörüne erişildi: /${cleanRomsRoot || ""}`);
      console.log(`ROMs ana klasörüne erişildi: /${cleanRomsRoot || ""}`);
    } catch (err) {
      Logger.warn(`ROMs ana klasörü bulunamadı: ${currentProfile.paths.romsRoot}. Kök dizin kullanılacak: ${err.message}`);
      console.warn(`ROMs ana klasörü bulunamadı: ${currentProfile.paths.romsRoot}. Kök klasörden aranıyor.`, err);
      romsRootHandle = sdCardHandle;
    }
  }

  // Get all directory entries under the ROMs root
  let entries = [];
  try {
    for await (const entry of romsRootHandle.values()) {
      if (entry.kind === 'directory') {
        if (entry.name.startsWith('.')) continue; // Skip hidden macOS/system directories
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
      
      // Çakışma Önleme: Eğer bu konsol için zaten bir klasör taranmışsa, ikinciyi atla!
      if (system.dirHandle !== null) {
        Logger.warn(`[Çakışma Önleme] "${system.config.displayName}" için zaten "/${system.dirHandle.name}" klasörü taranmıştı. Eşleşen "/${dirEntry.name}" klasörü atlanıyor.`);
        console.warn(`[Çakışma Önleme] "${matchedConsoleKey}" sistemi için zaten "/${system.dirHandle.name}" klasörü taranmıştı. İkinci eşleşen "/${dirEntry.name}" klasörü atlanıyor.`);
        continue;
      }

      system.dirHandle = dirEntry;
      system.isFullyLoaded = false;
      Logger.info(`Konsol klasörü bulundu: /${dirEntry.name} (${system.config.displayName})`);

      // Load games list from IndexedDB cache to populate badges instantly
      try {
        const cachedGames = await loadGamesCache(matchedConsoleKey);
        if (cachedGames && Array.isArray(cachedGames)) {
          system.games = cachedGames;
          Logger.info(`[Önbellek] '${system.config.displayName}' için ${cachedGames.length} oyun IndexedDB'den yüklendi.`);
          console.log(`[IndexedDB Cache] '${matchedConsoleKey}' için ${cachedGames.length} oyun önbellekten yüklendi.`);
        }
      } catch (cacheErr) {
        console.warn(`[IndexedDB Cache] '${matchedConsoleKey}' önbelleği okunurken hata:`, cacheErr);
      }
    }
  }

  // Remove empty consoles from consoleData so we only display what actually exists
  // But wait, if they have no cache yet, their games list is empty. If they have a folder, we want to keep them!
  for (const key in consoleData) {
    if (!consoleData[key].dirHandle) {
      delete consoleData[key];
    }
  }

  const totalFoundConsoles = Object.keys(consoleData).length;
  Logger.success(`Dizin taraması tamamlandı. Toplam ${totalFoundConsoles} aktif konsol listelendi.`);

  // Render Sidebar
  renderSidebarConsoles();
}

// --- Scan ROM files inside a specific Console Directory ---
async function scanROMFilesInDirectory(system) {
  const extensions = system.config.extensions;
  const dirHandle = system.dirHandle;

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      if (entry.name.startsWith('.')) continue; // Skip hidden macOS AppleDouble and system files
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

  Logger.info(`${system.config.displayName} sistemi için gamelist.xml yükleniyor...`);

  try {
    // Try to open existing gamelist.xml
    xmlFileHandle = await dirHandle.getFileHandle('gamelist.xml', { create: false });
    const file = await xmlFileHandle.getFile();
    xmlText = await file.text();
    system.xmlFileHandle = xmlFileHandle;
  } catch (err) {
    // gamelist.xml does not exist, we'll create it later when saving
    Logger.info(`${system.config.displayName} için gamelist.xml bulunamadı, sıfırdan oluşturulacak.`);
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
        
        const localVideoPath = getXmlNodeValue(node, 'video') || "";
        matchedGame.video = localVideoPath;

        matchedGame.isScraped = true;

        // Try to load the local image blob if image path is valid
        if (localImgPath) {
          // Bypassed during initial scan for instant performance (lazy loaded in UI)
        }
      }
    }
    Logger.success(`${system.config.displayName} için gamelist.xml başarıyla yüklendi.`);
  } catch (err) {
    Logger.error(`${system.config.displayName} için XML ayrıştırma hatası: ${err.message}`);
    console.error("XML ayrıştırma hatası:", err);
    system.gamelistXML = new DOMParser().parseFromString('<?xml version="1.0"?><gameList></gameList>', 'text/xml');
  }
}

// --- Auto-detect existing ROM covers on SD card based on filenames ---
async function tryAutoDetectLocalImage(system, game) {
  try {
    const baseName = game.filename.substring(0, game.filename.lastIndexOf('.'));
    let sysImgsHandle = null;

    if (currentProfile.paths.imagesLoc === 'root-separate') {
      const cleanImgRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
      const imgsRootHandle = await sdCardHandle.getDirectoryHandle(cleanImgRoot, { create: false });
      sysImgsHandle = await imgsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: false });
    } else {
      // standard subfolder - resolve dynamically using imagesRoot
      try {
        const imgDirName = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
        const pathParts = imgDirName.split('/');
        let currentHandle = system.dirHandle;
        for (const part of pathParts) {
          if (part) {
            currentHandle = await currentHandle.getDirectoryHandle(part, { create: false });
          }
        }
        sysImgsHandle = currentHandle;
      } catch(e) {
        // standard media/images fallback
        try {
          const mediaHandle = await system.dirHandle.getDirectoryHandle('media', { create: false });
          sysImgsHandle = await mediaHandle.getDirectoryHandle('images', { create: false });
        } catch(e2) {
          // Try direct 'images' or 'downloaded_images' folder inside system dir
          try {
            sysImgsHandle = await system.dirHandle.getDirectoryHandle('images', { create: false });
          } catch(e3) {
            try {
              sysImgsHandle = await system.dirHandle.getDirectoryHandle('downloaded_images', { create: false });
            } catch(e4) {}
          }
        }
      }
    }

    if (sysImgsHandle) {
      let fileHandle = null;
      let resolvedExt = "";
      let resolvedSuffix = "";

      // Try common suffixes and extensions
      const suffixesToTry = ["", "-image", "-thumb", "-boxart", "-marquee", "-titlescreen", "-screenshot"];
      const extensionsToTry = ['png', 'jpg', 'jpeg', 'gif', 'PNG', 'JPG', 'JPEG'];

      for (const suffix of suffixesToTry) {
        for (const ext of extensionsToTry) {
          try {
            fileHandle = await sysImgsHandle.getFileHandle(`${baseName}${suffix}.${ext}`, { create: false });
            resolvedExt = ext;
            resolvedSuffix = suffix;
            break;
          } catch(e) {}
        }
        if (fileHandle) break;
      }

      if (fileHandle) {
        const file = await fileHandle.getFile();
        game.image = URL.createObjectURL(file);
        
        // Save the correct relative path style
        if (currentProfile.paths.imagesLoc === 'root-separate') {
          game.localImagePath = `/${currentProfile.paths.imagesRoot}/${getSystemFolderName(system)}/${baseName}${resolvedSuffix}.${resolvedExt}`;
        } else {
          game.localImagePath = `./${currentProfile.paths.imagesRoot}/${baseName}${resolvedSuffix}.${resolvedExt}`;
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

      const cleanImgRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
      const imgsRootHandle = await sdCardHandle.getDirectoryHandle(cleanImgRoot, { create: false });
      const sysImgsHandle = await imgsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: false });
      
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
    // Try a final fallback: check if image exists with standard naming and suffixes in designated folders
    try {
      const baseName = game.filename.substring(0, game.filename.lastIndexOf('.'));
      let sysImgsHandle = null;

      if (currentProfile.paths.imagesLoc === 'root-separate') {
        const cleanImgRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
        const imgsRootHandle = await sdCardHandle.getDirectoryHandle(cleanImgRoot, { create: false });
        sysImgsHandle = await imgsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: false });
      } else {
        const imgDirName = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
        const pathParts = imgDirName.split('/');
        let currentHandle = system.dirHandle;
        for (const part of pathParts) {
          if (part) {
            try {
              currentHandle = await currentHandle.getDirectoryHandle(part, { create: false });
            } catch(e) {
              currentHandle = null;
              break;
            }
          }
        }
        sysImgsHandle = currentHandle;
      }

      if (sysImgsHandle) {
        let fileHandle = null;
        let resolvedExt = "";
        let resolvedSuffix = "";
        
        const suffixesToTry = ["", "-image", "-thumb", "-boxart", "-marquee", "-titlescreen", "-screenshot"];
        const extensionsToTry = ['png', 'jpg', 'jpeg', 'gif', 'PNG', 'JPG', 'JPEG'];

        for (const suffix of suffixesToTry) {
          for (const ext of extensionsToTry) {
            try {
              fileHandle = await sysImgsHandle.getFileHandle(`${baseName}${suffix}.${ext}`, { create: false });
              resolvedExt = ext;
              resolvedSuffix = suffix;
              break;
            } catch(e) {}
          }
          if (fileHandle) break;
        }

        if (fileHandle) {
          const file = await fileHandle.getFile();
          game.image = URL.createObjectURL(file);
          game.localImagePath = currentProfile.paths.imagesLoc === 'root-separate' ? 
            `/${currentProfile.paths.imagesRoot}/${getSystemFolderName(system)}/${baseName}${resolvedSuffix}.${resolvedExt}` : 
            `./${currentProfile.paths.imagesRoot}/${baseName}${resolvedSuffix}.${resolvedExt}`;
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

  // 1. Group consoles by manufacturer
  const groups = {};
  for (const key in consoleData) {
    const sys = consoleData[key];
    const gameCount = sys.games.length;
    totalRoms += gameCount;

    const coveredCount = sys.games.filter(g => g.image !== "").length;
    totalCovered += coveredCount;

    // Hide empty systems if showEmptySystems is false
    if (sys.isFullyLoaded && gameCount === 0 && !showEmptySystems) {
      continue;
    }

    const manuf = getConsoleManufacturer(key);
    if (!groups[manuf.name]) {
      groups[manuf.name] = {
        name: manuf.name,
        logo: manuf.logo,
        totalGames: 0,
        systems: []
      };
    }
    
    groups[manuf.name].totalGames += gameCount;
    groups[manuf.name].systems.push({ key, sys, gameCount });
  }

  // 2. Render each group
  for (const groupName in groups) {
    const group = groups[groupName];
    const isCollapsed = !!sidebarCollapseState[groupName];

    const groupDiv = document.createElement('div');
    groupDiv.className = 'manufacturer-group';

    // Header
    const header = document.createElement('div');
    header.className = 'manufacturer-header';
    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px">
        <span class="manuf-name">${group.name}</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px">
        <span class="manuf-count">${group.totalGames} OYUN</span>
        <span class="collapse-toggle">${isCollapsed ? '+' : '-'}</span>
      </div>
    `;

    // Click to Toggle Collapse/Expand
    header.addEventListener('click', () => {
      sidebarCollapseState[groupName] = !sidebarCollapseState[groupName];
      localStorage.setItem('rrm_sidebar_collapse', JSON.stringify(sidebarCollapseState));
      renderSidebarConsoles();
    });

    groupDiv.appendChild(header);

    // Console Items Sublist (UL)
    const sublist = document.createElement('ul');
    sublist.className = 'console-sublist';
    sublist.style.display = isCollapsed ? 'none' : 'flex';
    sublist.style.flexDirection = 'column';

    group.systems.forEach(itemData => {
      const item = document.createElement('li');
      item.className = `console-item ${activeConsole === itemData.key ? 'active' : ''}`;
      item.setAttribute('data-console', itemData.key);
      item.innerHTML = `
        <div class="console-info">
          <span class="console-logo">${itemData.sys.config.logo}</span>
          <span class="console-name">${itemData.sys.config.displayName}</span>
        </div>
        <span class="console-badge">${itemData.gameCount}</span>
      `;

      item.addEventListener('click', () => {
        activateConsoleCategory(itemData.key);
      });

      sublist.appendChild(item);
    });

    groupDiv.appendChild(sublist);
    listContainer.appendChild(groupDiv);
  }

  // Update Statistics
  const statTotalRoms = document.getElementById('stat-total-roms');
  const statCovered = document.getElementById('stat-total-scraped');
  const statMissing = document.getElementById('stat-total-missing');

  if (statTotalRoms) statTotalRoms.textContent = totalRoms;
  if (statCovered) statCovered.textContent = totalCovered;
  if (statMissing) statMissing.textContent = totalRoms - totalCovered;
}

// --- Render Games Loading State (Spinner) ---
function renderGamesLoadingState(consoleName) {
  const container = document.getElementById('game-grid-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="empty-state" style="padding: 60px 20px;">
      <div class="retro-spinner"></div>
      <h3 class="empty-title" style="color:hsl(var(--retro-cyan)); text-shadow:0 0 10px rgba(0,243,255,0.4)">${consoleName} Oyunları Yükleniyor</h3>
      <p class="empty-desc">SD karttaki ROM dosyaları taranıyor ve meta veriler eşitleniyor...</p>
    </div>
  `;
}

// --- Lazy Load & Reconcile Sync for Console games ---
async function lazyLoadAndSyncConsole(system) {
  if (system.isFullyLoaded) return;

  const extensions = system.config.extensions;
  const dirHandle = system.dirHandle;
  
  let consoleKey = null;
  for (const k in consoleData) {
    if (consoleData[k] === system) {
      consoleKey = k;
      break;
    }
  }
  if (!consoleKey) return;

  console.log(`[Lazy Load] '${consoleKey}' klasörü taranıyor...`);

  // 1. Scan active files in the directory handle (fast list)
  const activeFiles = [];
  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        if (entry.name.startsWith('.')) continue; // Skip hidden macOS system files
        const ext = entry.name.split('.').pop().toLowerCase();
        if (extensions.includes(ext)) {
          activeFiles.push(entry);
        }
      }
    }
  } catch (err) {
    console.error(`[Lazy Load] '${consoleKey}' dizin okuma hatası:`, err);
  }

  // 2. Build a map of games we got from cache to retain their metadata
  const cachedMap = new Map();
  if (system.games && Array.isArray(system.games)) {
    for (const game of system.games) {
      cachedMap.set(game.filename.toLowerCase(), game);
    }
  }

  // 3. Reconcile scanned files against cache
  const syncedGames = [];
  
  for (const fileEntry of activeFiles) {
    const fileLower = fileEntry.name.toLowerCase();
    if (cachedMap.has(fileLower)) {
      const cachedGame = cachedMap.get(fileLower);
      cachedGame.fileHandle = fileEntry; // Restore active FileSystemFileHandle
      syncedGames.push(cachedGame);
    } else {
      // New ROM found!
      const ext = fileEntry.name.split('.').pop().toLowerCase();
      syncedGames.push({
        filename: fileEntry.name,
        extension: ext,
        fileHandle: fileEntry,
        title: formatFilenameToTitle(fileEntry.name),
        rating: "",
        releasedate: "",
        developer: "",
        publisher: "",
        genre: "",
        players: "",
        description: "",
        image: "",
        localImagePath: "",
        video: "",
        isScraped: false,
        scrapedImageBlob: null
      });
    }
  }

  system.games = syncedGames;

  // 4. Load XML or SQLite database to overlay metadata from SD card
  try {
    if (currentProfile.metadataStorage === 'sqlite') {
      await tryLoadOrCreateSqliteDB(system);
    } else {
      await loadOrCreateGamelistXML(system);
    }
  } catch (dbErr) {
    console.error(`[Lazy Load] '${consoleKey}' metadata okuma hatası:`, dbErr);
  }

  // 5. Save synced data back to IndexedDB cache
  await saveGamesCache(consoleKey, system.games);

  // 6. Mark as fully loaded
  system.isFullyLoaded = true;
  console.log(`[Lazy Load] '${consoleKey}' başarıyla yüklendi. Oyun sayısı: ${system.games.length}`);
}

// --- Activate Console Category ---
async function activateConsoleCategory(key) {
  activeConsole = key;

  // Clear bulk selections
  selectedRomsBulk = [];
  lastCheckedGame = null;
  updateBulkActionBarUI();

  // Update Sidebar active state
  document.querySelectorAll('.console-item').forEach(item => {
    const con = item.getAttribute('data-console');
    item.classList.toggle('active', con === key);
  });

  // Clear Inspector
  clearInspector();

  // Lazy scan and sync if not fully loaded yet
  const system = consoleData[key];
  if (system && !system.isFullyLoaded) {
    renderGamesLoadingState(system.config.displayName);
    await lazyLoadAndSyncConsole(system);
    renderSidebarConsoles(); // Update counts and badges after loading completed
  }

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

  if (showDuplicatesOnly) {
    renderDuplicateGroupsView(container, filteredGames);
    return;
  }

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

// --- Lazy Loading Image Observer ---
const boxartObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(async entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      const game = img.gameData;
      const system = img.systemData;
      observer.unobserve(img); // Stop observing once visible
      
      try {
        await lazyLoadGameImage(game, img, system);
      } catch (err) {
        console.error("Lazy load hatası:", err);
      }
    }
  });
}, { rootMargin: '120px' }); // Load 120px before coming into view

async function lazyLoadGameImage(game, imgElement, system) {
  // If already loaded, show it
  if (game.image && game.image.startsWith('blob:')) {
    imgElement.src = game.image;
    imgElement.style.opacity = '1';
    return;
  }
  
  // If has local path, load it
  if (game.localImagePath) {
    try {
      await loadLocalImageBlob(system, game, game.localImagePath);
    } catch (e) {
      console.warn("Lazy image load failed, trying auto-detect:", e);
    }
  }
  
  // If still not loaded, try auto-detect
  if (!game.image) {
    try {
      await tryAutoDetectLocalImage(system, game);
    } catch (e) {
      console.warn("Auto-detect failed:", e);
    }
  }
  
  // If loaded successfully, display
  if (game.image) {
    imgElement.src = game.image;
    imgElement.style.opacity = '1';
  } else {
    // Replace with nostalgic cartridge placeholder
    const wrapper = imgElement.parentElement;
    if (wrapper) {
      wrapper.innerHTML = `<div class="cartridge-placeholder">
        <span class="cartridge-label">${game.title}</span>
      </div>`;
    }
  }
}

// --- Render Grid Thumbnail Layout ---
function renderGridView(container, games) {
  const grid = document.createElement('div');
  grid.className = 'rom-grid';

  const system = consoleData[activeConsole];

  games.forEach(game => {
    const card = document.createElement('div');
    card.className = `rom-card ${selectedRom === game ? 'active' : ''}`;
    
    // Check if this game is currently selected in bulk
    const isChecked = selectedRomsBulk.includes(game);
    
    // Scraped Badge
    const hasImage = game.image !== "" || game.localImagePath !== "";
    const scrapedDotClass = hasImage ? 'completed' : '';
    const badgeText = game.filename.split('.').pop();
    const isImageLoaded = game.image && (game.image.startsWith('blob:') || game.image.startsWith('http'));

    card.innerHTML = `
      <!-- Bulk Checkbox -->
      <div class="bulk-chk-wrapper" style="position:absolute; top:8px; left:8px; z-index:10; pointer-events:auto">
        <input type="checkbox" class="bulk-chk" ${isChecked ? 'checked' : ''} style="accent-color:hsl(var(--retro-cyan)); width:16px; height:16px; cursor:pointer">
      </div>
      <span class="card-badge" style="right:8px; top:8px">${badgeText}</span>
      <span class="scraped-dot ${scrapedDotClass}"></span>
      <div class="boxart-wrapper" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; position:relative">
        ${isImageLoaded ? 
          `<img class="boxart-img" src="${game.image}" alt="${game.title}" style="opacity:1; width:100%; height:100%; object-fit:inherit">` :
          `<img class="boxart-img lazy-boxart" alt="${game.title}" style="opacity:0; transition:opacity 0.25s ease; width:100%; height:100%; object-fit:inherit">`
        }
      </div>
      <div class="rom-info">
        <h4 class="rom-title" title="${game.title}">${game.title}</h4>
        <div class="rom-system-ext">
          <span>${activeConsole.toUpperCase()}</span>
          <span>${(game.rating && !isNaN(parseFloat(game.rating)) && parseFloat(game.rating) > 0 ? Math.round(parseFloat(game.rating) * 100) + '%' : '')}</span>
        </div>
      </div>
    `;

    // Bind checkbox change event listener
    const chk = card.querySelector('.bulk-chk');
    if (chk) {
      chk.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent opening game details
        
        const isChecked = chk.checked;
        
        if (e.shiftKey && lastCheckedGame && games.includes(lastCheckedGame)) {
          const lastIdx = games.indexOf(lastCheckedGame);
          const currentIdx = games.indexOf(game);
          const start = Math.min(lastIdx, currentIdx);
          const end = Math.max(lastIdx, currentIdx);
          
          for (let idx = start; idx <= end; idx++) {
            const targetGame = games[idx];
            if (isChecked) {
              if (!selectedRomsBulk.includes(targetGame)) {
                selectedRomsBulk.push(targetGame);
              }
            } else {
              selectedRomsBulk = selectedRomsBulk.filter(g => g !== targetGame);
            }
          }
          
          renderActiveGames();
          updateBulkActionBarUI();
        } else {
          if (isChecked) {
            if (!selectedRomsBulk.includes(game)) selectedRomsBulk.push(game);
          } else {
            selectedRomsBulk = selectedRomsBulk.filter(g => g !== game);
          }
          lastCheckedGame = game;
          updateBulkActionBarUI();
        }
      });
    }

    card.addEventListener('click', () => {
      selectRomForInspection(game, card);
    });

    const imgEl = card.querySelector('.lazy-boxart');
    if (imgEl) {
      imgEl.gameData = game;
      imgEl.systemData = system;
      boxartObserver.observe(imgEl);
    }

    grid.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(grid);
}

// --- Render List Layout ---
function renderListView(container, games) {
  const list = document.createElement('div');
  list.className = 'rom-list-layout';

  const system = consoleData[activeConsole];

  games.forEach(game => {
    const row = document.createElement('div');
    row.className = `rom-row-item ${selectedRom === game ? 'active' : ''}`;

    // Check if this game is currently selected in bulk
    const isChecked = selectedRomsBulk.includes(game);
    const isScraped = game.image !== "" || game.localImagePath !== "";
    const isImageLoaded = game.image && (game.image.startsWith('blob:') || game.image.startsWith('http'));

    row.innerHTML = `
      <!-- Bulk Checkbox -->
      <div class="bulk-chk-wrapper" style="display:flex; align-items:center; margin-right:12px; pointer-events:auto">
        <input type="checkbox" class="bulk-chk" ${isChecked ? 'checked' : ''}>
      </div>
      <div class="row-left">
        <div class="row-icon-wrapper" style="display:flex; align-items:center; justify-content:center">
          ${isImageLoaded ? 
            `<img class="row-thumb" src="${game.image}" alt="${game.title}" style="opacity:1; width:100%; height:100%; object-fit:cover">` :
            `<img class="row-thumb lazy-row-thumb" alt="${game.title}" style="opacity:0; transition:opacity 0.2s ease; width:100%; height:100%; object-fit:cover">`
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

    // Bind checkbox change event listener
    const chk = row.querySelector('.bulk-chk');
    if (chk) {
      chk.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent opening game details
        
        const isChecked = chk.checked;
        
        if (e.shiftKey && lastCheckedGame && games.includes(lastCheckedGame)) {
          const lastIdx = games.indexOf(lastCheckedGame);
          const currentIdx = games.indexOf(game);
          const start = Math.min(lastIdx, currentIdx);
          const end = Math.max(lastIdx, currentIdx);
          
          for (let idx = start; idx <= end; idx++) {
            const targetGame = games[idx];
            if (isChecked) {
              if (!selectedRomsBulk.includes(targetGame)) {
                selectedRomsBulk.push(targetGame);
              }
            } else {
              selectedRomsBulk = selectedRomsBulk.filter(g => g !== targetGame);
            }
          }
          
          renderActiveGames();
          updateBulkActionBarUI();
        } else {
          if (isChecked) {
            if (!selectedRomsBulk.includes(game)) selectedRomsBulk.push(game);
          } else {
            selectedRomsBulk = selectedRomsBulk.filter(g => g !== game);
          }
          lastCheckedGame = game;
          updateBulkActionBarUI();
        }
      });
    }

    row.addEventListener('click', () => {
      selectRomForInspection(game, row);
    });

    const imgEl = row.querySelector('.lazy-row-thumb');
    if (imgEl) {
      imgEl.gameData = game;
      imgEl.systemData = system;
      boxartObserver.observe(imgEl);
    }

    list.appendChild(row);
  });

  container.innerHTML = '';
  container.appendChild(list);
}

// --- Get a normalized title key for duplicate detection ---
function getNormalizedGameKey(filename) {
  // Remove extension
  let name = filename.substring(0, filename.lastIndexOf('.')) || filename;
  // Remove parentheses and brackets content (USA, Europe, Rev 1, etc.)
  name = name.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '');
  // Remove special characters, punctuation, and extra spaces (supporting international Unicode alphabets)
  name = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return name.trim();
}

// --- Render Duplicate Groups View Mode ---
function renderDuplicateGroupsView(container, games) {
  // 1. Group games by their normalized key
  const groups = {};
  games.forEach(game => {
    const key = getNormalizedGameKey(game.filename);
    if (!groups[key]) groups[key] = [];
    groups[key].push(game);
  });

  // 2. Filter groups to only keep duplicate groups (length > 1)
  const duplicateKeys = Object.keys(groups).filter(key => groups[key].length > 1);

  if (duplicateKeys.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="border-color: rgba(255, 235, 59, 0.1);">
        <span class="empty-icon" style="color: hsl(var(--retro-yellow)); text-shadow: 0 0 10px rgba(255,235,95,0.4)">✨</span>
        <h3 class="empty-title" style="color:#fff">Mükerrer Kopya Bulunmadı!</h3>
        <p class="empty-desc">Harika! Bu konsol klasöründeki tüm oyunlar benzersiz görünüyor. Mükerrer hiçbir kopya tespit edilmedi.</p>
      </div>
    `;
    return;
  }

  // Pre-sort all groups and build a flat array of all duplicate games for Shift+Click range matching
  const flatDuplicateGames = [];
  const sortedGroups = {};
  
  duplicateKeys.forEach(key => {
    const groupGames = groups[key];
    // Sort games in the group: prefer .zip files, then alphabetically
    groupGames.sort((a, b) => {
      const extA = a.filename.split('.').pop().toLowerCase();
      const extB = b.filename.split('.').pop().toLowerCase();
      if (extA === 'zip' && extB !== 'zip') return -1;
      if (extA !== 'zip' && extB === 'zip') return 1;
      return a.filename.localeCompare(b.filename);
    });
    sortedGroups[key] = groupGames;
    flatDuplicateGames.push(...groupGames);
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'rom-duplicates-layout';
  wrapper.style = `
    display: flex;
    flex-direction: column;
    width: 100%;
  `;

  duplicateKeys.forEach(key => {
    const groupGames = sortedGroups[key];
    
    const panel = document.createElement('div');
    panel.className = 'duplicate-group-panel';

    // Build the header with Title, count, and the "Select All Except One" button
    const header = document.createElement('div');
    header.className = 'duplicate-group-header';
    
    // Clean up clean title name for header display from first game
    const displayTitle = cleanTitleForSearch(groupGames[0].filename);

    header.innerHTML = `
      <div class="duplicate-group-title">
        🎮 <span>${displayTitle}</span>
        <span class="duplicate-count-badge">${groupGames.length} Adet Kopya</span>
      </div>
      <button class="filter-btn btn-keep-one" style="font-size:0.65rem; padding:4px 10px; background:rgba(0, 243, 255, 0.05); border-color:hsl(var(--retro-cyan)); color:hsl(var(--retro-cyan)); font-weight:bold; cursor:pointer;" type="button">
        ☝️ 1 Tane Hariç Seç
      </button>
    `;

    panel.appendChild(header);

    // Render each duplicate file as a row
    groupGames.forEach(game => {
      const row = document.createElement('div');
      row.className = 'duplicate-file-row';
      
      const isChecked = selectedRomsBulk.includes(game);
      const isScraped = game.image !== "" || game.localImagePath !== "";
      const ext = game.filename.split('.').pop();

      row.innerHTML = `
        <input type="checkbox" class="duplicate-row-chk" ${isChecked ? 'checked' : ''}>
        <div class="duplicate-row-info">
          <div class="duplicate-row-name" title="${game.filename}">${game.filename}</div>
          <div class="duplicate-row-meta">
            <span class="duplicate-ext-badge">${ext}</span>
            <span>${isScraped ? '🟢 Görsel Kayıtlı' : '🔴 Görsel Eksik'}</span>
          </div>
        </div>
      `;

      // Click row to show details in right inspector panel
      row.addEventListener('click', (e) => {
        if (e.target.className !== 'duplicate-row-chk') {
          selectRomForInspection(game, row);
        }
      });

      // Handle checkbox click (with Shift support)
      const chk = row.querySelector('.duplicate-row-chk');
      if (chk) {
        chk.addEventListener('click', (e) => {
          e.stopPropagation(); // Avoid triggering details selection
          
          const isChecked = chk.checked;
          
          if (e.shiftKey && lastCheckedGame && flatDuplicateGames.includes(lastCheckedGame)) {
            const lastIdx = flatDuplicateGames.indexOf(lastCheckedGame);
            const currentIdx = flatDuplicateGames.indexOf(game);
            const start = Math.min(lastIdx, currentIdx);
            const end = Math.max(lastIdx, currentIdx);
            
            for (let idx = start; idx <= end; idx++) {
              const targetGame = flatDuplicateGames[idx];
              if (isChecked) {
                if (!selectedRomsBulk.includes(targetGame)) {
                  selectedRomsBulk.push(targetGame);
                }
              } else {
                selectedRomsBulk = selectedRomsBulk.filter(g => g !== targetGame);
              }
            }
            
            renderActiveGames();
            updateBulkActionBarUI();
          } else {
            if (isChecked) {
              if (!selectedRomsBulk.includes(game)) selectedRomsBulk.push(game);
            } else {
              selectedRomsBulk = selectedRomsBulk.filter(g => g !== game);
            }
            lastCheckedGame = game;
            updateBulkActionBarUI();
          }
        });
      }

      panel.appendChild(row);
    });

    // Bind event for "1 Tane Hariç Seç" (Select All Except First/Best One)
    const keepOneBtn = header.querySelector('.btn-keep-one');
    if (keepOneBtn) {
      keepOneBtn.addEventListener('click', () => {
        // We keep the first game (index 0) unselected, and select all others (indices 1 to N)
        for (let i = 1; i < groupGames.length; i++) {
          const game = groupGames[i];
          if (!selectedRomsBulk.includes(game)) {
            selectedRomsBulk.push(game);
          }
        }
        // Ensure the first one is NOT selected (so we keep exactly one!)
        selectedRomsBulk = selectedRomsBulk.filter(g => g !== groupGames[0]);

        // Re-render the checkboxes in this panel and global UI
        renderActiveGames();
        updateBulkActionBarUI();
        showToast(`"${displayTitle}" grubu için 1 kopya hariç tüm dosyalar seçildi!`, "success");
      });
    }

    wrapper.appendChild(panel);
  });

  container.innerHTML = '';
  container.appendChild(wrapper);
}

// --- Select ROM for Inspection & Display in Right Panel ---
async function selectRomForInspection(game, element) {
  selectedRom = game;

  // Toggle active class in grid
  document.querySelectorAll('.rom-card, .rom-row-item').forEach(el => {
    el.classList.remove('active');
  });
  element.classList.add('active');

  if (selectedRomsBulk.length > 1) {
    // In bulk selection mode, do not load individual inspector details, keep showing bulk mode
    selectedRom = null;
    updateBulkActionBarUI();
    return;
  }

  const system = consoleData[activeConsole];
  // Lazy-load all available images for this game
  await scanGameImagesList(system, game);

  // Populate Right Inspector Panel
  const inspectorPanel = document.getElementById('sidebar-right');
  if (!inspectorPanel) return;

  // Config default cartridge image as fallback
  const fallbackImg = system.config.defaultCart;

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
      <div style="display:flex; gap:6px">
        <button class="filter-btn" id="delete-rom-btn" style="background:rgba(255, 56, 96, 0.15); border:1px solid hsl(var(--retro-red)); color:#fff; font-size:0.75rem; padding:6px 10px; height:auto; display:flex; align-items:center; gap:4px" title="Oyunu Sil">🗑️ Sil</button>
        <button class="save-btn" id="save-meta-btn">💾 Kaydet</button>
      </div>
    </div>
    <div class="inspector-content">
      <!-- Media Panel with Carousel -->
      <div class="inspector-media-container">
        <div class="inspector-boxart" id="inspector-carousel-container" style="position:relative">
          <img src="${game.image || fallbackImg}" id="inspector-image-preview" alt="Kapak Resmi">
          
          <!-- Carousel Nav Buttons (Only if multiple images exist) -->
          ${game.imagesList && game.imagesList.length > 1 ? `
            <button class="carousel-nav-btn prev-btn" id="btn-carousel-prev" title="Önceki Görsel">◀</button>
            <button class="carousel-nav-btn next-btn" id="btn-carousel-next" title="Sonraki Görsel">▶</button>
            <span class="carousel-indicator" id="carousel-indicator">1 / ${game.imagesList.length}</span>
            <span class="carousel-suffix-label" id="carousel-suffix-label">${getFriendlySuffixName(game.imagesList[0].suffix)}</span>
          ` : ''}
          
          <div class="boxart-action-overlay">
            <button class="media-btn" id="btn-manual-cover">🖼️ Görsel Değiştir</button>
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
  const deleteRomBtn = document.getElementById('delete-rom-btn');
  if (deleteRomBtn) {
    deleteRomBtn.addEventListener('click', () => deleteSingleRom(game));
  }

  // Carousel controls logic
  let currentImgIndex = 0;
  const btnPrev = document.getElementById('btn-carousel-prev');
  const btnNext = document.getElementById('btn-carousel-next');
  const imgPreview = document.getElementById('inspector-image-preview');
  const indicator = document.getElementById('carousel-indicator');
  const suffixLabel = document.getElementById('carousel-suffix-label');

  if (btnPrev && btnNext && imgPreview) {
    const updateCarouselView = () => {
      const currentImg = game.imagesList[currentImgIndex];
      imgPreview.src = currentImg.url;
      if (indicator) indicator.textContent = `${currentImgIndex + 1} / ${game.imagesList.length}`;
      if (suffixLabel) suffixLabel.textContent = getFriendlySuffixName(currentImg.suffix);
      
      // Update selected cover path so Save will persist the currently chosen image
      game.image = currentImg.url;
      game.localImagePath = currentImg.path;
    };

    btnPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      currentImgIndex = (currentImgIndex - 1 + game.imagesList.length) % game.imagesList.length;
      updateCarouselView();
    });

    btnNext.addEventListener('click', (e) => {
      e.stopPropagation();
      currentImgIndex = (currentImgIndex + 1) % game.imagesList.length;
      updateCarouselView();
    });
  }
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
    showToast("Oyun bilgileri başarıyla SQLite veritabanına kaydedildi!", 'success');
  } else {
    await writeGamelistXMLFile(consoleData[activeConsole]);
    showToast("Oyun bilgileri başarıyla gamelist.xml dosyasına kaydedildi!", 'success');
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
      let localPath = g.localImagePath;
      if (currentProfile.paths.imagesLoc === 'root-separate') {
        const cleanRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
        const filename = localPath.split('/').pop();
        localPath = `/${cleanRoot}/${getSystemFolderName(system)}/${filename}`;
      } else {
        const cleanRoot = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
        const filename = localPath.split('/').pop();
        localPath = `./${cleanRoot}/${filename}`;
      }
      g.localImagePath = localPath;
      appendXmlTag(xmlDoc, gameNode, 'image', localPath);
    } else if (g.image && g.image.startsWith('blob:')) {
      // Local image has been scraped but doesn't have a path yet
      const safeTitle = g.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      let localPath = "";
      if (currentProfile.paths.imagesLoc === 'root-separate') {
        const cleanRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
        localPath = `/${cleanRoot}/${getSystemFolderName(system)}/${safeTitle}.png`;
      } else {
        const cleanRoot = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
        localPath = `./${cleanRoot}/${safeTitle}.png`;
      }
      g.localImagePath = localPath;
      appendXmlTag(xmlDoc, gameNode, 'image', localPath);
    } else if (g.image) {
      // Fallback external URL
      appendXmlTag(xmlDoc, gameNode, 'image', g.image);
    }

    // Save video path
    if (g.video) {
      let localPath = g.video;
      if (currentProfile.paths.imagesLoc === 'root-separate') {
        const cleanRoot = (currentProfile.paths.videosRoot || "Videos").replace(/^\//, '').replace(/\/$/, '');
        const filename = localPath.split('/').pop();
        localPath = `/${cleanRoot}/${getSystemFolderName(system)}/${filename}`;
      } else {
        const cleanRoot = (currentProfile.paths.videosRoot || "videos").replace(/^\.\//, '').replace(/\/$/, '');
        const filename = localPath.split('/').pop();
        localPath = `./${cleanRoot}/${filename}`;
      }
      g.video = localPath;
      appendXmlTag(xmlDoc, gameNode, 'video', localPath);
    }

    root.appendChild(gameNode);
  });

  // Serialize to string
  const serializer = new XMLSerializer();
  let xmlString = serializer.serializeToString(xmlDoc);
  
  // Format XML prettily
  xmlString = formatXmlString(xmlString);

  // Write to File System API
  Logger.info(`gamelist.xml dosyası diske yazılıyor: ${system.config.displayName}`);
  try {
    let fileHandle = system.xmlFileHandle;
    if (!fileHandle) {
      fileHandle = await system.dirHandle.getFileHandle('gamelist.xml', { create: true });
      system.xmlFileHandle = fileHandle;
    }

    const writable = await fileHandle.createWritable();
    await writable.write(xmlString);
    await writable.close();

    Logger.success(`gamelist.xml dosyası başarıyla diske yazıldı: ${system.config.displayName}`);

    // Update local IndexedDB cache
    let consoleKey = null;
    for (const k in consoleData) {
      if (consoleData[k] === system) {
        consoleKey = k;
        break;
      }
    }
    if (consoleKey) {
      await saveGamesCache(consoleKey, system.games);
      console.log(`[IndexedDB Cache] '${consoleKey}' için önbellek güncellendi (XML kaydı sonrası).`);
    }
  } catch (err) {
    Logger.error(`gamelist.xml yazma hatası: ${err.message}`);
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

// ScreenScraper Sistem Kimlik Eşleştirme Listesi
const SCREENSCRAPER_SYSTEM_IDS = {
  'snes': 4,
  'sfc': 4,
  'nes': 3,
  'fc': 3,
  'gba': 12,
  'gb': 9,
  'gbc': 10,
  'genesis': 1,
  'megadrive': 1,
  'md': 1,
  'psx': 57,
  'ps1': 57,
  'n64': 14,
  'nds': 18,
  'sms': 2,
  'gg': 21,
  'pce': 31,
  'pcengine': 31,
  'arcade': 75,
  'mame': 75,
  'neogeo': 142,
  'cps1': 75,
  'cps2': 75,
  'cps3': 75,
  'psp': 61,
  'saturn': 22,
  'dreamcast': 23,
  'segae': 22,
  'atari2600': 26,
  'atari5200': 40,
  'atari7800': 41,
  'c64': 66,
  'amiga': 64,
  'msx': 113,
  'msx2': 113,
  'wswan': 45,
  'wsc': 46,
  'pico8': 234,
  'scummvm': 123,
  'zxspectrum': 76
};

// Konsol adına göre ScreenScraper ID'sini çözer
function getScreenScraperSystemId(activeConsole) {
  const key = activeConsole.toLowerCase();
  return SCREENSCRAPER_SYSTEM_IDS[key] || 75; // Bulunamazsa Arcade/MAME (75) varsayılan
}

// Güvenilir ve kendi kendini onaran (self-healing) CORS proxy zinciri
async function fetchWithCorsProxy(targetUrl) {
  const proxies = [
    // 1. Yerel PHP Proksisi (Relative - Aynı sunucuda ise)
    url => `proxy.php?url=` + encodeURIComponent(url),
    
    // 2. Yerel PHP Proksisi (Laravel Herd sanal sunucusu HTTP - SSL sertifika hatası almamak için)
    url => `http://retro-rom-manager.test/proxy.php?url=` + encodeURIComponent(url),
    
    // 3. Yerel PHP Proksisi (Laravel Herd sanal sunucusu HTTPS)
    url => `https://retro-rom-manager.test/proxy.php?url=` + encodeURIComponent(url),
    
    // 4. Kamu CORS Proksileri (Eğer yerel PHP sunucusu çalışmıyorsa yedekler)
    url => `https://api.codetabs.com/v1/proxy/?quest=` + encodeURIComponent(url),
    url => `https://api.allorigins.win/raw?url=` + encodeURIComponent(url),
    url => `https://corsproxy.io/?` + encodeURIComponent(url),
    url => `https://thingproxy.freeboard.io/fetch/` + url
  ];
  let lastError = null;
  for (const proxyFn of proxies) {
    try {
      const proxiedUrl = proxyFn(targetUrl);
      console.log(`CORS Proxy deneniyor: ${proxiedUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 saniye zaman aşımı
      
      const response = await fetch(proxiedUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        // Gelen yanıtın statik olarak sunulmuş ham PHP kodu olup olmadığını kontrol et.
        // Eğer sunucu PHP dosyalarını çalıştırmak yerine düz metin olarak sunuyorsa (npx http-server gibi)
        // yanıt '<?php' ile başlar. Bu durumda bu proxy'yi geçersiz sayıp sonrakine geçmeliyiz.
        try {
          const clone = response.clone();
          const text = await clone.text();
          if (text.trim().startsWith('<?php')) {
            console.warn("Proxy PHP olarak çalıştırılamadı (statik sunucu ham PHP dosyasını döndürdü), sonraki proxy deneniyor.");
            continue;
          }
        } catch (e) {
          console.warn("Proxy ham veri okuma hatası:", e);
        }

        // Hata Ayıklama & Güvenlik Filtresi: Eğer JSON sorgusu atıyorsak, gelen verinin gerçekten JSON olup olmadığını doğrula.
        // Bazı proxy sunucuları Cloudflare engeline takılınca 200 OK durum koduyla HTML hata sayfası dönerler.
        if (targetUrl.includes('output=json')) {
          try {
            const clone = response.clone();
            const text = await clone.text();
            if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
              console.warn("Proxy başarılı kod dönderdi ancak yanıt gerçek bir JSON değil (Cloudflare/HTML engeli), sonraki proxy deneniyor.");
              continue;
            }
          } catch (e) {
            console.warn("Proxy yanıt doğrulaması başarısız oldu, sonraki proxy deneniyor:", e);
            continue;
          }
        }

        // Eğer ikili (binary) bir dosya istiyorsak (resim/video) ve proxy bize HTML hata sayfası döndüyse bunu engelle
        if (!targetUrl.includes('output=json')) {
          const contentType = response.headers.get('content-type') || "";
          if (contentType.toLowerCase().includes('text/html') || contentType.toLowerCase().includes('text/plain')) {
            console.warn("Proxy ikili veri yerine HTML/Metin hata sayfası döndü, sonraki proxy deneniyor.");
            continue;
          }
          try {
            const clone = response.clone();
            const text = await clone.text();
            if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html') || text.trim().startsWith('<HTML')) {
              console.warn("Proxy ikili veri yerine HTML içeriği döndü, sonraki proxy deneniyor.");
              continue;
            }
          } catch (e) {
            // İkili veri okuma hatası normaldir, devam et
          }
        }

        return response;
      }
      console.warn(`Proxy başarısız oldu (Status: ${response.status})`);
    } catch (err) {
      console.warn("Proxy bağlantı hatası veya zaman aşımı:", err);
      lastError = err;
    }
  }
  throw lastError || new Error("Tüm CORS Proxy sunucuları başarısız oldu.");
}

// Görselleri tarayıcı tarafında dinamik olarak JPG formatına dönüştüren ve sıkıştıran yardımcı fonksiyon
async function compressAndConvertToJpg(blob, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((jpgBlob) => {
        if (jpgBlob) {
          resolve(jpgBlob);
        } else {
          reject(new Error("Canvas JPEG dışa aktarımı başarısız oldu."));
        }
      }, 'image/jpeg', quality);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// --- Offline & Online Scraper Engine ---
// --- Clean ROM filename to make a human-readable title search ---
function cleanTitleForSearch(filename) {
  // Remove extension
  let name = filename.substring(0, filename.lastIndexOf('.')) || filename;
  // Remove everything inside parentheses () and brackets []
  name = name.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '');
  
  // Strip common leading sorting prefixes:
  // 1. Digits followed by a dash (e.g., "01 - Sonic")
  // 2. Digits followed by a dot and space (e.g., "1. Mario")
  // 3. 3 or more digits followed by a space (e.g., "001 Pokemon")
  name = name.replace(/^\d+\s*-\s*/, '')
             .replace(/^\d+\.\s+/, '')
             .replace(/^\d{3,}\s+/, '');

  // Replace multiple spaces with a single space and trim
  return name.replace(/\s+/g, ' ').trim();
}

// --- Standard ScreenScraper Jeu Parser to form a Match Object ---
function parseScreenScraperJeu(jeu) {
  // A. Oyun Başlığı Çöz (Türkçe -> İngilizce -> Bölgesel -> Varsayılan)
  let title = selectedRom.title;
  if (jeu.noms && jeu.noms.length > 0) {
    const trName = jeu.noms.find(n => n && n.region && typeof n.region === 'string' && n.region.toLowerCase() === 'tr');
    const usName = jeu.noms.find(n => n && n.region && typeof n.region === 'string' && n.region.toLowerCase() === 'us');
    const euName = jeu.noms.find(n => n && n.region && typeof n.region === 'string' && n.region.toLowerCase() === 'eu');
    const ssName = jeu.noms.find(n => n && n.region && typeof n.region === 'string' && n.region.toLowerCase() === 'ss');
    const matchedNameObj = trName || usName || euName || ssName || jeu.noms[0];
    if (matchedNameObj && matchedNameObj.text) {
      title = matchedNameObj.text;
    }
  }

  // B. Açıklama Çöz (Türkçe -> İngilizce -> Varsayılan)
  let desc = "";
  if (jeu.synopsis && jeu.synopsis.length > 0) {
    const trDesc = jeu.synopsis.find(s => s && s.langue && typeof s.langue === 'string' && s.langue.toLowerCase() === 'tr');
    const enDesc = jeu.synopsis.find(s => s && s.langue && typeof s.langue === 'string' && s.langue.toLowerCase() === 'en');
    const matchedDesc = trDesc || enDesc || jeu.synopsis[0];
    if (matchedDesc && matchedDesc.text) {
      desc = matchedDesc.text;
    }
  }

  // C. Tür Çöz (Türkçe -> İngilizce -> Varsayılan)
  let genre = "Action / Retro";
  if (jeu.genres && jeu.genres.length > 0 && jeu.genres[0] && jeu.genres[0].noms) {
    const trGenre = jeu.genres[0].noms.find(n => n && n.langue && typeof n.langue === 'string' && n.langue.toLowerCase() === 'tr');
    const enGenre = jeu.genres[0].noms.find(n => n && n.langue && typeof n.langue === 'string' && n.langue.toLowerCase() === 'en');
    const matchedGenreObj = trGenre || enGenre || jeu.genres[0].noms[0];
    if (matchedGenreObj && matchedGenreObj.text) {
      genre = matchedGenreObj.text;
    }
  }

  // D. Yapımcı ve Yayıncı Çöz
  const developer = (jeu.developpeur && jeu.developpeur.text) ? jeu.developpeur.text : "Retro Dev";
  const publisher = (jeu.editeur && jeu.editeur.text) ? jeu.editeur.text : "Retro Classics";

  // E. Yayın Tarihi Çöz
  let releaseDate = "";
  if (jeu.dates && jeu.dates.length > 0) {
    const euDate = jeu.dates.find(d => d && d.region && typeof d.region === 'string' && d.region.toLowerCase() === 'eu');
    const usDate = jeu.dates.find(d => d && d.region && typeof d.region === 'string' && d.region.toLowerCase() === 'us');
    const matchedDateObj = euDate || usDate || jeu.dates[0];
    const rawDate = matchedDateObj ? matchedDateObj.text : "";
    if (rawDate && rawDate.length >= 4) {
      releaseDate = rawDate.includes('-') ? rawDate : `${rawDate}-01-01`;
    }
  }

  // F. Oyuncu Sayısı ve Puan Çöz
  let players = "1";
  if (jeu.joueurs) {
    if (typeof jeu.joueurs === 'object') {
      players = jeu.joueurs.text || jeu.joueurs.valeur || jeu.joueurs['#text'] || jeu.joueurs['@nb'] || "1";
    } else {
      players = jeu.joueurs.toString();
    }
  }

  let rating = "0.80";
  if (jeu.note && jeu.note.valeur) {
    rating = (parseFloat(jeu.note.valeur) / 20).toFixed(2); // 20 üzerinden puanı 0.0 - 1.0 aralığına normalize et
  } else if (jeu.note && jeu.note.text) {
    rating = (parseFloat(jeu.note.text) / 20).toFixed(2);
  }

  // G. Medya URL'leri Çöz (Kullanıcı Tercihli Kapak Görseli ve Video)
  let boxartUrl = "";
  let boxartFormat = "png";
  let videoUrl = "";
  let videoFormat = "mp4";
  
  if (jeu.medias && jeu.medias.length > 0) {
    const mediaPref = (currentProfile.scraper && currentProfile.scraper.mediaPref) || "mixrbv1";
    
    const preferredMedia = jeu.medias.find(m => m && m.type && typeof m.type === 'string' && m.type.toLowerCase() === mediaPref.toLowerCase());
    
    if (preferredMedia && preferredMedia.url) {
      boxartUrl = preferredMedia.url;
      boxartFormat = preferredMedia.format || "png";
    } else {
      const fallbackTypes = ['mixrbv1', 'mixrbv2', 'box-3d', 'box-2d', 'screenshot', 'logo'];
      for (const type of fallbackTypes) {
        const matched = jeu.medias.find(m => m && m.type && typeof m.type === 'string' && m.type.toLowerCase() === type);
        if (matched && matched.url) {
          boxartUrl = matched.url;
          boxartFormat = matched.format || "png";
          break;
        }
      }
      if (!boxartUrl) {
        const anyMedia = jeu.medias.find(m => m && m.type && typeof m.type === 'string' && m.type.toLowerCase() !== 'video' && m.url);
        if (anyMedia) {
          boxartUrl = anyMedia.url;
          boxartFormat = anyMedia.format || "png";
        }
      }
    }

    const vid = jeu.medias.find(m => m && m.type && typeof m.type === 'string' && m.type.toLowerCase() === 'video');
    if (vid && vid.url) {
      videoUrl = vid.url;
      videoFormat = vid.format || "mp4";
    }
  }

  return {
    id: `ss-${jeu.id || 'game'}`,
    title: title,
    system: activeConsole,
    developer: developer,
    publisher: publisher,
    releasedate: releaseDate,
    genre: genre,
    players: players,
    rating: rating,
    description: desc,
    image: boxartUrl || consoleData[activeConsole].config.defaultCart,
    imageFormat: boxartFormat,
    video: videoUrl,
    videoFormat: videoFormat
  };
}

// --- Offline & Online Scraper Engine ---
async function triggerOnlineScrape(forceOnline = false) {
  if (!selectedRom || !activeConsole) return;

  Logger.info(`Çevrimiçi/çevrimdışı scrape başlatıldı: ${selectedRom.filename}`);

  const btn = document.getElementById('btn-scrape-online');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `🌀 Scrape ediliyor...`;

  try {
    // 1. Önce dahili retro veritabanında ara (Dahili Hızlı Çevrimdışı Eşleştirme)
    let dbMatch = null;

    if (!forceOnline && typeof RETRO_GAME_DB !== 'undefined') {
      // Helper function for deep cleaning text to compare exactly without sequel collision
      const deepClean = (str) => {
        if (!str) return "";
        return str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();
      };

      const cleanedName = cleanTitleForSearch(selectedRom.filename);
      const deepCleanedFilename = deepClean(cleanedName);

      dbMatch = RETRO_GAME_DB.find(game => {
        const dbSystem = game.system;
        const targetSystem = activeConsole;
        const systemMatch = (dbSystem === targetSystem) || 
                            (dbSystem === 'megadrive' && targetSystem === 'genesis') ||
                            (dbSystem === 'genesis' && targetSystem === 'megadrive') ||
                            (dbSystem === 'snes' && targetSystem === 'sfc') ||
                            (dbSystem === 'sfc' && targetSystem === 'snes') ||
                            (dbSystem === 'nes' && targetSystem === 'fc') ||
                            (dbSystem === 'fc' && targetSystem === 'nes') ||
                            (dbSystem === 'msx' && targetSystem === 'msx2') ||
                            (dbSystem === 'msx2' && targetSystem === 'msx') ||
                            (dbSystem === 'wswan' && targetSystem === 'wsc') ||
                            (dbSystem === 'wsc' && targetSystem === 'wswan') ||
                            (dbSystem === 'psx' && targetSystem === 'ps1') ||
                            (dbSystem === 'ps1' && targetSystem === 'psx');
        if (!systemMatch) return false;

        // Exact match on deep-cleaned title or deep-cleaned keywords to avoid sequel collision
        const deepCleanedTitle = deepClean(game.title);
        const matchTitle = (deepCleanedFilename === deepCleanedTitle);
        const matchKeyword = game.filenameKeywords && game.filenameKeywords.some(kw => deepClean(kw) === deepCleanedFilename);

        return matchTitle || matchKeyword;
      });
    }

    // Eşleşme bulunduysa anında göster
    if (dbMatch) {
      Logger.success(`Çevrimdışı dahili veritabanında eşleşme bulundu: ${dbMatch.title}`);
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = originalText;
        presentScrapeMatches([dbMatch]);
      }, 600);
      return;
    }

    // 2. ScreenScraper API v2 Entegrasyonu
    const scraper = currentProfile.scraper;
    if (!scraper || !scraper.ssid || !scraper.sspassword) {
      alert("⚠️ ScreenScraper API'sini kullanabilmek için lütfen sol menüdeki 'Ayarları Düzenle' butonuna basarak 'SCRAPER HESAP AYARLARI' kısmından ScreenScraper.fr kullanıcı adı ve şifrenizi girin.\n\n(Ücretsiz üyelik alıp diskinizi sıfır hata ve tanıtım videolarıyla taratabilirsiniz!)");
      btn.disabled = false;
      btn.innerHTML = originalText;
      return;
    }

    const ssid = scraper.ssid;
    const sspassword = scraper.sspassword;
    const devid = scraper.devid || scraper.ssid || "retrotool";
    const devpassword = scraper.devpassword || scraper.sspassword || "devpwd";
    const systemId = getScreenScraperSystemId(activeConsole);

    // Adım A: Önce dosya adıyla tam eşleşme ara (jeuInfos.php)
    const targetUrl = `https://www.screenscraper.fr/api2/jeuInfos.php?devid=${devid}&devpassword=${devpassword}&softname=retromgr&ssid=${ssid}&sspassword=${sspassword}&output=json&systemeid=${systemId}&romnom=${encodeURIComponent(selectedRom.filename)}`;

    btn.innerHTML = `🔍 Sunucu Aranıyor...`;
    let response = null;
    let fallbackUsed = false;
    
    Logger.info("[Scraper] ScreenScraper tam dosya adı (romnom) sorgusu gönderiliyor...");
    try {
      response = await fetchWithCorsProxy(targetUrl);
    } catch (fetchErr) {
      console.warn("Exact romnom query failed/choked on proxy, will trigger search fallback...", fetchErr);
    }

    // Adım B: Eğer tam dosya adı bulunamadıysa (veya proxy hatası alındıysa), metin araması yap (jeuRecherche.php)
    if (!response || !response.ok) {
      const cleanQuery = cleanTitleForSearch(selectedRom.filename);
      Logger.warn(`[Scraper] Dosya adı tam eşleşmedi. Arama terimiyle sorgulanıyor: "${cleanQuery}"`);
      console.log(`[Scraper Fallback] "${selectedRom.filename}" tam eşleşmedi. Metinle aranıyor: "${cleanQuery}"`);
      const searchUrl = `https://www.screenscraper.fr/api2/jeuRecherche.php?devid=${devid}&devpassword=${devpassword}&softname=retromgr&ssid=${ssid}&sspassword=${sspassword}&output=json&recherche=${encodeURIComponent(cleanQuery)}`;
      
      btn.innerHTML = `🔍 Arama Yapılıyor...`;
      try {
        response = await fetchWithCorsProxy(searchUrl);
        fallbackUsed = true;
      } catch (fallbackErr) {
        Logger.error(`[Scraper] Metin araması da başarısız oldu: ${fallbackErr.message}`);
        console.error("Text search fallback also failed:", fallbackErr);
        throw new Error("ROM dosyası veya temizlenmiş ismi ScreenScraper sunucusunda bulunamadı.");
      }
    }

    if (response && response.ok) {
      const data = await response.json();
      
      // API Hatası Kontrolü (Kotanın aşılması veya hatalı kimlik)
      if (data.response && data.response.errcode) {
        const err = data.response.errcode;
        Logger.error(`[Scraper] ScreenScraper API hatası: Kod ${err}`);
        if (err === 1 || err === 2 || err === 3) {
          alert(`⚠️ ScreenScraper Kimlik Hatası: Girdiğiniz kullanıcı adı veya şifre yanlış!\n\nLütfen sol paneldeki profil ayarlarından hesap bilgilerinizi düzeltin.`);
        } else if (err === 17) {
          alert(`⚠️ ScreenScraper Kotası Aşıldı: Günlük sorgu limitinize ulaştınız ya da sunucu yoğun!`);
        } else {
          console.warn("ScreenScraper API hata kodu:", err);
          alert(`ScreenScraper hatası oluştu (Kod: ${err}). Arama yapılamadı.`);
        }
        btn.disabled = false;
        btn.innerHTML = originalText;
        return;
      }

      const matches = [];

      if (data.response && data.response.jeu) {
        // Tam dosya adı eşleştiyse tek oyunu ekle
        matches.push(parseScreenScraperJeu(data.response.jeu));
      } else if (data.response && data.response.jeux && Array.isArray(data.response.jeux)) {
        // Metin araması sonucu geldiyse (maksimum 6 sonucu parse et)
        const limitJeux = data.response.jeux.slice(0, 6);
        for (const jeu of limitJeux) {
          matches.push(parseScreenScraperJeu(jeu));
        }
      }

      if (matches.length > 0) {
        Logger.success(`[Scraper] Eşleşen kayıtlar bulundu. Aday sayısı: ${matches.length}`);
        btn.disabled = false;
        btn.innerHTML = originalText;
        presentScrapeMatches(matches);
        return;
      } else {
        Logger.warn("[Scraper] Eşleşen oyun kaydı bulunamadı.");
        alert("🔍 ScreenScraper veritabanında bu ROM dosyasına veya arama kelimesine ait hiçbir kayıt bulunamadı!");
      }
    } else {
      throw new Error("Sunucu bağlantı hatası veya geçersiz CORS Proxy yanıtı.");
    }
  } catch (err) {
    Logger.error(`[Scraper] İstek başarısız oldu: ${err.message || err}`);
    console.error("Online scraper hatası:", err);
    alert(`⚠️ İnternetten scrape etme isteği başarısız oldu!\n\nHata Detayı: ${err.message || err}\n\nLütfen internet bağlantınızı, CORS Proxy durumunu veya yerel PHP sunucunuzu kontrol edin.`);
  }

  btn.disabled = false;
  btn.innerHTML = originalText;
}

// --- Present Scrape Results in Modal Dialog ---
function presentScrapeMatches(matches) {
  const modal = document.getElementById('scrape-modal');
  const resultsContainer = document.getElementById('scrape-results-list');
  
  if (!modal || !resultsContainer) return;

  resultsContainer.innerHTML = '';

  // Check if this is an offline match (contains an id that does not start with 'ss-')
  const isOfflineMatch = matches.some(m => m.id && !m.id.startsWith('ss-'));

  if (isOfflineMatch) {
    // Add a beautiful info message about offline match with a force online search button
    const infoBox = document.createElement('div');
    infoBox.style = `
      background: rgba(255, 235, 59, 0.05);
      border: 1px solid rgba(255, 235, 59, 0.2);
      border-radius: 8px;
      padding: 15px;
      margin-bottom: 20px;
      font-size: 0.78rem;
      color: hsl(var(--retro-yellow));
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-family: var(--font-tech);
      letter-spacing: 0.5px;
      box-shadow: 0 0 10px rgba(255, 235, 95, 0.05);
    `;
    infoBox.innerHTML = `
      <div><strong>💡 HIZLI ÇEVRİMDIŞI EŞLEŞME:</strong> Bu oyun dahili çevrimdışı kütüphanemizde eşleşti. Eğer resmi 3D kapak görselleri, tanıtım videoları veya ScreenScraper veritabanından daha fazla canlı sonuç çekmek istiyorsanız aşağıdaki butona basabilirsiniz.</div>
      <button class="picker-btn" id="btn-force-online-scrape" style="background:rgba(0, 243, 255, 0.1); border-color:hsl(var(--retro-cyan)); color:hsl(var(--retro-cyan)); font-size:0.7rem; padding:8px 14px; font-weight:bold; cursor:pointer; width:100%; border-radius:4px; box-shadow:0 0 8px rgba(0,243,255,0.2)">
        🔍 ScreenScraper Üzerinde Canlı Ara
      </button>
    `;
    resultsContainer.appendChild(infoBox);

    // Bind event listener to force online search
    setTimeout(() => {
      const forceBtn = document.getElementById('btn-force-online-scrape');
      if (forceBtn) {
        forceBtn.addEventListener('click', async () => {
          modal.classList.remove('active');
          await triggerOnlineScrape(true);
        });
      }
    }, 50);
  }

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
      // Create and append dynamic loading overlay inside the modal container to prevent interactions
      const container = modal.querySelector('.modal-container');
      const loaderOverlay = document.createElement('div');
      loaderOverlay.className = 'modal-loader-overlay';
      loaderOverlay.style = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(13, 14, 21, 0.85);
        backdrop-filter: blur(5px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 100;
        border-radius: 12px;
      `;
      loaderOverlay.innerHTML = `
        <div class="retro-spinner"></div>
        <h4 style="color:hsl(var(--retro-cyan)); text-shadow:0 0 10px rgba(0,243,255,0.4); font-family:var(--font-tech); margin-top:0; margin-bottom:8px">Medya İndiriliyor</h4>
        <p style="color:#fff; font-size:0.75rem; text-align:center; padding:0 20px; margin:0; line-height:1.4">Görsel ve tanıtım videosu SD karta kaydediliyor, lütfen bekleyin...</p>
      `;
      if (container) container.appendChild(loaderOverlay);
      
      // Disable close button interactions during download
      const closeBtn = modal.querySelector('.close-modal-btn');
      if (closeBtn) closeBtn.style.pointerEvents = 'none';

      try {
        await applyScrapedGameMetadata(match);
      } catch (err) {
        console.error("Scrape metadata uygulama hatası:", err);
      } finally {
        // Cleanup loader, restore buttons, and close modal
        loaderOverlay.remove();
        if (closeBtn) closeBtn.style.pointerEvents = 'auto';
        modal.classList.remove('active');
      }
    });

    resultsContainer.appendChild(card);
  });

  // Open modal
  modal.classList.add('active');
}

// --- In-place update of the active game list item's thumbnail ---
function updateActiveListItemCover(imageSrc) {
  if (!imageSrc) return;
  const activeItem = document.querySelector('.rom-card.active, .rom-row-item.active');
  if (!activeItem) return;

  const imgEl = activeItem.querySelector('.boxart-img, .row-thumb');
  const wrapper = activeItem.querySelector('.boxart-wrapper, .row-icon-wrapper');
  const dot = activeItem.querySelector('.scraped-dot, .row-status-text');

  // Update scrape status badge
  if (dot) {
    if (dot.classList.contains('scraped-dot')) {
      dot.className = 'scraped-dot completed';
    } else {
      dot.className = 'row-status-text scraped';
      dot.innerHTML = '🟢 Kapak Yüklendi';
    }
  }

  // Update or restore cover image
  if (imgEl) {
    imgEl.src = imageSrc;
    imgEl.style.opacity = '1';
    imgEl.classList.remove('lazy-boxart', 'lazy-row-thumb');
  } else if (wrapper) {
    // If it was replaced by a cartridge placeholder, restore it
    if (activeItem.classList.contains('rom-card')) {
      wrapper.innerHTML = `<img class="boxart-img" src="${imageSrc}" alt="Kapak" style="opacity:1; width:100%; height:100%; object-fit:inherit">`;
    } else {
      wrapper.innerHTML = `<img class="row-thumb" src="${imageSrc}" alt="Kapak" style="opacity:1; width:100%; height:100%; object-fit:cover">`;
    }
  }
}

// --- Apply Scraped Metadata & Automatically Download & Write Cover Art and Videos to SD Card ---
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

  const system = consoleData[activeConsole];
  const romBaseName = selectedRom.filename.substring(0, selectedRom.filename.lastIndexOf('.')) || selectedRom.filename;
  const safeTitle = romBaseName.replace(/[\/:*?"<>|]/g, '_');

  // 1. Download and save the cover image blob directly into the SD card!
  let imgWrittenSuccessfully = false;
  let localImgPath = "";

  if (scraped.image && !scraped.image.includes('unsplash.com') && scraped.image !== system.config.defaultCart) {
    try {
      // Download the image using a CORS-safe proxy fetch
      const imgResponse = await fetchWithCorsProxy(scraped.image);
      if (imgResponse.ok) {
        let imageBlob = await imgResponse.blob();
        
        let imagesHandle = null;
        let imgExt = scraped.imageFormat || "png";
        if (!scraped.imageFormat && scraped.image) {
          const parsedExt = scraped.image.split('.').pop().split('?')[0];
          if (parsedExt && parsedExt.length <= 4 && parsedExt.toLowerCase() !== 'php') {
            imgExt = parsedExt.toLowerCase();
          }
        }

        if (currentProfile.scraper && currentProfile.scraper.compress === true) {
          try {
            console.log("Kapak resmi sıkıştırma aktif, JPG formatına sıkıştırılıyor...");
            const compressedBlob = await compressAndConvertToJpg(imageBlob, 0.75);
            imageBlob = compressedBlob;
            imgExt = "jpg";
          } catch (compressErr) {
            console.warn("Görsel sıkıştırılamadı, orijinal formatta devam ediliyor:", compressErr);
          }
        }

        const imgFilename = `${safeTitle}.${imgExt}`;

        if (currentProfile.paths.imagesLoc === 'root-separate') {
          // Save in root/Imgs/<sys>/
          const cleanImgRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
          const imgsRootHandle = await sdCardHandle.getDirectoryHandle(cleanImgRoot, { create: true });
          imagesHandle = await imgsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: true });
          localImgPath = `/${cleanImgRoot}/${getSystemFolderName(system)}/${imgFilename}`;
        } else {
          // standard subfolder - resolve dynamically using imagesRoot
          const imgDirName = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
          const pathParts = imgDirName.split('/');
          let currentHandle = system.dirHandle;
          for (const part of pathParts) {
            if (part) {
              currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
            }
          }
          imagesHandle = currentHandle;
          localImgPath = `./${imgDirName}/${imgFilename}`;
        }

        const fileHandle = await imagesHandle.getFileHandle(imgFilename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(imageBlob);
        await writable.close();

        // Update local object URL and XML paths
        selectedRom.image = URL.createObjectURL(imageBlob);
        selectedRom.localImagePath = localImgPath;
        imgWrittenSuccessfully = true;
        console.log(`Görsel başarıyla kaydedildi: ${localImgPath}`);
      }
    } catch (err) {
      console.warn("Kapak resmi SD karta yazılamadı (CORS veya disk izni):", err);
    }
  }

  // If download failed or was skipped, use original matched image URL
  if (!imgWrittenSuccessfully && scraped.image) {
    selectedRom.image = scraped.image;
  }

  // Update active list item cover art in real time in DOM
  updateActiveListItemCover(selectedRom.image);

  // 2. Download and save the game introduction video directly into the SD card!
  let videoWrittenSuccessfully = false;
  let localVideoPath = "";

  if (scraped.video) {
    try {
      saveBtn.innerHTML = `💾 Video İndiriliyor...`;
      // Download the video using CORS proxy fetch
      const vidResponse = await fetchWithCorsProxy(scraped.video);
      if (vidResponse.ok) {
        const videoBlob = await vidResponse.blob();
        
        let videosHandle = null;
        let vidExt = scraped.videoFormat || "mp4";
        if (!scraped.videoFormat && scraped.video) {
          const parsedExt = scraped.video.split('.').pop().split('?')[0];
          if (parsedExt && parsedExt.length <= 4 && parsedExt.toLowerCase() !== 'php') {
            vidExt = parsedExt.toLowerCase();
          }
        }
        const vidFilename = `${safeTitle}.${vidExt}`;

        if (currentProfile.paths.imagesLoc === 'root-separate') {
          // Save in root/Videos/<sys>/
          const cleanVidRoot = (currentProfile.paths.videosRoot || "Videos").replace(/^\//, '').replace(/\/$/, '');
          const vidsRootHandle = await sdCardHandle.getDirectoryHandle(cleanVidRoot, { create: true });
          videosHandle = await vidsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: true });
          localVideoPath = `/${cleanVidRoot}/${getSystemFolderName(system)}/${vidFilename}`;
        } else {
          // standard subfolder - resolve dynamically using videosRoot
          const vidDirName = (currentProfile.paths.videosRoot || "videos").replace(/^\.\//, '').replace(/\/$/, '');
          const pathParts = vidDirName.split('/');
          let currentHandle = system.dirHandle;
          for (const part of pathParts) {
            if (part) {
              currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
            }
          }
          videosHandle = currentHandle;
          localVideoPath = `./${vidDirName}/${vidFilename}`;
        }

        const fileHandle = await videosHandle.getFileHandle(vidFilename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(videoBlob);
        await writable.close();

        // Update local video path
        selectedRom.video = localVideoPath;
        videoWrittenSuccessfully = true;
        console.log(`Video başarıyla kaydedildi: ${localVideoPath}`);
      }
    } catch (err) {
      console.warn("Video SD karta yazılamadı:", err);
    }
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
  saveBtn.innerHTML = `💾 Kaydediliyor...`;
  if (currentProfile.metadataStorage === 'sqlite') {
    await writeSqliteDBFile(system);
    showToast("Oyun bilgileri internetten çekildi ve veritabanı güncellendi!", 'success');
  } else {
    await writeGamelistXMLFile(system);
    showToast("Oyun bilgileri internetten çekildi ve gamelist.xml güncellendi!", 'success');
  }
  
  renderActiveGames();

  // Reset button state
  saveBtn.disabled = false;
  saveBtn.innerHTML = originalText;
}

// ==========================================================================
// v1.7.0 TOPLU SCRAPE (BULK SCRAPER) ENGINE
// ==========================================================================

function parseScreenScraperJeuBulk(jeu, game) {
  // Oyun Başlığı Çöz
  let title = game.title || game.filename.substring(0, game.filename.lastIndexOf('.')) || game.filename;
  if (jeu.noms && jeu.noms.length > 0) {
    const trName = jeu.noms.find(n => n && n.region && typeof n.region === 'string' && n.region.toLowerCase() === 'tr');
    const usName = jeu.noms.find(n => n && n.region && typeof n.region === 'string' && n.region.toLowerCase() === 'us');
    const euName = jeu.noms.find(n => n && n.region && typeof n.region === 'string' && n.region.toLowerCase() === 'eu');
    const ssName = jeu.noms.find(n => n && n.region && typeof n.region === 'string' && n.region.toLowerCase() === 'ss');
    const matchedNameObj = trName || usName || euName || ssName || jeu.noms[0];
    if (matchedNameObj && matchedNameObj.text) {
      title = matchedNameObj.text;
    }
  }

  // Açıklama Çöz
  let desc = "";
  if (jeu.synopsis && jeu.synopsis.length > 0) {
    const trDesc = jeu.synopsis.find(s => s && s.langue && typeof s.langue === 'string' && s.langue.toLowerCase() === 'tr');
    const enDesc = jeu.synopsis.find(s => s && s.langue && typeof s.langue === 'string' && s.langue.toLowerCase() === 'en');
    const matchedDesc = trDesc || enDesc || jeu.synopsis[0];
    if (matchedDesc && matchedDesc.text) {
      desc = matchedDesc.text;
    }
  }

  // Tür Çöz
  let genre = "Action / Retro";
  if (jeu.genres && jeu.genres.length > 0 && jeu.genres[0] && jeu.genres[0].noms) {
    const trGenre = jeu.genres[0].noms.find(n => n && n.langue && typeof n.langue === 'string' && n.langue.toLowerCase() === 'tr');
    const enGenre = jeu.genres[0].noms.find(n => n && n.langue && typeof n.langue === 'string' && n.langue.toLowerCase() === 'en');
    const matchedGenreObj = trGenre || enGenre || jeu.genres[0].noms[0];
    if (matchedGenreObj && matchedGenreObj.text) {
      genre = matchedGenreObj.text;
    }
  }

  // Yapımcı ve Yayıncı
  const developer = (jeu.developpeur && jeu.developpeur.text) ? jeu.developpeur.text : "Retro Dev";
  const publisher = (jeu.editeur && jeu.editeur.text) ? jeu.editeur.text : "Retro Classics";

  // Yayın Tarihi
  let releaseDate = "";
  if (jeu.dates && jeu.dates.length > 0) {
    const euDate = jeu.dates.find(d => d && d.region && typeof d.region === 'string' && d.region.toLowerCase() === 'eu');
    const usDate = jeu.dates.find(d => d && d.region && typeof d.region === 'string' && d.region.toLowerCase() === 'us');
    const matchedDateObj = euDate || usDate || jeu.dates[0];
    const rawDate = matchedDateObj ? matchedDateObj.text : "";
    if (rawDate && rawDate.length >= 4) {
      releaseDate = rawDate.includes('-') ? rawDate : `${rawDate}-01-01`;
    }
  }

  // Oyuncu Sayısı ve Puan
  let players = "1";
  if (jeu.joueurs) {
    if (typeof jeu.joueurs === 'object') {
      players = jeu.joueurs.text || jeu.joueurs.valeur || jeu.joueurs['#text'] || jeu.joueurs['@nb'] || "1";
    } else {
      players = jeu.joueurs.toString();
    }
  }

  let rating = "0.80";
  if (jeu.note && jeu.note.valeur) {
    rating = (parseFloat(jeu.note.valeur) / 20).toFixed(2);
  } else if (jeu.note && jeu.note.text) {
    rating = (parseFloat(jeu.note.text) / 20).toFixed(2);
  }

  // Medya URL'leri Çöz
  let boxartUrl = "";
  let boxartFormat = "png";
  let videoUrl = "";
  let videoFormat = "mp4";
  
  if (jeu.medias && jeu.medias.length > 0) {
    const mediaPref = (currentProfile.scraper && currentProfile.scraper.mediaPref) || "mixrbv1";
    const preferredMedia = jeu.medias.find(m => m && m.type && typeof m.type === 'string' && m.type.toLowerCase() === mediaPref.toLowerCase());
    
    if (preferredMedia && preferredMedia.url) {
      boxartUrl = preferredMedia.url;
      boxartFormat = preferredMedia.format || "png";
    } else {
      const fallbackTypes = ['mixrbv1', 'mixrbv2', 'box-3d', 'box-2d', 'screenshot', 'logo'];
      for (const type of fallbackTypes) {
        const matched = jeu.medias.find(m => m && m.type && typeof m.type === 'string' && m.type.toLowerCase() === type);
        if (matched && matched.url) {
          boxartUrl = matched.url;
          boxartFormat = matched.format || "png";
          break;
        }
      }
      if (!boxartUrl) {
        const anyMedia = jeu.medias.find(m => m && m.type && typeof m.type === 'string' && m.type.toLowerCase() !== 'video' && m.url);
        if (anyMedia) {
          boxartUrl = anyMedia.url;
          boxartFormat = anyMedia.format || "png";
        }
      }
    }

    const vid = jeu.medias.find(m => m && m.type && typeof m.type === 'string' && m.type.toLowerCase() === 'video');
    if (vid && vid.url) {
      videoUrl = vid.url;
      videoFormat = vid.format || "mp4";
    }
  }

  return {
    id: `ss-${jeu.id || 'game'}`,
    title: title,
    system: activeConsole,
    developer: developer,
    publisher: publisher,
    releasedate: releaseDate,
    genre: genre,
    players: players,
    rating: rating,
    description: desc,
    image: boxartUrl || consoleData[activeConsole].config.defaultCart,
    imageFormat: boxartFormat,
    video: videoUrl,
    videoFormat: videoFormat
  };
}

async function saveSystemDatabaseSilent() {
  const system = consoleData[activeConsole];
  if (!system) return;
  try {
    if (currentProfile.metadataStorage === 'sqlite') {
      await writeSqliteDBFile(system);
    } else {
      await writeGamelistXMLFile(system);
    }
    console.log("Toplu tarama: Veritabanı diske güvenle kaydedildi.");
  } catch (err) {
    console.error("Toplu tarama: Veritabanı kaydetme hatası:", err);
  }
}

async function processSingleRomSilent(game) {
  try {
    // 1. Önce dahili retro veritabanında ara (Dahili Hızlı Çevrimdışı Eşleştirme)
    let dbMatch = null;
    const deepClean = (str) => {
      if (!str) return "";
      return str.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();
    };

    const cleanedName = cleanTitleForSearch(game.filename);
    const deepCleanedFilename = deepClean(cleanedName);

    if (typeof RETRO_GAME_DB !== 'undefined') {
      dbMatch = RETRO_GAME_DB.find(dbG => {
        const dbSystem = dbG.system;
        const targetSystem = activeConsole;
        const systemMatch = (dbSystem === targetSystem) || 
                            (dbSystem === 'megadrive' && targetSystem === 'genesis') ||
                            (dbSystem === 'genesis' && targetSystem === 'megadrive') ||
                            (dbSystem === 'snes' && targetSystem === 'sfc') ||
                            (dbSystem === 'sfc' && targetSystem === 'snes') ||
                            (dbSystem === 'nes' && targetSystem === 'fc') ||
                            (dbSystem === 'fc' && targetSystem === 'nes') ||
                            (dbSystem === 'msx' && targetSystem === 'msx2') ||
                            (dbSystem === 'msx2' && targetSystem === 'msx') ||
                            (dbSystem === 'wswan' && targetSystem === 'wsc') ||
                            (dbSystem === 'wsc' && targetSystem === 'wswan') ||
                            (dbSystem === 'psx' && targetSystem === 'ps1') ||
                            (dbSystem === 'ps1' && targetSystem === 'psx');
        if (!systemMatch) return false;

        const deepCleanedTitle = deepClean(dbG.title);
        const matchTitle = (deepCleanedFilename === deepCleanedTitle);
        const matchKeyword = dbG.filenameKeywords && dbG.filenameKeywords.some(kw => deepClean(kw) === deepCleanedFilename);

        return matchTitle || matchKeyword;
      });
    }

    let match = null;
    if (dbMatch) {
      match = dbMatch;
      console.log(`[Toplu Scrape] Dahili DB Eşleşti: ${game.filename} -> ${dbMatch.title}`);
    } else {
      // 2. ScreenScraper API
      const scraper = currentProfile.scraper;
      if (!scraper || !scraper.ssid || !scraper.sspassword) {
        throw new Error("Hesap bilgileri eksik");
      }

      const ssid = scraper.ssid;
      const sspassword = scraper.sspassword;
      const devid = scraper.devid || scraper.ssid || "retrotool";
      const devpassword = scraper.devpassword || scraper.sspassword || "devpwd";
      const systemId = getScreenScraperSystemId(activeConsole);

      // Adım A: Dosya adıyla tam eşleşme ara
      const targetUrl = `https://www.screenscraper.fr/api2/jeuInfos.php?devid=${devid}&devpassword=${devpassword}&softname=retromgr&ssid=${ssid}&sspassword=${sspassword}&output=json&systemeid=${systemId}&romnom=${encodeURIComponent(game.filename)}`;

      let response = null;
      try {
        response = await fetchWithCorsProxy(targetUrl);
      } catch (e) {
        console.warn("[Toplu Scrape] Tam eşleşme proxy hatası, metinle aranacak...");
      }

      // Adım B: Bulunamazsa metin araması yap
      if (!response || !response.ok) {
        const cleanQuery = cleanTitleForSearch(game.filename);
        const searchUrl = `https://www.screenscraper.fr/api2/jeuRecherche.php?devid=${devid}&devpassword=${devpassword}&softname=retromgr&ssid=${ssid}&sspassword=${sspassword}&output=json&recherche=${encodeURIComponent(cleanQuery)}`;
        response = await fetchWithCorsProxy(searchUrl);
      }

      if (response && response.ok) {
        const data = await response.json();
        if (data.response && data.response.errcode) {
          const code = data.response.errcode;
          if (code === 17) throw new Error("API Kotası Aşıldı");
          throw new Error(`API Hatası (Kod: ${code})`);
        }

        if (data.response && data.response.jeu) {
          match = parseScreenScraperJeuBulk(data.response.jeu, game);
        } else if (data.response && data.response.jeux && Array.isArray(data.response.jeux) && data.response.jeux.length > 0) {
          match = parseScreenScraperJeuBulk(data.response.jeux[0], game);
        }
      }
    }

    if (match) {
      // Bulunan metadataları nesneye kaydet
      game.title = match.title;
      game.developer = match.developer;
      game.publisher = match.publisher;
      game.genre = match.genre;
      game.releasedate = match.releasedate;
      game.rating = match.rating;
      game.players = match.players;
      game.description = match.description;

      const system = consoleData[activeConsole];
      const romBaseName = game.filename.substring(0, game.filename.lastIndexOf('.')) || game.filename;
      const safeTitle = romBaseName.replace(/[\/:*?"<>|]/g, '_');

      // Kapak görselini indir ve SD karta yaz
      let imgWritten = false;
      let localImgPath = "";

      if (match.image && !match.image.includes('unsplash.com') && match.image !== system.config.defaultCart) {
        try {
          const imgResponse = await fetchWithCorsProxy(match.image);
          if (imgResponse.ok) {
            let imageBlob = await imgResponse.blob();
            let imagesHandle = null;
            let imgExt = match.imageFormat || "png";
            if (!match.imageFormat && match.image) {
              const parsedExt = match.image.split('.').pop().split('?')[0];
              if (parsedExt && parsedExt.length <= 4 && parsedExt.toLowerCase() !== 'php') {
                imgExt = parsedExt.toLowerCase();
              }
            }

            if (currentProfile.scraper && currentProfile.scraper.compress === true) {
              try {
                console.log("Kapak resmi sıkıştırma aktif, JPG formatına sıkıştırılıyor...");
                const compressedBlob = await compressAndConvertToJpg(imageBlob, 0.75);
                imageBlob = compressedBlob;
                imgExt = "jpg";
              } catch (compressErr) {
                console.warn("Görsel sıkıştırılamadı, orijinal formatta devam ediliyor:", compressErr);
              }
            }

            const imgFilename = `${safeTitle}.${imgExt}`;

            if (currentProfile.paths.imagesLoc === 'root-separate') {
              const cleanImgRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
              const imgsRootHandle = await sdCardHandle.getDirectoryHandle(cleanImgRoot, { create: true });
              imagesHandle = await imgsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: true });
              localImgPath = `/${cleanImgRoot}/${getSystemFolderName(system)}/${imgFilename}`;
            } else {
              const imgDirName = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
              const pathParts = imgDirName.split('/');
              let currentHandle = system.dirHandle;
              for (const part of pathParts) {
                if (part) currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
              }
              imagesHandle = currentHandle;
              localImgPath = `./${imgDirName}/${imgFilename}`;
            }

            const fileHandle = await imagesHandle.getFileHandle(imgFilename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(imageBlob);
            await writable.close();

            game.image = URL.createObjectURL(imageBlob);
            game.localImagePath = localImgPath;
            imgWritten = true;
          }
        } catch (imgErr) {
          console.warn(`[Toplu Scrape] Görsel indirme başarısız (${game.filename}):`, imgErr);
        }
      }

      if (!imgWritten && match.image) {
        game.image = match.image;
      }

      // Videoyu indir ve SD karta yaz (Eğer video varsa)
      if (match.video) {
        try {
          const vidResponse = await fetchWithCorsProxy(match.video);
          if (vidResponse.ok) {
            const videoBlob = await vidResponse.blob();
            let videosHandle = null;
            let vidExt = match.videoFormat || "mp4";
            if (!match.videoFormat && match.video) {
              const parsedExt = match.video.split('.').pop().split('?')[0];
              if (parsedExt && parsedExt.length <= 4 && parsedExt.toLowerCase() !== 'php') {
                vidExt = parsedExt.toLowerCase();
              }
            }
            const vidFilename = `${safeTitle}.${vidExt}`;

            if (currentProfile.paths.imagesLoc === 'root-separate') {
              const cleanVidRoot = (currentProfile.paths.videosRoot || "Videos").replace(/^\//, '').replace(/\/$/, '');
              const vidsRootHandle = await sdCardHandle.getDirectoryHandle(cleanVidRoot, { create: true });
              videosHandle = await vidsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: true });
              localVideoPath = `/${cleanVidRoot}/${getSystemFolderName(system)}/${vidFilename}`;
            } else {
              const vidDirName = (currentProfile.paths.videosRoot || "videos").replace(/^\.\//, '').replace(/\/$/, '');
              const pathParts = vidDirName.split('/');
              let currentHandle = system.dirHandle;
              for (const part of pathParts) {
                if (part) currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
              }
              videosHandle = currentHandle;
              localVideoPath = `./${vidDirName}/${vidFilename}`;
            }

            const fileHandle = await videosHandle.getFileHandle(vidFilename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(videoBlob);
            await writable.close();

            game.video = localVideoPath;
          }
        } catch (vidErr) {
          console.warn(`[Toplu Scrape] Video indirme başarısız (${game.filename}):`, vidErr);
        }
      }

      return { success: true };
    } else {
      return { success: false, error: "Eşleşme bulunamadı" };
    }

  } catch (err) {
    console.error(`[Toplu Scrape] İşlem hatası (${game.filename}):`, err);
    return { success: false, error: err.message || "Bilinmeyen Hata" };
  }
}

function startBulkScrape(games) {
  const scraper = currentProfile.scraper;
  if (!scraper || !scraper.ssid || !scraper.sspassword) {
    alert("⚠️ ScreenScraper API'sini kullanabilmek için lütfen sol menüdeki 'Ayarları Düzenle' butonuna basarak 'SCRAPER HESAP AYARLARI' kısmından ScreenScraper.fr kullanıcı adı ve şifrenizi girin.");
    return;
  }

  Logger.info(`Toplu tarama işlemi başlatılıyor. Toplam oyun adedi: ${games.length}`);

  // Prepares state
  bulkQueue = games;
  bulkActiveIndex = 0;
  bulkSuccessCount = 0;
  bulkFailedCount = 0;
  isBulkCancelled = false;
  isBulkRunning = true;

  // Disable buttons in the bulk action bar during scrape
  const btnDelete = document.getElementById('btn-bulk-delete');
  const btnScrape = document.getElementById('btn-bulk-scrape-selected');
  const btnSelectAll = document.getElementById('btn-bulk-select-all');
  const btnDeselect = document.getElementById('btn-bulk-deselect');
  if (btnDelete) btnDelete.disabled = true;
  if (btnScrape) btnScrape.disabled = true;
  if (btnSelectAll) btnSelectAll.disabled = true;
  if (btnDeselect) btnDeselect.disabled = true;

  // Show fullscreen modal
  const modal = document.getElementById('bulk-scrape-modal');
  if (modal) modal.style.display = 'flex';

  // Modal controls init
  const cancelBtn = document.getElementById('btn-bulk-cancel');
  const closeBtn = document.getElementById('btn-bulk-close');
  if (cancelBtn) {
    cancelBtn.style.display = 'block';
    cancelBtn.disabled = false;
    cancelBtn.innerHTML = `🛑 İşlemi İptal Et`;
  }
  if (closeBtn) closeBtn.style.display = 'none';

  // Initialize stats in UI
  document.getElementById('bulk-stat-total').innerText = games.length;
  document.getElementById('bulk-stat-success').innerText = 0;
  document.getElementById('bulk-stat-failed').innerText = 0;
  document.getElementById('bulk-stat-remaining').innerText = games.length;
  document.getElementById('bulk-progress-fill').style.width = '0%';
  document.getElementById('bulk-progress-percent').innerText = '0%';
  document.getElementById('bulk-active-title').innerText = "Hazırlanıyor, kuyruk sıraya diziliyor...";

  // Render list queue
  const listContainer = document.getElementById('bulk-scrape-list');
  if (listContainer) {
    listContainer.innerHTML = '';
    games.forEach((game, idx) => {
      const item = document.createElement('div');
      item.className = 'bulk-queue-item status-pending';
      item.id = `bulk-item-${idx}`;
      item.innerHTML = `
        <span class="bulk-item-name" title="${game.filename}">${game.filename}</span>
        <span class="bulk-item-status-badge">Bekliyor</span>
      `;
      listContainer.appendChild(item);
    });
  }

  // Run the loop asynchronously
  setTimeout(runBulkScrapeQueue, 500);
}

async function runBulkScrapeQueue() {
  const cancelBtn = document.getElementById('btn-bulk-cancel');
  const closeBtn = document.getElementById('btn-bulk-close');

  for (let i = 0; i < bulkQueue.length; i++) {
    if (isBulkCancelled) {
      break;
    }

    bulkActiveIndex = i;
    const game = bulkQueue[i];

    // Update UI Stats
    document.getElementById('bulk-stat-remaining').innerText = bulkQueue.length - i;
    const percent = Math.round((i / bulkQueue.length) * 100);
    document.getElementById('bulk-progress-fill').style.width = `${percent}%`;
    document.getElementById('bulk-progress-percent').innerText = `${percent}%`;
    document.getElementById('bulk-active-title').innerText = `🔍 Taranıyor: ${game.filename}`;
    Logger.info(`[Toplu Scrape] [${i+1}/${bulkQueue.length}] "${game.filename}" sorgulanıyor...`);

    // Get Row element
    const rowEl = document.getElementById(`bulk-item-${i}`);
    if (rowEl) {
      rowEl.className = 'bulk-queue-item status-active';
      const badge = rowEl.querySelector('.bulk-item-status-badge');
      if (badge) badge.innerText = 'Aktif';
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Call scrape action
    const result = await processSingleRomSilent(game);

    if (result.success) {
      bulkSuccessCount++;
      Logger.success(`[Toplu Scrape] Eşleşme başarılı: "${game.title}"`);
      document.getElementById('bulk-stat-success').innerText = bulkSuccessCount;
      if (rowEl) {
        rowEl.className = 'bulk-queue-item status-success';
        const badge = rowEl.querySelector('.bulk-item-status-badge');
        if (badge) badge.innerText = 'Başarılı';
      }

      // Batch save database every 10 successful scrapes
      if (bulkSuccessCount % 10 === 0) {
        await saveSystemDatabaseSilent();
      }
    } else {
      bulkFailedCount++;
      Logger.warn(`[Toplu Scrape] Eşleşme başarısız veya atlandı: "${game.filename}" (Hata: ${result.error || 'Uyumlu eşleşme bulunamadı'})`);
      document.getElementById('bulk-stat-failed').innerText = bulkFailedCount;
      if (rowEl) {
        rowEl.className = 'bulk-queue-item status-failed';
        const badge = rowEl.querySelector('.bulk-item-status-badge');
        if (badge) badge.innerText = result.error || 'Atlandı';
        rowEl.title = `Başarısız: ${result.error || 'Uyumlu eşleşme bulunamadı'}`;
      }
    }

    // Politely wait for 400ms to avoid overwhelming public proxies and ScreenScraper API
    await new Promise(resolve => setTimeout(resolve, 400));
  }

  // Final database write
  await saveSystemDatabaseSilent();

  // Finalize UI State
  isBulkRunning = false;
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (closeBtn) closeBtn.style.display = 'block';

  // Set 100% on progress bar
  document.getElementById('bulk-progress-fill').style.width = '100%';
  document.getElementById('bulk-progress-percent').innerText = '100%';
  document.getElementById('bulk-stat-remaining').innerText = 0;

  if (isBulkCancelled) {
    Logger.warn(`[Toplu Scrape] Kullanıcı tarafından iptal edildi! (${bulkSuccessCount} başarılı, ${bulkFailedCount} başarısız)`);
    document.getElementById('bulk-active-title').innerText = `🛑 Toplu tarama kullanıcı tarafından iptal edildi! (${bulkSuccessCount} başarılı, ${bulkFailedCount} başarısız)`;
    showToast("Toplu tarama iptal edildi. İndirilenler kaydedildi!", "warning");
  } else {
    Logger.success(`[Toplu Scrape] Tamamlandı! (${bulkSuccessCount} başarılı, ${bulkFailedCount} başarısız)`);
    document.getElementById('bulk-active-title').innerText = `✨ Toplu tarama başarıyla tamamlandı! (${bulkSuccessCount} başarılı, ${bulkFailedCount} başarısız)`;
    showToast("Toplu tarama işlemi başarıyla tamamlandı!", "success");
  }

  // Reset selected ROMs
  selectedRomsBulk = [];
  updateBulkActionBarUI();
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
    const romBaseName = selectedRom.filename.substring(0, selectedRom.filename.lastIndexOf('.')) || selectedRom.filename;
    const safeTitle = romBaseName.replace(/[\/:*?"<>|]/g, '_');
    const imgFilename = `${safeTitle}.${ext}`;
    let localImgPath = "";

    if (currentProfile.paths.imagesLoc === 'root-separate') {
      // Save in root/Imgs/<sys>/
      const cleanImgRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
      const imgsRootHandle = await sdCardHandle.getDirectoryHandle(cleanImgRoot, { create: true });
      imagesHandle = await imgsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: true });
      localImgPath = `/${cleanImgRoot}/${getSystemFolderName(system)}/${imgFilename}`;
    } else {
      // standard subfolder - resolve dynamically using imagesRoot
      const imgDirName = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
      const pathParts = imgDirName.split('/');
      let currentHandle = system.dirHandle;
      for (const part of pathParts) {
        if (part) {
          currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
        }
      }
      imagesHandle = currentHandle;
      localImgPath = `./${imgDirName}/${imgFilename}`;
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

    // Update active list item cover art in real time in DOM
    updateActiveListItemCover(selectedRom.image);

    // Write metadata
    if (currentProfile.metadataStorage === 'sqlite') {
      await writeSqliteDBFile(system);
    } else {
      await writeGamelistXMLFile(system);
    }
    renderActiveGames();
    showToast("Kapak resmi başarıyla değiştirildi ve kaydedildi!", 'success');

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

  // Close dropzone on click (Cancel action)
  dropzone.addEventListener('click', () => {
    dropzone.classList.remove('active');
  });

  // Close dropzone on Escape keypress
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropzone.classList.remove('active');
    }
  });

  // Remove dropzone on dragend
  window.addEventListener('dragend', () => {
    dropzone.classList.remove('active');
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

          await tryAutoDetectLocalImage(system, newGame);
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
      showToast(`${addedCount} adet yeni ROM dosyası başarıyla SD kartınızdaki ${system.config.displayName} klasörüne kopyalandı!`, 'success');
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
        showToast(`🎉 Şema başarıyla algılandı!\nTablo: "${selectedTable}"\nBulunan Sütunlar: ${columns.join(', ')}`, 'success');
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
  
  Logger.info(`SQLite veritabanı yükleniyor: ${system.config.displayName} (${dbFilename})...`);

  try {
    dbFileHandle = await dirHandle.getFileHandle(dbFilename, { create: false });
    const file = await dbFileHandle.getFile();
    arrayBuffer = await file.arrayBuffer();
    Logger.success(`Mevcut SQLite veritabanı bulundu ve yüklendi: ${dbFilename}`);
    console.log(`Mevcut SQLite veritabanı bulundu ve yüklendi: ${dbFilename}`);
  } catch (err) {
    Logger.info(`Veritabanı dosyası (${dbFilename}) bulunamadı. Yeni bir tane oluşturuluyor.`);
    console.log(`Veritabanı dosyası (${dbFilename}) bulunamadı. Yeni bir tane oluşturuluyor.`);
  }
  
  let db = null;
  const dbConfig = currentProfile.sqliteConfig;
  const cols = dbConfig.columns;
  const tableName = (dbConfig.tableName || "roms")
    .replace(/{SYSTEM}/g, sysFolder)
    .replace(/{system}/g, sysId);
  
  if (arrayBuffer) {
    try {
      db = new window.SQL.Database(new Uint8Array(arrayBuffer));
    } catch (parseErr) {
      Logger.error(`Veritabanı ayrıştırılamadı, yeni bir tane oluşturuluyor: ${parseErr.message}`);
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
    Logger.success(`Yeni SQLite veritabanı ve "${tableName}" tablosu başarıyla oluşturuldu.`);
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
          // Bypassed during initial scan for instant performance (lazy loaded in UI)
        }
      }
    }
  } catch (readErr) {
    console.error("Veritabanı kayıtları okunurken hata oluştu:", readErr);
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
  const sysId = system.config.id;
  const sysFolder = system.dirHandle.name;
  const tableName = (dbConfig.tableName || "roms")
    .replace(/{SYSTEM}/g, sysFolder)
    .replace(/{system}/g, sysId);

  const pattern = dbConfig.pattern || "{SYSTEM}_cache7.db";
  const dbFilename = pattern.replace(/{SYSTEM}/g, sysFolder).replace(/{system}/g, sysId);
  const dirHandle = system.dirHandle;
  
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
    if (localPath) {
      if (currentProfile.paths.imagesLoc === 'root-separate') {
        const cleanRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
        const filename = localPath.split('/').pop();
        localPath = `/${cleanRoot}/${getSystemFolderName(system)}/${filename}`;
      } else {
        const cleanRoot = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
        const filename = localPath.split('/').pop();
        localPath = `./${cleanRoot}/${filename}`;
      }
      game.localImagePath = localPath;
    } else if (game.image && game.image.startsWith('blob:')) {
      const safeTitle = game.title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      if (currentProfile.paths.imagesLoc === 'root-separate') {
        const cleanRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
        localPath = `/${cleanRoot}/${getSystemFolderName(system)}/${safeTitle}.png`;
      } else {
        const cleanRoot = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
        localPath = `./${cleanRoot}/${safeTitle}.png`;
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
  
  Logger.info(`SQLite veritabanı diske yazılıyor: ${dbFilename}`);
  try {
    try {
      const origFileHandle = await dirHandle.getFileHandle(dbFilename, { create: false });
      const origFile = await origFileHandle.getFile();
      
      const backupFileHandle = await dirHandle.getFileHandle(`${dbFilename}.bak`, { create: true });
      const backupWritable = await backupFileHandle.createWritable();
      await backupWritable.write(origFile);
      await backupWritable.close();
      Logger.info(`Yedek veritabanı başarıyla oluşturuldu: ${dbFilename}.bak`);
      console.log(`Yedek veritabanı başarıyla oluşturuldu: ${dbFilename}.bak`);
    } catch (backupErr) {
      console.warn("Veritabanı yedeği oluşturulamadı veya dosya ilk kez yaratılıyor:", backupErr);
    }
    
    const fileHandle = await dirHandle.getFileHandle(dbFilename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(binaryData);
    await writable.close();
    Logger.success(`SQLite veritabanı başarıyla dosyaya yazıldı: ${dbFilename}`);
    console.log(`SQLite veritabanı başarıyla dosyaya yazıldı: ${dbFilename}`);
    
    // Update local IndexedDB cache
    let consoleKey = null;
    for (const k in consoleData) {
      if (consoleData[k] === system) {
        consoleKey = k;
        break;
      }
    }
    if (consoleKey) {
      await saveGamesCache(consoleKey, system.games);
      console.log(`[IndexedDB Cache] '${consoleKey}' için önbellek güncellendi (SQLite kaydı sonrası).`);
    }
  } catch (writeErr) {
    Logger.error(`SQLite veritabanı yazma hatası: ${writeErr.message}`);
    console.error("SQLite veritabanı yazma hatası:", writeErr);
    alert("Hata: SQLite veritabanı dosyasına yazılamadı! Lütfen disk izinlerinizi kontrol edin.");
    throw writeErr;
  }
}

// ==========================================================================
// ÇOKLU GÖRSEL TARAMA VE CAROUSEL FONKSİYONLARI
// ==========================================================================

// Sonekleri dostane isimlerle eşleştir
function getFriendlySuffixName(suffix) {
  switch (suffix) {
    case "":
    case "default":
      return "Standart Kapak";
    case "-image":
      return "Kutu Tasarımı (Boxart)";
    case "-marquee":
      return "Oyun Logosu (Marquee)";
    case "-thumb":
      return "Küçük Resim (Thumbnail)";
    case "-boxart":
      return "Kapak Görseli (Boxart)";
    case "-titlescreen":
      return "Giriş Ekranı (Title)";
    case "-screenshot":
      return "Ekran Görüntüsü";
    default:
      return suffix.replace('-', '').toUpperCase();
  }
}

// Oyuna ait tüm olası kapak/görsel dosyalarını tara ve listele
async function scanGameImagesList(system, game) {
  game.imagesList = [];
  try {
    const baseName = game.filename.substring(0, game.filename.lastIndexOf('.'));
    let sysImgsHandle = null;

    if (currentProfile.paths.imagesLoc === 'root-separate') {
      const cleanImgRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
      const imgsRootHandle = await sdCardHandle.getDirectoryHandle(cleanImgRoot, { create: false });
      sysImgsHandle = await imgsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: false });
    } else {
      // standard subfolder
      const imgDirName = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
      const pathParts = imgDirName.split('/');
      let currentHandle = system.dirHandle;
      for (const part of pathParts) {
        if (part) {
          try {
            currentHandle = await currentHandle.getDirectoryHandle(part, { create: false });
          } catch(e) {
            currentHandle = null;
            break;
          }
        }
      }
      sysImgsHandle = currentHandle;
      
      // Fallback: if not found, try common folders directly inside system dir
      if (!sysImgsHandle) {
        const fallbacks = ['images', 'media/images', 'downloaded_images'];
        for (const fb of fallbacks) {
          try {
            let tempHandle = system.dirHandle;
            for (const part of fb.split('/')) {
              tempHandle = await tempHandle.getDirectoryHandle(part, { create: false });
            }
            sysImgsHandle = tempHandle;
            break;
          } catch(e) {}
        }
      }
    }

    if (sysImgsHandle) {
      const suffixes = ["", "-image", "-marquee", "-thumb", "-boxart", "-titlescreen", "-screenshot"];
      const extensions = ["png", "jpg", "jpeg", "gif", "PNG", "JPG", "JPEG"];
      
      for (const suffix of suffixes) {
        let fileHandle = null;
        let resolvedExt = "";
        for (const ext of extensions) {
          try {
            fileHandle = await sysImgsHandle.getFileHandle(`${baseName}${suffix}.${ext}`, { create: false });
            resolvedExt = ext;
            break;
          } catch(e) {}
        }
        if (fileHandle) {
          const file = await fileHandle.getFile();
          const url = URL.createObjectURL(file);
          
          let relativePath = "";
          if (currentProfile.paths.imagesLoc === 'root-separate') {
            const cleanRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
            relativePath = `/${cleanRoot}/${getSystemFolderName(system)}/${baseName}${suffix}.${resolvedExt}`;
          } else {
            const cleanRoot = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
            relativePath = `./${cleanRoot}/${baseName}${suffix}.${resolvedExt}`;
          }
          
          game.imagesList.push({
            suffix: suffix || "default",
            url: url,
            path: relativePath
          });
        }
      }
    }
  } catch(err) {
    console.warn("Resim listesi taranırken hata:", err);
  }

  // Fallback: If no images found but game.image is set, push it
  if (game.imagesList.length === 0 && game.image) {
    game.imagesList.push({
      suffix: "default",
      url: game.image,
      path: game.localImagePath || ""
    });
  }

  // Ensure game.image points to the first available image if not set
  if (game.imagesList.length > 0 && !game.image) {
    game.image = game.imagesList[0].url;
    game.localImagePath = game.imagesList[0].path;
  }
}

// ==========================================================================
// GAME DELETION ENGINE
// ==========================================================================

// Toplu işlemler barını seçilen oyun sayısına göre günceller
function updateBulkActionBarUI() {
  const bar = document.getElementById('bulk-actions-bar');
  const countEl = document.getElementById('bulk-selected-count');
  if (!bar) return;
  
  if (selectedRomsBulk.length > 0) {
    if (countEl) countEl.textContent = selectedRomsBulk.length;
    bar.style.display = 'flex';
    
    // Enable buttons when bar is rendered
    const btnDelete = document.getElementById('btn-bulk-delete');
    const btnScrape = document.getElementById('btn-bulk-scrape-selected');
    const btnSelectAll = document.getElementById('btn-bulk-select-all');
    const btnDeselect = document.getElementById('btn-bulk-deselect');
    if (btnDelete) btnDelete.disabled = false;
    if (btnScrape) btnScrape.disabled = false;
    if (btnSelectAll) btnSelectAll.disabled = false;
    if (btnDeselect) btnDeselect.disabled = false;
  } else {
    bar.style.display = 'none';
  }

  // --- Right Inspector Multi-Selection View ---
  const inspectorPanel = document.getElementById('sidebar-right');
  if (inspectorPanel) {
    if (selectedRomsBulk.length > 1) {
      inspectorPanel.innerHTML = `
        <div class="inspector-empty" style="padding: 40px 20px;">
          <span class="inspector-empty-icon" style="font-size: 3rem; margin-bottom: 15px; display: inline-block;">📁</span>
          <h3 style="color: hsl(var(--retro-cyan)); font-family: var(--font-tech); text-shadow: 0 0 10px rgba(0, 243, 255, 0.4); margin-top: 0; margin-bottom: 10px; font-size: 1.1rem; letter-spacing: 0.5px;">Çoklu Seçim Modu</h3>
          <p style="color: #fff; font-size: 0.85rem; margin-bottom: 20px; line-height: 1.5;">Şu anda <strong>${selectedRomsBulk.length} adet oyun</strong> seçtiniz.</p>
          <p style="color: var(--text-secondary); font-size: 0.75rem; line-height: 1.5; margin: 0;">Seçili oyunlar üzerinde alt barı kullanarak toplu silme işlemi gerçekleştirebilirsiniz. Tek bir oyunun detaylarını düzenlemek veya kapak görselini değiştirmek için lütfen çoklu seçimi kaldırınız.</p>
        </div>
      `;
      // Clear active styling from single selected cards in the main grid/list
      document.querySelectorAll('.rom-card.active, .rom-row-item.active').forEach(el => {
        el.classList.remove('active');
      });
      selectedRom = null;
    } else if (selectedRomsBulk.length === 1) {
      // If exactly 1 item is checked, let's open its inspector!
      const singleGame = selectedRomsBulk[0];
      if (selectedRom !== singleGame) {
        const card = document.querySelector(`.rom-card input[type="checkbox"]:checked, .rom-row-item input[type="checkbox"]:checked`);
        if (card && card.closest('.rom-card, .rom-row-item')) {
          selectRomForInspection(singleGame, card.closest('.rom-card, .rom-row-item'));
        }
      }
    } else if (selectedRomsBulk.length === 0) {
      // If we cleared all checkboxes, let's clear the inspector
      clearInspector();
    }
  }
}

// Konsol sistemine ait görsel veya video klasör handle'ını dinamik çözer
async function getSystemDirectoryHandle(system, type) {
  try {
    if (type === 'images') {
      if (currentProfile.paths.imagesLoc === 'root-separate') {
        const cleanRoot = (currentProfile.paths.imagesRoot || "Imgs").replace(/^\//, '').replace(/\/$/, '');
        const imgsRootHandle = await sdCardHandle.getDirectoryHandle(cleanRoot, { create: false });
        return await imgsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: false });
      } else {
        const imgDirName = (currentProfile.paths.imagesRoot || "images").replace(/^\.\//, '').replace(/\/$/, '');
        const pathParts = imgDirName.split('/');
        let currentHandle = system.dirHandle;
        for (const part of pathParts) {
          if (part) {
            currentHandle = await currentHandle.getDirectoryHandle(part, { create: false });
          }
        }
        return currentHandle;
      }
    } else if (type === 'videos') {
      if (currentProfile.paths.imagesLoc === 'root-separate') {
        const cleanRoot = (currentProfile.paths.videosRoot || "Videos").replace(/^\//, '').replace(/\/$/, '');
        const vidsRootHandle = await sdCardHandle.getDirectoryHandle(cleanRoot, { create: false });
        return await vidsRootHandle.getDirectoryHandle(getSystemFolderName(system), { create: false });
      } else {
        const vidDirName = (currentProfile.paths.videosRoot || "videos").replace(/^\.\//, '').replace(/\/$/, '');
        const pathParts = vidDirName.split('/');
        let currentHandle = system.dirHandle;
        for (const part of pathParts) {
          if (part) {
            currentHandle = await currentHandle.getDirectoryHandle(part, { create: false });
          }
        }
        return currentHandle;
      }
    }
  } catch (err) {
    // Klasör bulunamazsa varsayılan klasör yollarını dene (Geriye Dönük Uyumluluk)
    try {
      if (type === 'images') {
        const fallbacks = ['images', 'media/images', 'downloaded_images'];
        for (const fb of fallbacks) {
          try {
            let tempHandle = system.dirHandle;
            for (const part of fb.split('/')) {
              tempHandle = await tempHandle.getDirectoryHandle(part, { create: false });
            }
            return tempHandle;
          } catch(e) {}
        }
      } else if (type === 'videos') {
        const fallbacks = ['videos', 'media/videos', 'downloaded_videos'];
        for (const fb of fallbacks) {
          try {
            let tempHandle = system.dirHandle;
            for (const part of fb.split('/')) {
              tempHandle = await tempHandle.getDirectoryHandle(part, { create: false });
            }
            return tempHandle;
          } catch(e) {}
        }
      }
    } catch(e) {}
  }
  return null;
}

// Göreli yola göre diski yürüyerek belirtilen dosyayı siler
async function deleteFileByRelativePath(baseHandle, relativePath) {
  if (!baseHandle || !relativePath) return false;
  try {
    let cleanPath = relativePath.trim();
    if (cleanPath.startsWith('./')) {
      cleanPath = cleanPath.substring(2);
    }
    if (cleanPath.startsWith('/')) {
      cleanPath = cleanPath.substring(1);
    }
    
    const parts = cleanPath.split('/').filter(p => p !== '');
    if (parts.length === 0) return false;
    
    let currentHandle = baseHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: false });
    }
    
    const filename = parts[parts.length - 1];
    await currentHandle.removeEntry(filename);
    console.log(`Dosya başarıyla silindi: ${relativePath}`);
    return true;
  } catch (err) {
    console.warn(`Dosya silinemedi veya mevcut değil: ${relativePath}`, err);
    return false;
  }
}

// Oyuna ait tüm ilişkili resim ve video dosyalarını temizler
async function deleteAssociatedMedia(system, game) {
  const baseName = game.filename.substring(0, game.filename.lastIndexOf('.'));
  
  // 1. XML/DB veritabanında belirtilen doğrudan yolu sil
  if (game.localImagePath) {
    const isRootSeparate = currentProfile.paths.imagesLoc === 'root-separate';
    const baseHandle = isRootSeparate ? sdCardHandle : system.dirHandle;
    await deleteFileByRelativePath(baseHandle, game.localImagePath);
  }
  
  // 2. Görsel ve video klasörlerinde uzantısı hariç birebir aynı olanları sil (Akıllı Suffix Eşleştirici)
  const mediaTypes = ['images', 'videos'];
  for (const type of mediaTypes) {
    const dirHandle = await getSystemDirectoryHandle(system, type);
    if (dirHandle) {
      try {
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file') {
            const entryExtIndex = entry.name.lastIndexOf('.');
            const entryBase = entryExtIndex !== -1 ? entry.name.substring(0, entryExtIndex) : entry.name;
            
            // A. Birebir uzantısız dosya adı eşleşmesi
            const exactMatch = entryBase.toLowerCase() === baseName.toLowerCase();
            
            // B. Suffix (ek) eşleşmesi (örn: GameName-image.png, GameName-video.mp4)
            let suffixMatch = false;
            if (entryBase.toLowerCase().startsWith(baseName.toLowerCase() + '-')) {
              const suffix = entryBase.substring(baseName.length);
              const knownSuffixes = ["-image", "-marquee", "-thumb", "-boxart", "-titlescreen", "-screenshot", "-video"];
              if (knownSuffixes.includes(suffix.toLowerCase())) {
                suffixMatch = true;
              }
            }
            
            if (exactMatch || suffixMatch) {
              try {
                await dirHandle.removeEntry(entry.name);
                console.log(`İlişkili medya silindi (${type}): ${entry.name}`);
              } catch (err) {
                console.warn(`İlişkili medya silinirken hata (${type}): ${entry.name}`, err);
              }
            }
          }
        }
      } catch (err) {
        console.warn(`${type} klasörü taranırken hata:`, err);
      }
    }
  }
}

// Tek bir oyunu ve tüm dosyalarını siler
async function deleteSingleRom(game) {
  if (!game || !activeConsole) return;
  const system = consoleData[activeConsole];
  if (!system) return;

  const confirmation = confirm(`"${game.title}" oyununu ve SD karttaki tüm ilişkili medya dosyalarını (görseller, videolar vb.) KALICI olarak silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`);
  if (!confirmation) return;

  Logger.info(`Oyun silme işlemi başlatıldı: ${game.filename} (${game.title})`);
  try {
    // 1. ROM Dosyasını Sil
    await system.dirHandle.removeEntry(game.filename);
    Logger.info(`ROM dosyası silindi: ${game.filename}`);
    console.log(`ROM dosyası silindi: ${game.filename}`);

    // 2. İlişkili Medyaları Temizle
    await deleteAssociatedMedia(system, game);

    // 3. SQLite kullanılıyorsa veritabanından sil
    if (currentProfile.metadataStorage === 'sqlite' && system.sqliteDB) {
      const db = system.sqliteDB;
      const dbConfig = currentProfile.sqliteConfig;
      const cols = dbConfig.columns;
      const sysId = system.config.id;
      const sysFolder = system.dirHandle.name;
      const tableName = (dbConfig.tableName || "roms")
        .replace(/{SYSTEM}/g, sysFolder)
        .replace(/{system}/g, sysId);
      const targetPath = game.dbRomPath || `./${game.filename}`;
      
      try {
        db.run(`DELETE FROM "${tableName}" WHERE "${cols.filename}" = :romPath`, { ':romPath': targetPath });
        
        // İsme göre alternatif eşleşen yolları da temizle
        const checkQuery2 = `SELECT "${cols.filename}" FROM "${tableName}"`;
        const checkResult2 = db.exec(checkQuery2);
        if (checkResult2 && checkResult2.length > 0) {
          for (const val of checkResult2[0].values) {
            const pathInDb = val[0];
            if (cleanPathForMatching(pathInDb) === cleanPathForMatching(game.filename)) {
              db.run(`DELETE FROM "${tableName}" WHERE "${cols.filename}" = :romPath`, { ':romPath': pathInDb });
            }
          }
        }
        await writeSqliteDBFile(system);
      } catch (dbErr) {
        Logger.error(`SQLite kaydı silinirken hata: ${dbErr.message}`);
        console.error("SQLite kaydı silinirken hata:", dbErr);
      }
    }

    // 4. Bellekten çıkar
    system.games = system.games.filter(g => g !== game);

    // 5. XML kullanılıyorsa veritabanını yeniden yaz
    if (currentProfile.metadataStorage === 'xml') {
      await writeGamelistXMLFile(system);
    }

    // 6. Inspector detay ekranını temizle ve seçimi kaldır
    if (selectedRom === game) {
      clearInspector();
    }
    selectedRomsBulk = selectedRomsBulk.filter(g => g !== game);
    updateBulkActionBarUI();

    // 7. Arayüzü yeniden çiz
    renderSidebarConsoles();
    renderActiveGames();
    
    Logger.success(`Oyun ve ilişkili tüm medyalar başarıyla silindi: ${game.title}`);
    showToast(`"${game.title}" oyunu başarıyla silindi.`, 'success');
  } catch (err) {
    Logger.error(`Oyun silinirken hata oluştu: ${err.message}`);
    console.error("Oyun silinirken hata:", err);
    alert(`Hata: Oyun silinemedi! Lütfen dosya izinlerini ve SD kart bağlantısını kontrol edin.\nDetay: ${err.message}`);
  }
}

// Seçilen tüm oyunları ve dosyalarını toplu olarak siler
async function deleteBulkRoms() {
  if (selectedRomsBulk.length === 0 || !activeConsole) return;
  const system = consoleData[activeConsole];
  if (!system) return;

  const count = selectedRomsBulk.length;
  Logger.info(`Toplu oyun silme işlemi başlatıldı: ${count} adet oyun silinecek.`);
  const confirmation = confirm(`Seçilen ${count} adet oyunu ve SD karttaki tüm ilişkili medya dosyalarını (görseller, videolar vb.) KALICI olarak silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`);
  if (!confirmation) return;

  // Disable buttons in the bulk action bar during deletion
  const btnDelete = document.getElementById('btn-bulk-delete');
  const btnScrape = document.getElementById('btn-bulk-scrape-selected');
  const btnSelectAll = document.getElementById('btn-bulk-select-all');
  const btnDeselect = document.getElementById('btn-bulk-deselect');
  if (btnDelete) btnDelete.disabled = true;
  if (btnScrape) btnScrape.disabled = true;
  if (btnSelectAll) btnSelectAll.disabled = true;
  if (btnDeselect) btnDeselect.disabled = true;

  // Yükleniyor overlay gösterimi
  const container = document.getElementById('game-grid-container');
  container.innerHTML = `
    <div class="empty-state">
      <div class="loader-container" style="display:flex; flex-direction:column; align-items:center; gap:15px">
        <div class="loader-dot"></div>
        <h3 class="empty-title">Oyunlar Siliniyor...</h3>
        <p class="empty-desc">Seçilen ${count} oyun ve ilgili tüm medya dosyaları SD karttan temizleniyor. Lütfen bekleyin.</p>
      </div>
    </div>
  `;

  let successCount = 0;
  let failCount = 0;

  for (const game of selectedRomsBulk) {
    try {
      // 1. ROM Sil
      await system.dirHandle.removeEntry(game.filename);
      
      // 2. Medya Temizle
      await deleteAssociatedMedia(system, game);

      // 3. SQLite'tan sil
      if (currentProfile.metadataStorage === 'sqlite' && system.sqliteDB) {
        const db = system.sqliteDB;
        const dbConfig = currentProfile.sqliteConfig;
        const cols = dbConfig.columns;
        const sysId = system.config.id;
        const sysFolder = system.dirHandle.name;
        const tableName = (dbConfig.tableName || "roms")
          .replace(/{SYSTEM}/g, sysFolder)
          .replace(/{system}/g, sysId);
        const targetPath = game.dbRomPath || `./${game.filename}`;
        try {
          db.run(`DELETE FROM "${tableName}" WHERE "${cols.filename}" = :romPath`, { ':romPath': targetPath });
          
          const checkQuery2 = `SELECT "${cols.filename}" FROM "${tableName}"`;
          const checkResult2 = db.exec(checkQuery2);
          if (checkResult2 && checkResult2.length > 0) {
            for (const val of checkResult2[0].values) {
              const pathInDb = val[0];
              if (cleanPathForMatching(pathInDb) === cleanPathForMatching(game.filename)) {
                db.run(`DELETE FROM "${tableName}" WHERE "${cols.filename}" = :romPath`, { ':romPath': pathInDb });
              }
            }
          }
        } catch(e) {}
      }

      // 4. Bellekten çıkar
      system.games = system.games.filter(g => g !== game);
      Logger.info(`[Toplu Silme] Silindi: ${game.filename}`);
      successCount++;
    } catch (err) {
      Logger.error(`[Toplu Silme] Silinemedi: ${game.filename} (Hata: ${err.message})`);
      console.error(`Oyun silinemedi: ${game.filename}`, err);
      failCount++;
    }
  }

  // 5. Değişiklikleri diske kaydet
  try {
    if (currentProfile.metadataStorage === 'sqlite' && system.sqliteDB) {
      await writeSqliteDBFile(system);
    } else if (currentProfile.metadataStorage === 'xml') {
      await writeGamelistXMLFile(system);
    }
  } catch (err) {
    Logger.error(`[Toplu Silme] Silme sonrası veritabanı kaydetme hatası: ${err.message}`);
    console.error("Silme sonrası veritabanı yazma hatası:", err);
  }

  // Durumları sıfırla
  selectedRomsBulk = [];
  clearInspector();
  updateBulkActionBarUI();

  // Yeniden çiz
  renderSidebarConsoles();
  renderActiveGames();

  if (failCount === 0) {
    Logger.success(`[Toplu Silme] Seçilen tüm ${successCount} oyun ve medyalar başarıyla silindi.`);
    showToast(`Seçilen ${successCount} adet oyun başarıyla silindi.`, 'success');
  } else {
    Logger.warn(`[Toplu Silme] İşlem bitti. Başarılı: ${successCount}, Başarısız: ${failCount}`);
    alert(`Silme işlemi tamamlandı.\nBaşarıyla Silinen: ${successCount}\nSilinemeyen: ${failCount}\nLütfen SD kart izinlerinizi kontrol edin.`);
  }
}

// --- Show Non-blocking Toast Notification ---
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `retro-toast ${type}`;
  
  const icon = type === 'success' ? '🟢' : '🔴';
  toast.innerHTML = `<span>${icon}</span> <span style="flex-grow:1">${message}</span>`;
  
  container.appendChild(toast);
  
  // Remove from DOM after animations complete
  setTimeout(() => {
    toast.remove();
    // Clean up container if empty
    if (container.children.length === 0) {
      container.remove();
    }
  }, 3000);
}
