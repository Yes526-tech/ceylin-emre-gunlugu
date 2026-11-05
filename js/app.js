/**
 * Ceylin's Love Diary - Main Application Script
 */

// Configuration
const CONFIG = {
  CORRECT_PIN: '24042008',
  START_DATE: new Date('2026-09-27T00:00:00'),
  DEFAULT_QUOTES: [
    "Seninle geçen her an, hayatımın en güzel hediyesi...",
    "Gözlerinin içine her baktığımda, ilk günkü gibi heyecanlanıyorum.",
    "Dünyada milyarlarca insan var ama benim kalbim sadece senin için atıyor.",
    "Sen benim sadece sevgilim değil; evim, huzurum ve geleceğimsin.",
    "Gülüşün, en karanlık günlerimi bile güneş gibi aydınlatıyor.",
    "İyi ki varsın ve iyi ki hayatımdasın bir tanem... Ceylin & Emre sonsuza dek!",
    "Seninle el ele yürümek, dünyanın en güzel yolculuğu.",
    "Hayat bir kitap olsaydı, her sayfasında sadece senin adın yazardı.",
    "Kalbimdeki en tatlı fısıltı daima senin sesin...",
    "Seninle yaşlanmak, bu hayattaki en büyük dileğim."
  ]
};

// ==========================================================================
// ==========================================================================
// REAL-TIME WEBRTC P2P & CLOUD SYNCHRONIZATION
// ==========================================================================
const LiveP2P = {
  peer: null,
  conn: null,
  myId: 'ce-user-' + Math.floor(100000 + Math.random() * 900000),
  isConnecting: false,

  init() {
    if (typeof Peer === 'undefined') return;
    try {
      this.peer = new Peer(this.myId, { debug: 0 });

      this.peer.on('open', (id) => {
        this.myId = id;
        if (window.CloudSync) {
          window.CloudSync.save('active_peer', { peerId: id, timestamp: Date.now() });
        }
      });

      this.peer.on('connection', (conn) => {
        this.conn = conn;
        this.setupConn(conn);
      });

      this.peer.on('error', (err) => {
        // Silently handle
      });
    } catch (e) {}
  },

  connectTo(targetPeerId) {
    if (!this.peer || !targetPeerId || targetPeerId === this.myId) return;
    if (this.conn && this.conn.open && this.conn.peer === targetPeerId) return;
    if (this.isConnecting) return;
    this.isConnecting = true;
    try {
      const conn = this.peer.connect(targetPeerId, { reliable: true });
      this.conn = conn;
      this.setupConn(conn);
    } catch (e) {
    } finally {
      setTimeout(() => { this.isConnecting = false; }, 2000);
    }
  },

  setupConn(conn) {
    conn.on('data', (data) => {
      this.handleIncoming(data);
    });
    conn.on('close', () => {
      if (this.conn === conn) this.conn = null;
    });
    conn.on('error', () => {
      if (this.conn === conn) this.conn = null;
    });
  },

  send(data) {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(data);
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  },

  handleIncoming(data) {
    if (!data || !data.type) return;

    // 1. Music Live Sync (Instant WebRTC)
    if (data.type === 'music_sync') {
      if (window.musicPlayer && typeof window.musicPlayer.applyRemoteSync === 'function') {
        window.musicPlayer.applyRemoteSync(data);
      }
    }

    // 2. Drawing Live Sync
    if (data.type === 'stroke' || data.type === 'dot' || data.type === 'stamp' || data.type === 'clear') {
      if (typeof window.handleRemoteDrawingData === 'function') {
        window.handleRemoteDrawingData(data);
      }
    }
  }
};
window.LiveP2P = LiveP2P;

const CloudSync = {
  endpoint: '/.netlify/functions/sync',
  isSyncing: false,
  isInitialized: false,
  localTimestamps: {},

  getLocalTimestamps() {
    try {
      return JSON.parse(localStorage.getItem('ce_cloud_timestamps_v2') || '{}');
    } catch(e) {
      return {};
    }
  },

  setLocalTimestamp(key, ts = Date.now()) {
    try {
      this.localTimestamps = this.getLocalTimestamps();
      this.localTimestamps[key] = ts;
      localStorage.setItem('ce_cloud_timestamps_v2', JSON.stringify(this.localTimestamps));
    } catch(e) {}
  },

  setAllLocalTimestamps(tsMap) {
    try {
      this.localTimestamps = Object.assign({}, this.getLocalTimestamps(), tsMap);
      localStorage.setItem('ce_cloud_timestamps_v2', JSON.stringify(this.localTimestamps));
    } catch(e) {}
  },

  async save(key, data) {
    try {
      this.setLocalTimestamp(key, Date.now());
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, data })
      });
      if (!res.ok) {
        console.warn(`[CloudSync] save HTTP ${res.status} for ${key}`);
      }
    } catch (err) {
      console.warn('[CloudSync] save error for ' + key + ':', err);
    }
  },

  applySyncData(data, showToast = false) {
    if (!data || typeof data !== 'object') return false;
    let hasNewData = false;

    // 1. Memories (İki Yönlü Akıllı Birleştirme - Asla Veri Kaybetmez)
    if (data.memories && data.memories.data) {
      const cloudMemories = data.memories.data;
      const deletedIds = (function() {
        try {
          const localDel = JSON.parse(localStorage.getItem('ce_deleted_memory_ids_v3') || '[]');
          const cloudDel = (data.deleted_memory_ids && data.deleted_memory_ids.data) || [];
          const mergedDel = Array.from(new Set([...localDel, ...cloudDel]));
          localStorage.setItem('ce_deleted_memory_ids_v3', JSON.stringify(mergedDel));
          return mergedDel;
        } catch { return []; }
      })();

      let localMemories = [];
      try {
        const raw = localStorage.getItem('ce_custom_memories_v3');
        if (raw) localMemories = JSON.parse(raw);
      } catch(e) {}

      const mergedMap = new Map();
      if (Array.isArray(cloudMemories)) {
        cloudMemories.forEach(m => {
          if (m && m.id && !deletedIds.includes(m.id)) {
            mergedMap.set(m.id, m);
          }
        });
      }

      let localHasUnsynced = false;
      if (Array.isArray(localMemories)) {
        localMemories.forEach(m => {
          if (m && m.id && !deletedIds.includes(m.id)) {
            if (!mergedMap.has(m.id)) {
              mergedMap.set(m.id, m);
              localHasUnsynced = true;
            }
          }
        });
      }

      const mergedList = Array.from(mergedMap.values());
      const mergedRaw = JSON.stringify(mergedList);
      const currentRaw = localStorage.getItem('ce_custom_memories_v3');

      if (currentRaw !== mergedRaw) {
        try {
          localStorage.setItem('ce_custom_memories_v3', mergedRaw);
        } catch (e) {
          console.warn('LocalStorage limit for memories, pruning locally:', e);
          try {
            localStorage.setItem('ce_custom_memories_v3', JSON.stringify(mergedList.slice(0, 30)));
          } catch(err2) {}
        }
        if (typeof window.reloadGallery === 'function') window.reloadGallery();
        hasNewData = true;
      }

      // Eğer yerelde bulutta olmayan yeni anılar varsa, onları buluta gönder
      if (localHasUnsynced) {
        this.save('memories', mergedList);
      }
    }

    // 2. Face ID Profile (Yüz Tanıma Profili)
    if (data.face_id_profile && data.face_id_profile.data) {
      const cloudProfile = data.face_id_profile.data;
      const currentRaw = localStorage.getItem('ceylin_face_profile_v2');
      const cloudRaw = JSON.stringify(cloudProfile);
      if (currentRaw !== cloudRaw) {
        localStorage.setItem('ceylin_face_profile_v2', cloudRaw);
        localStorage.setItem('ce_ceylin_face_profile_v2', cloudRaw);
        if (typeof window.refreshFaceIdUI === 'function') window.refreshFaceIdUI();
        hasNewData = true;
      }
    }

    // 3. Bucket List (Hayal Listesi İki Yönlü Eşitleme)
    if (data.bucket_list && data.bucket_list.data) {
      const cloudBucket = data.bucket_list.data;
      let localBucket = [];
      try {
        const raw = localStorage.getItem('ce_bucket_list_v2');
        if (raw) localBucket = JSON.parse(raw);
      } catch(e) {}

      const mergedBucketMap = new Map();
      if (Array.isArray(cloudBucket)) {
        cloudBucket.forEach(item => {
          if (item && item.text) mergedBucketMap.set(item.text.trim(), item);
        });
      }

      let bucketHasUnsynced = false;
      if (Array.isArray(localBucket)) {
        localBucket.forEach(item => {
          if (item && item.text && !mergedBucketMap.has(item.text.trim())) {
            mergedBucketMap.set(item.text.trim(), item);
            bucketHasUnsynced = true;
          }
        });
      }

      const mergedBucketList = Array.from(mergedBucketMap.values());
      const mergedBucketRaw = JSON.stringify(mergedBucketList);
      const currentBucketRaw = localStorage.getItem('ce_bucket_list_v2');

      if (currentBucketRaw !== mergedBucketRaw) {
        localStorage.setItem('ce_bucket_list_v2', mergedBucketRaw);
        if (typeof window.reloadBucketList === 'function') window.reloadBucketList();
        hasNewData = true;
      }

      if (bucketHasUnsynced) {
        this.save('bucket_list', mergedBucketList);
      }
    }

    // 4. Diary Entries (Özel Hatıra Notları İki Yönlü Eşitleme)
    if (data.diary && data.diary.data) {
      const cloudDiary = data.diary.data;
      const deletedDiaryIds = (function() {
        try {
          const localDel = JSON.parse(localStorage.getItem('ceylin_deleted_diary_ids_v4') || '[]');
          const cloudDel = (data.deleted_diary_ids && data.deleted_diary_ids.data) || [];
          const mergedDel = Array.from(new Set([...localDel, ...cloudDel]));
          localStorage.setItem('ceylin_deleted_diary_ids_v4', JSON.stringify(mergedDel));
          return mergedDel;
        } catch { return []; }
      })();

      let localDiary = [];
      try {
        const raw = localStorage.getItem('ceylin_custom_entries_v4') || localStorage.getItem('ceylin_custom_entries');
        if (raw) localDiary = JSON.parse(raw);
      } catch(e) {}

      const mergedDiaryMap = new Map();
      if (Array.isArray(cloudDiary)) {
        cloudDiary.forEach(e => {
          if (e && e.id && !deletedDiaryIds.includes(e.id)) {
            mergedDiaryMap.set(e.id, e);
          }
        });
      }

      let diaryHasUnsynced = false;
      if (Array.isArray(localDiary)) {
        localDiary.forEach(e => {
          if (e && e.id && !deletedDiaryIds.includes(e.id)) {
            if (!mergedDiaryMap.has(e.id)) {
              mergedDiaryMap.set(e.id, e);
              diaryHasUnsynced = true;
            }
          }
        });
      }

      const mergedDiaryList = Array.from(mergedDiaryMap.values());
      const mergedDiaryRaw = JSON.stringify(mergedDiaryList);
      const currentDiaryRaw = localStorage.getItem('ceylin_custom_entries_v4');

      if (currentDiaryRaw !== mergedDiaryRaw) {
        localStorage.setItem('ceylin_custom_entries_v4', mergedDiaryRaw);
        localStorage.setItem('ceylin_custom_entries', mergedDiaryRaw);
        if (typeof window.reloadDiary === 'function') window.reloadDiary();
        hasNewData = true;
      }

      if (diaryHasUnsynced) {
        this.save('diary', mergedDiaryList);
      }
    }

    // 5. Pink Notebook (Pembe Anı Defteri Sayfaları)
    if (data.notebook && data.notebook.data) {
      const cloudNb = data.notebook.data;
      let localNb = [];
      try {
        const raw = localStorage.getItem('ce_notebook_pages_v3');
        if (raw) localNb = JSON.parse(raw);
      } catch(e) {}

      const mergedNbMap = new Map();
      if (Array.isArray(cloudNb)) {
        cloudNb.forEach(p => {
          if (p && p.id) mergedNbMap.set(p.id, p);
        });
      }

      let nbHasUnsynced = false;
      if (Array.isArray(localNb)) {
        localNb.forEach(p => {
          if (p && p.id && !mergedNbMap.has(p.id)) {
            mergedNbMap.set(p.id, p);
            nbHasUnsynced = true;
          }
        });
      }

      const mergedNbList = Array.from(mergedNbMap.values());
      const mergedNbRaw = JSON.stringify(mergedNbList);
      const currentNbRaw = localStorage.getItem('ce_notebook_pages_v3');

      if (currentNbRaw !== mergedNbRaw) {
        localStorage.setItem('ce_notebook_pages_v3', mergedNbRaw);
        if (typeof window.reloadNotebook === 'function') window.reloadNotebook();
        hasNewData = true;
      }

      if (nbHasUnsynced) {
        this.save('notebook', mergedNbList);
      }
    }

    // 6. Sipsak Album (Şipşak Fotoğrafları İki Yönlü Eşitleme)
    if (data.sipsak && data.sipsak.data) {
      const cloudSipsak = data.sipsak.data;
      const deletedSipsakIds = (function() {
        try {
          const localDel = JSON.parse(localStorage.getItem('ce_deleted_sipsak_ids_v1') || '[]');
          const cloudDel = (data.deleted_sipsak_ids && data.deleted_sipsak_ids.data) || [];
          const mergedDel = Array.from(new Set([...localDel, ...cloudDel]));
          localStorage.setItem('ce_deleted_sipsak_ids_v1', JSON.stringify(mergedDel));
          return mergedDel;
        } catch { return []; }
      })();

      let localSipsak = [];
      try {
        const raw = localStorage.getItem('ce_sipsak_album_v1');
        if (raw) localSipsak = JSON.parse(raw);
      } catch(e) {}

      const mergedSipsakMap = new Map();
      if (Array.isArray(cloudSipsak)) {
        cloudSipsak.forEach(s => {
          if (s && s.id && !deletedSipsakIds.includes(s.id)) mergedSipsakMap.set(s.id, s);
        });
      }

      let sipsakHasUnsynced = false;
      if (Array.isArray(localSipsak)) {
        localSipsak.forEach(s => {
          if (s && s.id && !deletedSipsakIds.includes(s.id) && !mergedSipsakMap.has(s.id)) {
            mergedSipsakMap.set(s.id, s);
            sipsakHasUnsynced = true;
          }
        });
      }

      const mergedSipsakList = Array.from(mergedSipsakMap.values());
      const mergedSipsakRaw = JSON.stringify(mergedSipsakList);
      const currentSipsakRaw = localStorage.getItem('ce_sipsak_album_v1');

      if (currentSipsakRaw !== mergedSipsakRaw) {
        try {
          localStorage.setItem('ce_sipsak_album_v1', mergedSipsakRaw);
        } catch(e) {
          console.warn('LocalStorage limit for sipsak:', e);
        }
        if (typeof window.reloadSipsak === 'function') window.reloadSipsak();
        hasNewData = true;
      }

      if (sipsakHasUnsynced) {
        this.save('sipsak', mergedSipsakList);
      }
    }

    // 7. Hero Image (Ana Fotoğraf)
    if (data.hero_image && data.hero_image.data) {
      const cloudHero = data.hero_image.data;
      const current = localStorage.getItem('ce_custom_hero_image_v2');
      if (current !== cloudHero) {
        localStorage.setItem('ce_custom_hero_image_v2', cloudHero);
        const heroImg = document.getElementById('hero-img');
        if (heroImg) heroImg.src = cloudHero;
        hasNewData = true;
      }
    }

    // 8. Drawing Canvas (Aşk Tuvali - Yerel Çizim Korumalı)
    if (data.drawing_canvas && data.drawing_canvas.data) {
      const cloudDrawing = data.drawing_canvas.data;
      const localDrawing = localStorage.getItem('ce_love_canvas_cache_v1');
      const recentlyCleared = (Date.now() - (window._lastDrawingClearTime || 0)) < 30000;
      const recentlyDrawn = (Date.now() - (window._lastLocalDrawTime || 0)) < 30000;
      if (cloudDrawing !== localDrawing && !recentlyCleared && !recentlyDrawn) {
        if (typeof window.syncRemoteDrawing === 'function') {
          window.syncRemoteDrawing(cloudDrawing);
        }
      }
    }

    // 9. Live Synchronized Music Player
    if (data.music_state && data.music_state.data) {
      const cloudMusic = data.music_state.data;
      if (window.musicPlayer && typeof window.musicPlayer.applyRemoteSync === 'function') {
        window.musicPlayer.applyRemoteSync(cloudMusic);
      }
    }

    // 10. WebRTC P2P Peer Discovery
    if (data.active_peer && data.active_peer.data) {
      const peerData = data.active_peer.data;
      if (window.LiveP2P && peerData.peerId && peerData.peerId !== window.LiveP2P.myId) {
        if (Date.now() - (peerData.timestamp || 0) < 60000) {
          window.LiveP2P.connectTo(peerData.peerId);
        }
      }
    }

    if (hasNewData && showToast && typeof window.showSyncToast === 'function') {
      window.showSyncToast('Tüm anılar ve fotoğraflar buluttan senkronize edildi.');
    }

    if (typeof window.updateHeaderMenuStats === 'function') {
      window.updateHeaderMenuStats();
    }

    return hasNewData;
  },

  async syncAll(showToast = false, forceFull = false) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      this.localTimestamps = this.getLocalTimestamps();

      if (!forceFull) {
        // Fast, ultra-lightweight timestamp-based sync (only ~250 bytes transferred)
        const tsRes = await fetch(this.endpoint + '?timestamps=1');
        if (!tsRes.ok) return;
        const tsJson = await tsRes.json();
        const cloudTimestamps = (tsJson && tsJson.timestamps) || {};

        const changedKeys = [];
        for (const [k, cTime] of Object.entries(cloudTimestamps)) {
          const lTime = this.localTimestamps[k] || 0;
          if (cTime > lTime) {
            changedKeys.push(k);
          }
        }

        // If no keys changed, 100% up to date with zero lag and zero unnecessary bytes
        if (changedKeys.length === 0) {
          if (showToast && typeof window.showSyncToast === 'function') {
            window.showSyncToast('Tüm verileriniz en güncel haliyle senkronize.');
          }
          return;
        }

        if (changedKeys.includes('memories') && !changedKeys.includes('deleted_memory_ids')) {
          changedKeys.push('deleted_memory_ids');
        }
        if (changedKeys.includes('diary') && !changedKeys.includes('deleted_diary_ids')) {
          changedKeys.push('deleted_diary_ids');
        }
        if (changedKeys.includes('sipsak') && !changedKeys.includes('deleted_sipsak_ids')) {
          changedKeys.push('deleted_sipsak_ids');
        }

        const dataRes = await fetch(this.endpoint + '?keys=' + encodeURIComponent(changedKeys.join(',')));
        if (!dataRes.ok) return;
        const dataJson = await dataRes.json();
        if (dataJson && dataJson.data) {
          this.applySyncData(dataJson.data, showToast);
          for (const k of changedKeys) {
            this.localTimestamps[k] = cloudTimestamps[k] || Date.now();
          }
          this.setAllLocalTimestamps(this.localTimestamps);
        }
        return;
      }

      // Explicit full sync:
      const res = await fetch(this.endpoint + '?all=1');
      if (!res.ok) return;
      const json = await res.json();
      if (!json || !json.data) return;

      this.applySyncData(json.data, showToast);

      const tsRes = await fetch(this.endpoint + '?timestamps=1');
      if (tsRes.ok) {
        const tsJson = await tsRes.json();
        if (tsJson && tsJson.timestamps) {
          this.setAllLocalTimestamps(tsJson.timestamps);
        }
      }
    } catch (e) {
      console.warn('[CloudSync] syncAll error:', e);
    } finally {
      this.isSyncing = false;
    }
  },

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.localTimestamps = this.getLocalTimestamps();

    // Init Live P2P Peer
    if (window.LiveP2P) {
      try { window.LiveP2P.init(); } catch (e) {}
    }

    // Initial full sync on startup
    setTimeout(() => this.syncAll(false, true), 200);

    // Sync when returning to tab or window focus (instant responsive sync)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.syncAll(false, false);
      }
    });
    window.addEventListener('focus', () => {
      this.syncAll(false, false);
    });
    window.addEventListener('online', () => {
      this.syncAll(true, false);
    });

    // Periodic lightweight timestamp sync every 3 seconds
    setInterval(() => {
      if (!document.hidden) {
        this.syncAll(false, false);
      }
    }, 3000);

    // Wire Legacy Header Sync Button if present
    const headerSyncBtn = document.getElementById('header-sync-btn');
    if (headerSyncBtn) {
      headerSyncBtn.addEventListener('click', async () => {
        headerSyncBtn.style.animation = 'spin 0.8s linear infinite';
        try { sfx.playPop(); } catch(err) {}
        await this.syncAll(true, true);
        setTimeout(() => {
          headerSyncBtn.style.animation = '';
        }, 800);
      });
    }

    // Dedicated fast music poller (every 2.5s) for real-time live music playback
    setInterval(async () => {
      try {
        if (document.hidden) return;
        const res = await fetch(this.endpoint + '?key=music_state');
        if (!res.ok) return;
        const json = await res.json();
        if (json && json.data && window.musicPlayer) {
          window.musicPlayer.applyRemoteSync(json.data);
        }
      } catch (err) {}
    }, 2500);
  }
};
window.CloudSync = CloudSync;

window.showSyncToast = function(msg) {
  const toast = document.getElementById('sync-toast');
  const txt = document.getElementById('sync-toast-text');
  if (!toast) return;
  if (txt) txt.textContent = msg || 'Senkronize edildi.';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
};

// Web Audio API Sound Synthesizer (No external mp3 required for interactions)
class SoundFX {
  constructor() {
    this.ctx = null;
  }

  init() {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {
      // Audio context might be restricted before gesture
    }
  }

  // Romantic harmonic chime on unlock
  playUnlockChime() {
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.12);

        gain.gain.setValueAtTime(0, this.ctx.currentTime + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + idx * 0.12 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.12 + 0.9);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + idx * 0.12);
        osc.stop(this.ctx.currentTime + idx * 0.12 + 1.0);
      });
    } catch (e) {}
  }

  // Soft romantic click / pop sound
  playPop() {
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.09);
    } catch (e) {}
  }

  // Realistic instant camera shutter sound effect
  playShutter() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // 1. Shutter blade opening click
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(950, now);
      osc1.frequency.exponentialRampToValueAtTime(140, now + 0.045);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.05);

      // 2. Shutter mechanism closing click
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1200, now + 0.08);
      osc2.frequency.exponentialRampToValueAtTime(160, now + 0.15);
      gain2.gain.setValueAtTime(0.24, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.16);
    } catch (e) {}
  }

  // Apple-style crystal double Face ID verification chime
  playFaceIDSuccess() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // First soft crystal chime
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1318.5, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.2, now + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.09);

      // Second higher crystal chime (Face ID confirmation)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, now + 0.1);
      gain2.gain.setValueAtTime(0, now + 0.1);
      gain2.gain.linearRampToValueAtTime(0.25, now + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.4);
    } catch (e) {}
  }

  // Biometric mismatch tone when an unauthorized face is detected
  playFaceIDMismatch() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(160, now + 0.1);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (e) {}
  }

  // Wax seal snap sound
  playWaxCrack() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {}
  }
}

const sfx = new SoundFX();

// ==========================================================================
// PURE MP3 ROMANTIC MUSIC PLAYER WITH LIVE REAL-TIME SYNC
// ==========================================================================
class RomanticMusicPlayer {
  constructor() {
    this.isPlaying = false;
    this.isReceivingRemoteSync = false;
    this.audio = document.getElementById('romantic-audio');
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.id = 'romantic-audio';
      document.body.appendChild(this.audio);
    }

    // Always ensure unambiguous absolute URL for the MP3
    const mp3Url = new URL('assets/music/ay_tenli_kadin.mp3', window.location.href).href;
    if (!this.audio.src || !this.audio.src.includes('ay_tenli_kadin.mp3')) {
      this.audio.src = mp3Url;
    }

    this.audio.preload = 'auto';
    this.audio.loop = true;
    this.audio.volume = 1.0;
    this.audio.muted = false;

    // Start loading the audio immediately
    try { this.audio.load(); } catch (e) {}

    this.progress = 0;
    this.duration = 196; // 3:16 (Ay Tenli Kadın actual track duration)
    this.vinyl = document.getElementById('vinyl-record');
    this.playBtn = document.getElementById('player-play-btn');
    this.prevBtn = document.querySelector('.player-btn[title="Önceki"]');
    this.nextBtn = document.querySelector('.player-btn[title="Sonraki"]');
    this.progressBar = document.getElementById('player-progress-fill');
    this.currentTimeEl = document.getElementById('player-current-time');
    this.totalTimeEl = document.getElementById('player-total-time');

    this.init();
  }

  broadcastState(action, customTime) {
    if (this.isReceivingRemoteSync) return;
    const time = (typeof customTime === 'number') ? customTime : (this.audio ? this.audio.currentTime : 0);
    const isPlaying = (action === 'play') ? true : (action === 'pause' ? false : !this.audio.paused);
    const payload = {
      type: 'music_sync',
      action: action || 'seek',
      currentTime: Math.round(time * 100) / 100,
      isPlaying: isPlaying,
      sender: window.LiveP2P ? window.LiveP2P.myId : 'local',
      timestamp: Date.now()
    };

    // 1. Instant WebRTC PeerJS Broadcast
    if (window.LiveP2P) {
      window.LiveP2P.send(payload);
    }

    // 2. CloudSync Netlify Blobs Backend
    if (window.CloudSync) {
      window.CloudSync.save('music_state', payload);
    }
  }

  applyRemoteSync(data) {
    if (!data || typeof data.currentTime !== 'number') return;
    if (window.LiveP2P && data.sender === window.LiveP2P.myId) return;

    // Discard outdated sync older than 35s
    if (data.timestamp && (Date.now() - data.timestamp) > 35000) return;

    // Protect against feedback loop
    this.isReceivingRemoteSync = true;
    setTimeout(() => { this.isReceivingRemoteSync = false; }, 900);

    const localTime = this.audio ? this.audio.currentTime : 0;
    const timeDiff = Math.abs(localTime - data.currentTime);

    // Sync position if seek event or drift > 1.2s
    if (data.action === 'seek' || timeDiff > 1.2) {
      if (this.audio) {
        this.audio.currentTime = data.currentTime;
      }
      this.progress = data.currentTime;
      this.updateProgressUI();
    }

    // Sync play/pause state
    if (data.isPlaying && (this.audio.paused || !this.isPlaying)) {
      this.play(false);
    } else if (!data.isPlaying && (!this.audio.paused || this.isPlaying)) {
      this.pause(false);
    }
  }

  seek(targetTime, broadcast = true) {
    if (!this.audio) return;
    const dur = (this.audio.duration && !isNaN(this.audio.duration)) ? this.audio.duration : this.duration;
    const clamped = Math.max(0, Math.min(dur, targetTime));
    this.audio.currentTime = clamped;
    this.progress = clamped;
    this.updateProgressUI();

    if (broadcast) {
      this.broadcastState('seek', clamped);
    }
  }

  init() {
    // 1. Play / Pause Button in Spotify Card
    if (this.playBtn) {
      this.playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }

    // 2. Clickable Vinyl Record
    if (this.vinyl) {
      this.vinyl.style.cursor = 'pointer';
      this.vinyl.title = "Müziği Başlat / Duraklat";
      this.vinyl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }

    // 3. Header Music Quick Toggle Button & Hamburger Menu Music Button
    const headerMusicBtn = document.getElementById('header-music-btn');
    if (headerMusicBtn) {
      headerMusicBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }
    const menuMusicBtn = document.getElementById('menu-music-btn');
    if (menuMusicBtn) {
      menuMusicBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }

    // 4. Previous and Next buttons (Rewind to start, broadcast & play)
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.seek(0, true);
        this.play(true);
      });
    }
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.seek(0, true);
        this.play(true);
      });
    }

    // 5. Audio native events (single source of truth for UI state)
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      if (this.vinyl) this.vinyl.classList.add('spinning');
      this.updatePlayBtnIcon(true);
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      if (this.vinyl) this.vinyl.classList.remove('spinning');
      this.updatePlayBtnIcon(false);
    });

    this.audio.addEventListener('timeupdate', () => {
      this.progress = this.audio.currentTime;
      if (this.audio.duration && !isNaN(this.audio.duration)) {
        this.duration = this.audio.duration;
      }
      this.updateProgressUI();
    });

    const updateDuration = () => {
      if (this.audio.duration && !isNaN(this.audio.duration)) {
        this.duration = this.audio.duration;
        this.formatTotalTime(this.duration);
      }
    };
    this.audio.addEventListener('loadedmetadata', updateDuration);
    this.audio.addEventListener('canplay', updateDuration);
    this.audio.addEventListener('durationchange', updateDuration);

    this.audio.addEventListener('ended', () => {
      this.seek(0, true);
      this.play(true);
    });

    // 6. Interactive Seek & Live Scrubbing on Progress Bar
    const barWrap = document.querySelector('.player-progress-bar');
    if (barWrap) {
      barWrap.style.cursor = 'pointer';

      const calculateTargetTime = (e) => {
        const rect = barWrap.getBoundingClientRect();
        const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : (e.clientX !== undefined ? e.clientX : 0);
        const clickX = clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        const dur = (this.audio.duration && !isNaN(this.audio.duration)) ? this.audio.duration : this.duration;
        return pct * dur;
      };

      barWrap.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetTime = calculateTargetTime(e);
        this.seek(targetTime, true);
        if (this.audio.paused) this.play(true);
      });

      let isScrubbing = false;

      const onScrubMove = (e) => {
        if (!isScrubbing) return;
        const targetTime = calculateTargetTime(e);
        this.seek(targetTime, false);
      };

      const onScrubEnd = (e) => {
        if (!isScrubbing) return;
        isScrubbing = false;
        const targetTime = calculateTargetTime(e);
        this.seek(targetTime, true);
        if (this.audio.paused) this.play(true);
      };

      barWrap.addEventListener('mousedown', (e) => {
        isScrubbing = true;
        const targetTime = calculateTargetTime(e);
        this.seek(targetTime, true);
      });
      window.addEventListener('mousemove', onScrubMove);
      window.addEventListener('mouseup', onScrubEnd);

      barWrap.addEventListener('touchstart', (e) => {
        isScrubbing = true;
        const targetTime = calculateTargetTime(e);
        this.seek(targetTime, true);
      }, { passive: true });
      window.addEventListener('touchmove', onScrubMove, { passive: true });
      window.addEventListener('touchend', onScrubEnd);
    }
  }

  formatTotalTime(seconds) {
    if (!this.totalTimeEl) return;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    this.totalTimeEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  toggle() {
    if (this.isPlaying || (!this.audio.paused && this.audio.currentTime > 0)) {
      this.pause(true);
    } else {
      this.play(true);
    }
  }

  play(broadcast = true) {
    if (!this.audio) return;
    this.audio.muted = false;
    this.audio.volume = 1.0;
    this.audio.loop = true;

    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        this.isPlaying = true;
        if (this.vinyl) this.vinyl.classList.add('spinning');
        this.updatePlayBtnIcon(true);
        if (broadcast) {
          this.broadcastState('play', this.audio.currentTime);
        }
      }).catch(err => {
        console.warn('Audio play waiting for user gesture:', err);
      });
    }
  }

  pause(broadcast = true) {
    if (!this.audio) return;
    try {
      this.audio.pause();
    } catch (e) {}
    this.isPlaying = false;
    if (this.vinyl) this.vinyl.classList.remove('spinning');
    this.updatePlayBtnIcon(false);
    if (broadcast) {
      this.broadcastState('pause', this.audio.currentTime);
    }
  }

  updateProgressUI() {
    if (this.progressBar) {
      const pct = (this.progress / this.duration) * 100;
      this.progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }
    if (this.currentTimeEl) {
      const m = Math.floor(this.progress / 60);
      const s = Math.floor(this.progress % 60);
      this.currentTimeEl.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
  }

  updatePlayBtnIcon(isPlaying) {
    if (this.playBtn) {
      this.playBtn.innerHTML = isPlaying ? `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1.5"/>
          <rect x="14" y="4" width="4" height="16" rx="1.5"/>
        </svg>
      ` : `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 2px;">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      `;
    }

    const headerMusicBtn = document.getElementById('header-music-btn');
    if (headerMusicBtn) {
      headerMusicBtn.style.color = isPlaying ? 'var(--primary)' : 'inherit';
    }

    const menuMusicTitle = document.getElementById('menu-music-title');
    const menuMusicDesc = document.getElementById('menu-music-desc');
    const menuMusicBadge = document.getElementById('menu-music-badge');
    const menuMusicIcon = document.querySelector('.dropdown-item-icon.music');
    if (menuMusicTitle) {
      menuMusicTitle.textContent = isPlaying ? 'Romantik Melodi (Çalıyor)' : 'Romantik Melodi (Durduruldu)';
    }
    if (menuMusicDesc) {
      menuMusicDesc.textContent = `Yalın - Ay Tenli Kadın (${isPlaying ? 'Çalıyor' : 'Durduruldu'})`;
    }
    if (menuMusicBadge) {
      menuMusicBadge.textContent = isPlaying ? '▶ Çalıyor' : '⏸ Duraklatıldı';
      menuMusicBadge.style.background = isPlaying ? 'rgba(244,63,94,0.15)' : 'rgba(100,116,139,0.12)';
      menuMusicBadge.style.color = isPlaying ? 'var(--primary)' : '#64748b';
    }
    if (menuMusicIcon) {
      menuMusicIcon.style.background = isPlaying ? 'linear-gradient(135deg, #f43f5e, #e11d48)' : 'rgba(244, 63, 94, 0.12)';
      menuMusicIcon.style.color = isPlaying ? '#ffffff' : 'var(--primary)';
    }
  }
}

// ==========================================================================
// PASSWORD GATE (24042008)
// ==========================================================================
function initPasswordGate() {
  const lockScreen = document.getElementById('lock-screen');
  const lockInput = document.getElementById('lock-password');
  const lockBtn = document.getElementById('lock-submit-btn');
  const lockCard = document.getElementById('lock-card');
  const lockError = document.getElementById('lock-error');
  const headerLockBtn = document.getElementById('header-lock-btn');

  // Check if previously unlocked in current session
  const isUnlocked = sessionStorage.getItem('ceylin_diary_unlocked') === 'true';
  if (isUnlocked && lockScreen) {
    lockScreen.classList.add('unlocked');
    lockScreen.style.display = 'none';
    document.body.classList.remove('site-locked');
  } else {
    // Freeze body scrolling so mobile users cannot scroll from the bottom!
    document.body.classList.add('site-locked');
  }

  function handleUnlock() {
    if (!lockInput) return;
    const entered = (lockInput.value || '').trim();
    if (entered === CONFIG.CORRECT_PIN) {
      // 1. Immediately dismiss mobile virtual keyboard
      lockInput.blur();

      // 2. Play unlock sound
      sfx.playUnlockChime();

      // 3. Mark as unlocked in session
      sessionStorage.setItem('ceylin_diary_unlocked', 'true');

      // 4. Remove scroll lock from body
      document.body.classList.remove('site-locked');
      if (window.refreshCanvasAfterUnlock) window.refreshCanvasAfterUnlock();

      // 5. Smoothly fade out lock screen and remove from display
      if (lockScreen) {
        lockScreen.classList.add('unlocked');
        setTimeout(() => {
          lockScreen.style.display = 'none';
        }, 600);
      }
      if (lockError) lockError.classList.remove('show');

      // 6. Auto-start real MP3 romantic music
      if (window.musicPlayer && !window.musicPlayer.isPlaying) {
        window.musicPlayer.play();
      }

      // 7. Confetti / heart burst celebration!
      try {
        if (window.romanticCanvas && window.romanticCanvas.createBurst) {
          window.romanticCanvas.createBurst(window.innerWidth / 2, window.innerHeight / 2, 35);
        }
      } catch (e) {}

    } else {
      // Failed!
      if (lockCard) {
        lockCard.classList.remove('shake-animation');
        void lockCard.offsetWidth; // Trigger reflow
        lockCard.classList.add('shake-animation');
      }
      if (lockError) lockError.classList.add('show');
      lockInput.value = '';
      setTimeout(() => {
        const unlockedNow = sessionStorage.getItem('ceylin_diary_unlocked') === 'true';
        if (!unlockedNow) lockInput.focus();
      }, 350);
    }
  }

  if (lockBtn) {
    lockBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleUnlock();
    });
    lockBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleUnlock();
    });
  }

  if (lockInput) {
    lockInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlock();
      }
    });

    // Instant unlock the exact millisecond 8 digits are typed
    lockInput.addEventListener('input', () => {
      const cleaned = lockInput.value.replace(/\D/g, '');
      if (cleaned !== lockInput.value) {
        lockInput.value = cleaned;
      }
      if (cleaned.length === 8) {
        handleUnlock();
      }
    });

    // Also support mobile paste
    lockInput.addEventListener('paste', () => {
      setTimeout(() => {
        const cleaned = lockInput.value.replace(/\D/g, '');
        lockInput.value = cleaned;
        if (cleaned.length === 8) {
          handleUnlock();
        }
      }, 50);
    });
  }

  // Global listener: on the very first touch/click anywhere, start music if unlocked
  const startOnFirstGesture = () => {
    const unlocked = sessionStorage.getItem('ceylin_diary_unlocked') === 'true';
    if (unlocked && window.musicPlayer && !window.musicPlayer.isPlaying) {
      window.musicPlayer.play();
    }
  };
  ['click', 'touchstart', 'touchend', 'keydown'].forEach(evt => {
    document.addEventListener(evt, startOnFirstGesture, { passive: true, once: true });
  });

  // Header re-lock button & Hamburger Menu re-lock button
  const handleSiteLock = () => {
    sessionStorage.removeItem('ceylin_diary_unlocked');
    if (typeof window.closeHeaderMenu === 'function') window.closeHeaderMenu();
    if (lockScreen) {
      lockScreen.style.display = 'flex';
      void lockScreen.offsetWidth;
      lockScreen.classList.remove('unlocked');
      document.body.classList.add('site-locked');
      if (lockInput) {
        lockInput.value = '';
        lockInput.focus();
      }
    }
  };
  if (headerLockBtn) {
    headerLockBtn.addEventListener('click', handleSiteLock);
  }
  const menuLockBtn = document.getElementById('menu-lock-btn');
  if (menuLockBtn) {
    menuLockBtn.addEventListener('click', handleSiteLock);
  }
}

// ==========================================================================
// LIVE LOVE COUNTER
// ==========================================================================
function initLoveCounter() {
  const daysEl = document.getElementById('counter-days');
  const hoursEl = document.getElementById('counter-hours');
  const minsEl = document.getElementById('counter-mins');
  const secsEl = document.getElementById('counter-secs');

  if (!daysEl) return;

  function update() {
    const now = new Date();
    const diffMs = now - CONFIG.START_DATE;

    if (diffMs < 0) {
      daysEl.textContent = '0';
      hoursEl.textContent = '00';
      minsEl.textContent = '00';
      secsEl.textContent = '00';
      return;
    }

    const totalSecs = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSecs / (3600 * 24));
    const hours = Math.floor((totalSecs % (3600 * 24)) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    daysEl.textContent = days.toLocaleString('tr-TR');
    hoursEl.textContent = hours < 10 ? '0' + hours : hours;
    minsEl.textContent = mins < 10 ? '0' + mins : mins;
    secsEl.textContent = secs < 10 ? '0' + secs : secs;
  }

  update();
  setInterval(update, 1000);
}

// ==========================================================================
// BOTTOM NAVIGATION BAR (SMOOTH SCROLL & ACTIVE TRACKER)
// ==========================================================================
function initBottomNav() {
  const navLinks = document.querySelectorAll('.bottom-nav .nav-link');
  const sections = document.querySelectorAll('section[id]');

  if (!navLinks.length || !sections.length) return;

  // Active state indicator on scroll
  const observerOptions = {
    root: null,
    rootMargin: '-30% 0px -50% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }, observerOptions);

  sections.forEach(sec => observer.observe(sec));

  // Click handler with offset
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href');
      const targetSection = document.querySelector(targetId);
      if (targetSection) {
        sfx.playPop();
        const headerOffset = 60;
        const elementPosition = targetSection.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ==========================================================================
// POLAROID GALLERY & CUSTOM MEMORIES (ÇOKLU FOTOĞRAF, TAM ALBÜM & TIKLAYINCA DÜZENLEME)
// ==========================================================================
function initGallery() {
  const galleryGrid = document.getElementById('gallery-grid');
  const countBadge = document.getElementById('memories-count-badge');
  const openAddBtn = document.getElementById('open-add-memory-btn');
  const albumTotalBadge = document.getElementById('album-total-badge');

  // Full Album Modal Elements
  const fullAlbumModal = document.getElementById('full-album-modal');
  const fullAlbumGrid = document.getElementById('full-album-grid');
  const fullAlbumClose = document.getElementById('full-album-close');
  const openFullAlbumBtn = document.getElementById('open-full-album-btn');
  const fullAlbumAddBtn = document.getElementById('full-album-add-btn');
  const fullAlbumCountBadge = document.getElementById('full-album-count-badge');

  // Add Memory Modal elements
  const addModal = document.getElementById('add-memory-modal');
  const addCloseBtn = document.getElementById('add-memory-close');
  const addForm = document.getElementById('add-memory-form');
  const dropzone = document.getElementById('memory-dropzone');
  const fileInput = document.getElementById('memory-file-input');
  const previewImg = document.getElementById('memory-preview-img');
  const multiPreviewStrip = document.getElementById('memory-multi-preview-strip');
  const uploadPlaceholder = document.getElementById('memory-upload-placeholder');
  const captionInput = document.getElementById('memory-caption-input');
  const tagInput = document.getElementById('memory-tag-input');
  const dateInput = document.getElementById('memory-date-input');

  // Lightbox elements
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxDate = document.getElementById('lightbox-date');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxChangeBtn = document.getElementById('lightbox-change-btn');
  const lightboxEditCaptionBtn = document.getElementById('lightbox-edit-caption-btn');
  const lightboxDelBtn = document.getElementById('lightbox-del-btn');
  const lightboxFileInput = document.getElementById('lightbox-file-input');
  const lightboxToast = document.getElementById('lightbox-toast');
  const lightboxPrevBtn = document.getElementById('lightbox-prev-btn');
  const lightboxNextBtn = document.getElementById('lightbox-next-btn');
  const lightboxDots = document.getElementById('lightbox-dots');

  if (!galleryGrid) return;

  const STORAGE_KEY = 'ce_custom_memories_v3';
  const DELETED_IDS_KEY = 'ce_deleted_memory_ids_v3';
  let selectedImagesArray = [];
  let activeLightboxMemoryId = null;
  let activePhotoIndex = 0;

  const DEFAULT_MEMORIES = [
    { id: 'mem-1', img: 'assets/images/photo1.jpg', images: ['assets/images/photo1.jpg'], tag: '#Anı 1', caption: 'İlk Adımlarımız' },
    { id: 'mem-2', img: 'assets/images/photo2.jpg', images: ['assets/images/photo2.jpg'], tag: '#Anı 2', caption: 'Gün Batımı ve Sen' },
    { id: 'mem-3', img: 'assets/images/photo3.jpg', images: ['assets/images/photo3.jpg'], tag: '#Anı 3', caption: 'Birlikte Kahve Molası' },
    { id: 'mem-4', img: 'assets/images/photo4.jpg', images: ['assets/images/photo4.jpg'], tag: '#Anı 4', caption: 'Işıkların Altında Masalımız' },
    { id: 'mem-5', img: 'assets/images/photo5.jpg', images: ['assets/images/photo5.jpg'], tag: '#Anı 5', caption: 'Deniz Kenarında Huzur' },
    { id: 'mem-6', img: 'assets/images/photo6.jpg', images: ['assets/images/photo6.jpg'], tag: '#Anı 6', caption: 'En Tatlı Hatıramız' }
  ];

  function getDeletedIds() {
    try {
      const raw = localStorage.getItem(DELETED_IDS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  function addDeletedId(id) {
    if (!id) return;
    try {
      const deleted = getDeletedIds();
      if (!deleted.includes(id)) {
        deleted.push(id);
        localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(deleted));
        if (window.CloudSync) window.CloudSync.save('deleted_memory_ids', deleted);
      }
    } catch (e) {}
  }

  function getMemories() {
    const deleted = getDeletedIds();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(m => !deleted.includes(m.id)).map(m => ({
            ...m,
            images: Array.isArray(m.images) && m.images.length > 0 ? m.images : [m.img]
          }));
        }
      }
      const rawV2 = localStorage.getItem('ce_custom_memories_v2');
      if (rawV2 !== null) {
        const parsedV2 = JSON.parse(rawV2);
        if (Array.isArray(parsedV2)) {
          const migrated = parsedV2.filter(m => !deleted.includes(m.id)).map(m => ({
            ...m,
            images: [m.img]
          }));
          saveMemories(migrated, false);
          return migrated;
        }
      }
    } catch(e) {
      console.warn('Error reading memories:', e);
    }

    const initial = DEFAULT_MEMORIES.filter(m => !deleted.includes(m.id));
    saveMemories(initial, false); // Asla buluttaki gerçek anıları varsayılanla ezme
    return initial;
  }

  function saveMemories(list, pushToCloud = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('LocalStorage limit for memories, pruning oldest locally:', e);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 25)));
      } catch (err2) {}
    }

    // Bulut senkronizasyonu her zaman çalıştırılır
    if (pushToCloud && window.CloudSync) {
      window.CloudSync.save('memories', list);
    }
    renderGallery();
  }

  window.reloadGallery = function() {
    renderGallery();
  };

  function showLightboxToast(msg) {
    if (!lightboxToast) return;
    lightboxToast.textContent = msg || 'Fotoğraf başarıyla güncellendi!';
    lightboxToast.classList.add('show');
    setTimeout(() => {
      lightboxToast.classList.remove('show');
    }, 2800);
  }

  function openLightbox(mem, photoIdx = 0) {
    activeLightboxMemoryId = mem.id;
    activePhotoIndex = photoIdx;

    const imgs = (Array.isArray(mem.images) && mem.images.length > 0) ? mem.images : [mem.img];
    if (activePhotoIndex >= imgs.length) activePhotoIndex = 0;

    if (lightboxImg) lightboxImg.src = imgs[activePhotoIndex];
    if (lightboxCaption) lightboxCaption.textContent = mem.caption;
    if (lightboxDate) {
      lightboxDate.textContent = mem.date || mem.tag || '';
      lightboxDate.style.display = (mem.date || mem.tag) ? 'block' : 'none';
    }

    // Multi-photo arrows and dots
    if (imgs.length > 1) {
      if (lightboxPrevBtn) lightboxPrevBtn.style.display = 'flex';
      if (lightboxNextBtn) lightboxNextBtn.style.display = 'flex';
      renderLightboxDots(imgs.length, activePhotoIndex);
    } else {
      if (lightboxPrevBtn) lightboxPrevBtn.style.display = 'none';
      if (lightboxNextBtn) lightboxNextBtn.style.display = 'none';
      if (lightboxDots) lightboxDots.innerHTML = '';
    }

    if (lightboxModal) lightboxModal.classList.add('open');
  }

  function renderLightboxDots(total, current) {
    if (!lightboxDots) return;
    lightboxDots.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = `lightbox-dot ${i === current ? 'active' : ''}`;
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const mem = getMemories().find(m => m.id === activeLightboxMemoryId);
        if (mem) openLightbox(mem, i);
      });
      lightboxDots.appendChild(dot);
    }
  }

  // Prev / Next Photo navigation in Lightbox
  if (lightboxPrevBtn) {
    lightboxPrevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mem = getMemories().find(m => m.id === activeLightboxMemoryId);
      if (!mem) return;
      const imgs = mem.images || [mem.img];
      activePhotoIndex = (activePhotoIndex - 1 + imgs.length) % imgs.length;
      openLightbox(mem, activePhotoIndex);
    });
  }

  if (lightboxNextBtn) {
    lightboxNextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mem = getMemories().find(m => m.id === activeLightboxMemoryId);
      if (!mem) return;
      const imgs = mem.images || [mem.img];
      activePhotoIndex = (activePhotoIndex + 1) % imgs.length;
      openLightbox(mem, activePhotoIndex);
    });
  }

  // Helper to create a polaroid card element
  function createPolaroidCard(m, idx) {
    const card = document.createElement('div');
    card.className = 'polaroid-card';
    if (m.id) card.setAttribute('data-id', m.id);

    const imgs = (Array.isArray(m.images) && m.images.length > 0) ? m.images : [m.img];
    const isMulti = imgs.length > 1;

    card.innerHTML = `
      <div class="polaroid-tape-top"></div>
      ${isMulti ? `<span class="polaroid-multi-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> ${imgs.length} Fotoğraf</span>` : ''}
      <button type="button" class="polaroid-del-btn" title="Bu anıyı sil" data-id="${m.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <button type="button" class="polaroid-quick-change-btn" title="Bu fotoğrafı değiştir" data-id="${m.id}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </button>
      <div class="polaroid-img-container">
        <img src="${imgs[0]}" alt="${escapeHtml(m.caption)}">
        <span class="polaroid-badge-date">${escapeHtml(m.tag || `#Anı ${idx + 1}`)}</span>
        <div class="polaroid-click-hint"><span>İncele & Seçenekler</span></div>
      </div>
      <div class="polaroid-text">${escapeHtml(m.caption)}</div>
      
      <!-- Tıklanınca beliren düzenleme/silme şeridi -->
      <div class="polaroid-active-toolbar">
        <button type="button" class="polaroid-action-pill btn-zoom" title="Büyüt">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Büyüt</span>
        </button>
        <button type="button" class="polaroid-action-pill btn-change" title="Fotoğrafı Değiştir">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>Değiştir</span>
        </button>
        <button type="button" class="polaroid-action-pill btn-edit" title="Notu Düzenle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span>Düzenle</span>
        </button>
        <button type="button" class="polaroid-action-pill danger btn-del" title="Anıyı Sil">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Sil</span>
        </button>
      </div>
    `;

    // Action pill handlers
    const zoomBtn = card.querySelector('.btn-zoom');
    if (zoomBtn) {
      zoomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx.playPop();
        openLightbox(m, 0);
      });
    }

    const changeBtn = card.querySelector('.btn-change');
    if (changeBtn) {
      changeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeLightboxMemoryId = m.id;
        if (lightboxFileInput) lightboxFileInput.click();
      });
    }

    const editBtn = card.querySelector('.btn-edit');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const memories = getMemories();
        const target = memories.find(item => item.id === m.id);
        if (!target) return;
        const newCap = prompt('Anı notunu düzenleyin:', target.caption);
        if (newCap !== null && newCap.trim()) {
          target.caption = newCap.trim();
          saveMemories(memories);
          try { sfx.playUnlockChime(); } catch(err) {}
        }
      });
    }

    const delBtn = card.querySelector('.btn-del') || card.querySelector('.polaroid-del-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`"${m.caption}" anısını silmek istediğinize emin misiniz?`)) {
          addDeletedId(m.id);
          const updated = getMemories().filter(item => item.id !== m.id);
          saveMemories(updated);
        }
      });
    }

    // Click on card: Toggles action toolbar (Seçenekleri Göster / Gizle)
    card.addEventListener('click', (e) => {
      // If clicked inside an action button or quick buttons, let their handlers handle it
      if (e.target.closest('.polaroid-active-toolbar') || e.target.closest('.polaroid-del-btn') || e.target.closest('.polaroid-quick-change-btn')) {
        return;
      }

      // If actions are already active and user taps the image specifically, open lightbox
      if (card.classList.contains('actions-active') && e.target.closest('.polaroid-img-container')) {
        sfx.playPop();
        openLightbox(m, 0);
        return;
      }

      // Toggle action toolbar on click
      sfx.playPop();
      card.classList.toggle('actions-active');
    });

    return card;
  }

  // Render Homepage (Son 3 Anı) & Full Album Modal (Tüm Anılar, 4'lü Izgara)
  function renderGallery() {
    const memories = getMemories();
    galleryGrid.innerHTML = '';
    if (fullAlbumGrid) fullAlbumGrid.innerHTML = '';

    if (countBadge) countBadge.textContent = memories.length;
    if (albumTotalBadge) albumTotalBadge.textContent = memories.length;
    if (fullAlbumCountBadge) fullAlbumCountBadge.textContent = `${memories.length} Anı`;

    if (!memories.length) {
      const emptyHtml = `
        <div class="gallery-empty-state">
          <span style="display:block; margin-bottom:12px;"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>
          <h3 style="font-family:var(--font-serif); font-size:1.3rem; color:var(--text-dark); margin-bottom:4px;">Henüz Albümde Fotoğraf Yok</h3>
          <p style="font-size:0.9rem; color:var(--text-muted);">Yukarıdaki <strong>+</strong> veya <strong>Şipşak</strong> butonu ile ilk anımızı ekleyebilirsin.</p>
        </div>
      `;
      galleryGrid.innerHTML = emptyHtml;
      if (fullAlbumGrid) fullAlbumGrid.innerHTML = emptyHtml;
      return;
    }

    // 1. Ana sayfada son eklenen 3 tanesi gözüksün
    const latestThree = memories.slice(0, 3);
    latestThree.forEach((m, idx) => {
      galleryGrid.appendChild(createPolaroidCard(m, idx));
    });

    // 2. Full Albüm modalında hepsi 4'lü ızgara düzeninde gözüksün
    if (fullAlbumGrid) {
      memories.forEach((m, idx) => {
        fullAlbumGrid.appendChild(createPolaroidCard(m, idx));
      });
    }
  }

  // Full Album Modal Open / Close Handlers
  if (openFullAlbumBtn) {
    openFullAlbumBtn.addEventListener('click', () => {
      sfx.playPop();
      renderGallery();
      if (fullAlbumModal) fullAlbumModal.classList.add('open');
    });
  }

  if (fullAlbumClose) {
    fullAlbumClose.addEventListener('click', () => {
      if (fullAlbumModal) fullAlbumModal.classList.remove('open');
    });
  }

  if (fullAlbumModal) {
    fullAlbumModal.addEventListener('click', (e) => {
      if (e.target === fullAlbumModal) {
        fullAlbumModal.classList.remove('open');
      }
    });
  }

  if (fullAlbumAddBtn) {
    fullAlbumAddBtn.addEventListener('click', () => {
      if (fullAlbumModal) fullAlbumModal.classList.remove('open');
      openAddModal();
    });
  }

  // Handle Photo Change via Lightbox Button or Direct Image Click
  if (lightboxImg && lightboxFileInput) {
    lightboxImg.setAttribute('title', 'Fotoğrafı Değiştirmek İçin Tıkla');
    lightboxImg.addEventListener('click', (e) => {
      e.stopPropagation();
      try { sfx.playPop(); } catch (err) {}
      lightboxFileInput.click();
    });
  }

  if (lightboxChangeBtn && lightboxFileInput) {
    lightboxChangeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try { sfx.playPop(); } catch (err) {}
      lightboxFileInput.click();
    });

    lightboxFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file || !activeLightboxMemoryId) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const tempImg = new Image();
        tempImg.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 900;
          let w = tempImg.width;
          let h = tempImg.height;

          if (w > h && w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }

          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(tempImg, 0, 0, w, h);

          const newImageDataUrl = canvas.toDataURL('image/jpeg', 0.82);

          const memories = getMemories();
          const targetMem = memories.find(item => item.id === activeLightboxMemoryId);
          if (targetMem) {
            if (!Array.isArray(targetMem.images)) targetMem.images = [targetMem.img];
            targetMem.images[activePhotoIndex] = newImageDataUrl;
            targetMem.img = targetMem.images[0];
            saveMemories(memories);

            if (lightboxImg) lightboxImg.src = newImageDataUrl;
            try { sfx.playUnlockChime(); } catch (err) {}
            showLightboxToast('Fotoğraf başarıyla değiştirildi!');
          }
        };
        tempImg.src = event.target.result;
      };
      reader.readAsDataURL(file);
      lightboxFileInput.value = '';
    });
  }

  // Delete from Lightbox
  if (lightboxDelBtn) {
    lightboxDelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeLightboxMemoryId) return;
      const memories = getMemories();
      const targetMem = memories.find(item => item.id === activeLightboxMemoryId);
      if (!targetMem) return;
      if (confirm(`"${targetMem.caption}" anısını silmek istediğine emin misin?`)) {
        addDeletedId(targetMem.id);
        const updated = memories.filter(item => item.id !== targetMem.id);
        saveMemories(updated);
        if (lightboxModal) lightboxModal.classList.remove('open');
      }
    });
  }

  // Handle Caption Edit via Lightbox
  if (lightboxEditCaptionBtn) {
    lightboxEditCaptionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeLightboxMemoryId) return;
      const memories = getMemories();
      const targetMem = memories.find(item => item.id === activeLightboxMemoryId);
      if (!targetMem) return;

      const newCap = prompt('Fotoğrafın altındaki notu düzenleyin:', targetMem.caption);
      if (newCap !== null && newCap.trim()) {
        targetMem.caption = newCap.trim();
        const newDate = prompt('Fotoğrafın tarihini düzenleyin:', targetMem.date || targetMem.tag || '');
        if (newDate !== null && newDate.trim()) {
          targetMem.date = newDate.trim();
          targetMem.tag = newDate.trim();
        }
        saveMemories(memories);
        if (lightboxCaption) lightboxCaption.textContent = targetMem.caption;
        if (lightboxDate) lightboxDate.textContent = targetMem.date || targetMem.tag || '';
        try { sfx.playUnlockChime(); } catch (err) {}
        showLightboxToast('Anı başarıyla güncellendi!');
      }
    });
  }

  // Expose memory adding helper for mobile Şipşak and external triggers
  window.addCustomMemory = function(newMem) {
    const current = getMemories();
    current.unshift(newMem);
    saveMemories(current);
  };
  window.refreshGallery = renderGallery;

  // Open & Close Modal
  function openAddModal() {
    sfx.playPop();
    resetModalForm();
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    if (addModal) addModal.classList.add('open');
  }

  function closeAddModal() {
    if (addModal) addModal.classList.remove('open');
    resetModalForm();
  }

  function resetModalForm() {
    selectedImagesArray = [];
    if (addForm) addForm.reset();
    if (previewImg) {
      previewImg.src = '';
      previewImg.style.display = 'none';
    }
    if (multiPreviewStrip) {
      multiPreviewStrip.innerHTML = '';
      multiPreviewStrip.style.display = 'none';
    }
    if (uploadPlaceholder) {
      uploadPlaceholder.style.display = 'flex';
    }
  }

  window.openAddModal = openAddModal;

  if (openAddBtn) openAddBtn.addEventListener('click', openAddModal);
  const menuAddBtn = document.getElementById('menu-add-memory-btn');
  if (menuAddBtn) {
    menuAddBtn.addEventListener('click', () => {
      if (typeof window.closeHeaderMenu === 'function') window.closeHeaderMenu();
      openAddModal();
    });
  }
  if (addCloseBtn) addCloseBtn.addEventListener('click', closeAddModal);
  if (addModal) {
    addModal.addEventListener('click', (e) => {
      if (e.target === addModal) closeAddModal();
    });
  }

  // Dropzone file selection (Birden fazla fotoğraf destekli)
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      selectedImagesArray = [];
      if (multiPreviewStrip) {
        multiPreviewStrip.innerHTML = '';
        multiPreviewStrip.style.display = 'flex';
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const tempImg = new Image();
            tempImg.onload = () => {
              const canvas = document.createElement('canvas');
              const maxDim = 800; // 800px polaroid çerçevesi için mükemmel keskinlik sağlar
              let width = tempImg.width;
              let height = tempImg.height;

              if (width > height && width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(tempImg, 0, 0, width, height);

              const dataUrl = canvas.toDataURL('image/jpeg', 0.72); // Hızlı bulut transferi ve hafıza tasarrufu
              selectedImagesArray.push(dataUrl);

              if (multiPreviewStrip) {
                const thumb = document.createElement('div');
                thumb.className = 'multi-preview-item';
                thumb.innerHTML = `<img src="${dataUrl}" alt="Önizleme">`;
                multiPreviewStrip.appendChild(thumb);
              }

              resolve();
            };
            tempImg.src = event.target.result;
          };
          reader.readAsDataURL(file);
        });
      }

      if (selectedImagesArray.length > 0) {
        if (uploadPlaceholder) uploadPlaceholder.style.display = 'none';
        if (previewImg) {
          previewImg.src = selectedImagesArray[0];
          previewImg.style.display = 'block';
        }
      }
    });
  }

  // Handle Form Submission
  if (addForm) {
    addForm.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!selectedImagesArray.length) {
        alert('Lütfen anınız için en az bir fotoğraf seçin.');
        return;
      }

      const caption = captionInput.value.trim();
      if (!caption) {
        alert('Lütfen fotoğrafın altına yazılacak notu yazın.');
        captionInput.focus();
        return;
      }

      const rawDate = dateInput && dateInput.value ? dateInput.value : new Date().toISOString().split('T')[0];
      const dParts = rawDate.split('-');
      const dObj = new Date(parseInt(dParts[0]), parseInt(dParts[1]) - 1, parseInt(dParts[2]));
      const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
      const formattedDate = `${dObj.getDate()} ${months[dObj.getMonth()]} ${dObj.getFullYear()}`;

      const memories = getMemories();
      const newMemory = {
        id: 'mem-' + Date.now(),
        img: selectedImagesArray[0],
        images: selectedImagesArray,
        date: formattedDate,
        tag: tagInput.value.trim() || formattedDate || `#Anı ${memories.length + 1}`,
        caption: caption
      };

      sfx.playUnlockChime();
      memories.unshift(newMemory);
      saveMemories(memories);
      closeAddModal();

      document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Lightbox Close Handlers
  if (lightboxClose && lightboxModal) {
    lightboxClose.addEventListener('click', () => {
      lightboxModal.classList.remove('open');
    });
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) {
        lightboxModal.classList.remove('open');
      }
    });
  }

  // Initial render
  renderGallery();
}

// ==========================================================================
// LOVE LETTER MODAL & BIOMETRIC FACE ID SEAL UNLOCK
// ==========================================================================
function initLoveLetter() {
  const envelope = document.getElementById('envelope-card');
  const letterModal = document.getElementById('letter-modal');
  const letterClose = document.getElementById('letter-modal-close');

  // Face ID Elements
  const faceIdModal = document.getElementById('face-id-modal');
  const faceIdCloseBtn = document.getElementById('face-id-close-btn');
  const faceIdProfilePill = document.getElementById('face-id-profile-pill');
  const faceIdProfileAvatar = document.getElementById('face-id-profile-avatar');
  const faceIdResetProfileBtn = document.getElementById('face-id-reset-profile-btn');
  const faceIdUnregisteredBanner = document.getElementById('face-id-unregistered-banner');
  const faceIdTitle = document.getElementById('face-id-title');
  const faceIdSubtitle = document.getElementById('face-id-subtitle');
  const faceIdVideo = document.getElementById('face-id-video');
  const faceIdCanvas = document.getElementById('face-id-canvas');
  const faceIdFallback = document.getElementById('face-id-fallback-avatar');
  const faceIdBrackets = document.getElementById('face-id-brackets');
  const faceIdLaser = document.getElementById('face-id-laser');
  const faceIdMesh = document.getElementById('face-id-mesh');
  const faceIdSuccessBadge = document.getElementById('face-id-success-badge');
  const faceIdMismatchBadge = document.getElementById('face-id-mismatch-badge');
  const faceIdLockIconWrap = document.getElementById('face-id-lock-icon-wrap');
  const faceIdLockShackle = document.getElementById('face-id-lock-shackle');
  const faceIdStatusText = document.getElementById('face-id-status-text');
  const faceIdProgressFill = document.getElementById('face-id-progress-fill');
  const faceIdEnrollControls = document.getElementById('face-id-enroll-controls');
  const faceIdCaptureBtn = document.getElementById('face-id-capture-btn');
  const faceIdUploadBtn = document.getElementById('face-id-upload-btn');
  const faceIdFileInput = document.getElementById('face-id-file-input');
  const faceIdMismatchActions = document.getElementById('face-id-mismatch-actions');
  const faceIdRetryBtn = document.getElementById('face-id-retry-btn');
  const faceIdPasscodeBtn = document.getElementById('face-id-passcode-btn');

  if (!envelope || !letterModal) return;

  const STORAGE_KEY = 'ceylin_face_profile_v2';
  const STORAGE_KEY_FALLBACK = 'ce_ceylin_face_profile_v2';
  let activeStream = null;
  let isScanning = false;
  let scanTimer = null;
  let modelsLoaded = false;
  let modelsLoadingPromise = null;
  let lastMismatchSoundTime = 0;

  // Passcode Box Elements inside Face ID Modal
  const passcodeWrap = document.getElementById('face-id-passcode-wrap');
  const pinInput = document.getElementById('face-id-pin-input');
  const pinSubmit = document.getElementById('face-id-pin-submit');
  const pinError = document.getElementById('face-id-pin-error');

  function showPasscodeBox() {
    if (passcodeWrap) {
      passcodeWrap.style.display = 'block';
      if (pinInput) setTimeout(() => pinInput.focus(), 100);
    }
  }

  function handlePasscodeUnlock() {
    if (!pinInput) return;
    const val = (pinInput.value || '').trim();
    if (val === CONFIG.CORRECT_PIN || val === '24042008') {
      pinInput.value = '';
      if (pinError) pinError.style.display = 'none';
      if (passcodeWrap) passcodeWrap.style.display = 'none';
      completeVerification(100);
    } else {
      if (pinError) pinError.style.display = 'block';
      pinInput.value = '';
      setTimeout(() => pinInput.focus(), 200);
    }
  }

  if (faceIdPasscodeBtn) {
    faceIdPasscodeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showPasscodeBox();
    });
  }

  if (pinSubmit) {
    pinSubmit.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePasscodeUnlock();
    });
  }

  if (pinInput) {
    pinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePasscodeUnlock();
      }
    });
    pinInput.addEventListener('input', () => {
      const cleaned = pinInput.value.replace(/\D/g, '');
      if (cleaned !== pinInput.value) pinInput.value = cleaned;
      if (cleaned.length === 8) {
        handlePasscodeUnlock();
      }
    });
  }

  // 1. Model Loading (Local /models with CDN fallback)
  async function ensureModelsLoaded() {
    if (modelsLoaded) return true;
    if (typeof faceapi === 'undefined') {
      // Wait up to 4 seconds for faceapi script to finish parsing
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (typeof faceapi !== 'undefined') break;
      }
      if (typeof faceapi === 'undefined') {
        console.warn('faceapi script is still loading...');
        return false;
      }
    }
    if (!modelsLoadingPromise) {
      modelsLoadingPromise = (async () => {
        try {
          if (faceapi.tf) {
            try {
              // Try WebGL first (hardware accelerated for mobile GPU)
              await faceapi.tf.setBackend('webgl');
            } catch (webglErr) {
              try {
                await faceapi.tf.setBackend('wasm');
              } catch (wasmErr) {
                try {
                  await faceapi.tf.setBackend('cpu');
                } catch (cpuErr) {}
              }
            }
            await faceapi.tf.ready();
          }

          const modelsBaseUri = new URL('models/', window.location.origin + window.location.pathname).href;
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(modelsBaseUri),
            faceapi.nets.faceLandmark68Net.loadFromUri(modelsBaseUri),
            faceapi.nets.faceRecognitionNet.loadFromUri(modelsBaseUri)
          ]);
          modelsLoaded = true;
          return true;
        } catch (err) {
          console.warn('Local models failed to load, trying CDN fallback...', err);
          try {
            if (faceapi.tf) await faceapi.tf.ready();
            const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
            await Promise.all([
              faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL),
              faceapi.nets.faceLandmark68Net.loadFromUri(CDN_URL),
              faceapi.nets.faceRecognitionNet.loadFromUri(CDN_URL)
            ]);
            modelsLoaded = true;
            return true;
          } catch (cdnErr) {
            console.error('FaceAPI models could not be loaded:', cdnErr);
            modelsLoadingPromise = null;
            return false;
          }
        }
      })();
    }
    return modelsLoadingPromise;
  }

  // Pre-load neural network models in background immediately
  ensureModelsLoaded();

  // Ceylin's permanent enrolled biometric face descriptor (128-dimensional vector)
  const CEYLIN_PERMANENT_DESCRIPTOR = [
    -0.074027881026268,0.07342575490474701,0.05002439022064209,-0.10077854245901108,-0.06391454488039017,
    -0.036328595131635666,-0.17104332149028778,-0.10604164749383926,0.2479996532201767,-0.16906726360321045,
    0.12048979103565216,-0.06375735998153687,-0.1615612506866455,0.040625106543302536,-0.07611458003520966,
    0.19079157710075378,-0.08505909889936447,-0.15863683819770813,-0.12087155133485794,-0.012399961240589619,
    0.060151200741529465,0.017062194645404816,-0.018105167895555496,0.08280761539936066,-0.1180766373872757,
    -0.2980552017688751,-0.010601368732750416,-0.09145908802747726,-0.060108959674835205,-0.06046266853809357,
    0.0026057453360408545,0.03953627496957779,-0.15369102358818054,-0.0023963258136063814,-0.005337419919669628,
    0.12670329213142395,-0.02004183828830719,-0.07522217184305191,0.1630791574716568,-0.04756828024983406,
    -0.3301295340061188,-0.025882789865136147,0.011340465396642685,0.1972084492444992,0.2051974982023239,
    0.014742129482328892,0.03581611439585686,-0.1699332445859909,0.21110647916793823,-0.2284320890903473,
    -0.017222126945853233,0.13263218104839325,0.042402151972055435,0.06788600236177444,0.10578636825084686,
    -0.1690720170736313,0.08960116654634476,0.10073397308588028,-0.17032232880592346,-0.0378236249089241,
    0.039925914257764816,-0.03270067274570465,-0.046812403947114944,-0.13300924003124237,0.23751004040241241,
    0.10569294542074203,-0.13101522624492645,-0.1532171666622162,0.1672748178243637,-0.12293492257595062,
    -0.038479093462228775,0.12469115853309631,-0.13198168575763702,-0.19094806909561157,-0.3235180675983429,
    -0.09753391146659851,0.36968135833740234,0.08315687626600266,-0.1556219905614853,0.10876751691102982,
    -0.042322881519794464,0.021961305290460587,0.012229464948177338,0.1012592762708664,-0.022401485592126846,
    0.05859728530049324,-0.013115901499986649,-0.007156533654779196,0.22270478308200836,-0.05207674577832222,
    0.015425373800098896,0.15066929161548615,-0.031096985563635826,-0.025539394468069077,-0.04094800353050232,
    0.10890378803014755,-0.13511048257350922,0.03570256382226944,-0.11229801923036575,-0.018751680850982666,
    0.08364914357662201,0.02678225003182888,0.03269223868846893,0.0732225775718689,-0.24227270483970642,
    0.20441307127475739,-0.018067892640829086,0.056454822421073914,0.04933634027838707,0.052338406443595886,
    -0.05610711872577667,-0.030249396339058876,0.19539321959018707,-0.21073585748672485,0.15712261199951172,
    0.11600746959447861,0.0565151683986187,0.1259654462337494,0.060545194894075394,0.09664510190486908,
    -0.05577453598380089,0.019286926835775375,-0.2367297112941742,-0.06128797307610512,0.031168410554528236,
    -0.012193280272185802,0.03232381492853165,0.06975319981575012
  ];

  // 2. Profile Storage - Ceylin'in biyometrik yüz profili (Çoklu açı ve dinamik güncelleme destekli)
  function getSavedProfile() {
    const basePermanentDesc = new Float32Array(CEYLIN_PERMANENT_DESCRIPTOR);
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY_FALLBACK);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) {
          const validDescriptors = [];
          // 1. Çoklu deskriptör listesi varsa oku
          if (Array.isArray(parsed.descriptors)) {
            parsed.descriptors.forEach(d => {
              if (Array.isArray(d) && d.length === 128) {
                validDescriptors.push(new Float32Array(d));
              }
            });
          }
          // 2. Tekil ana deskriptörü kontrol et
          if (Array.isArray(parsed.descriptor) && parsed.descriptor.length === 128) {
            const single = new Float32Array(parsed.descriptor);
            if (!validDescriptors.some(d => faceapi.euclideanDistance(d, single) < 0.05)) {
              validDescriptors.unshift(single);
            }
          }
          // 3. Kalıcı Ceylin referans deskriptörünü de daima koru
          if (!validDescriptors.some(d => faceapi.euclideanDistance(d, basePermanentDesc) < 0.05)) {
            validDescriptors.push(basePermanentDesc);
          }

          if (validDescriptors.length > 0) {
            return {
              name: 'Ceylin',
              descriptor: validDescriptors[0],
              descriptors: validDescriptors,
              avatar: parsed.avatar || 'assets/images/photo2.jpg',
              enrolledAt: parsed.enrolledAt || '2 Kasım 2026'
            };
          }
        }
      }
    } catch (e) {
      console.error('Error reading profile:', e);
    }
    return {
      name: 'Ceylin',
      descriptor: basePermanentDesc,
      descriptors: [basePermanentDesc],
      avatar: 'assets/images/photo2.jpg',
      enrolledAt: '2 Kasım 2026'
    };
  }

  function saveProfile(descriptor, avatarUrl) {
    const existing = getSavedProfile();
    const newArr = Array.from(descriptor);
    let descList = [newArr];

    if (existing && Array.isArray(existing.descriptors)) {
      existing.descriptors.forEach(d => {
        const arr = Array.from(d);
        if (descList.length < 4) {
          const dist = faceapi.euclideanDistance(new Float32Array(newArr), new Float32Array(arr));
          if (dist > 0.06) {
            descList.push(arr);
          }
        }
      });
    }

    // Daima Ceylin'in orijinal referansını da tut
    if (!descList.some(d => faceapi.euclideanDistance(new Float32Array(d), new Float32Array(CEYLIN_PERMANENT_DESCRIPTOR)) < 0.05)) {
      descList.push(CEYLIN_PERMANENT_DESCRIPTOR);
    }

    const profile = {
      name: 'Ceylin',
      descriptor: newArr,
      descriptors: descList,
      avatar: avatarUrl || (existing ? existing.avatar : 'assets/images/photo2.jpg'),
      enrolledAt: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    };
    const jsonStr = JSON.stringify(profile);
    localStorage.setItem(STORAGE_KEY, jsonStr);
    localStorage.setItem(STORAGE_KEY_FALLBACK, jsonStr);
    if (window.CloudSync) window.CloudSync.save('face_id_profile', profile);
    return profile;
  }

  function clearProfile() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_FALLBACK);
  }

  // Helper: crop face thumbnail from video or image
  function cropFaceAvatar(sourceEl, box) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');
      const pad = Math.min(box.width, box.height) * 0.28;
      const sx = Math.max(0, box.x - pad);
      const sy = Math.max(0, box.y - pad);
      const totalWidth = sourceEl.videoWidth || sourceEl.naturalWidth || sourceEl.width || 400;
      const totalHeight = sourceEl.videoHeight || sourceEl.naturalHeight || sourceEl.height || 400;
      const sw = Math.min(totalWidth - sx, box.width + pad * 2);
      const sh = Math.min(totalHeight - sy, box.height + pad * 2);
      ctx.drawImage(sourceEl, sx, sy, sw, sh, 0, 0, 96, 96);
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch (e) {
      return '';
    }
  }

  // Helper: calculate realistic match similarity percentage based on 128-d cosine space
  function getCosineSimilarityPercent(distance) {
    const cosSim = 1 - (distance * distance) / 2;
    let percent;
    if (cosSim >= 0.86) {
      percent = 84 + ((cosSim - 0.86) / 0.14) * 15;
    } else {
      percent = Math.max(12, (cosSim / 0.86) * 72);
    }
    return Math.min(99, Math.round(percent));
  }

  // Camera Lifecycle
  async function startCamera() {
    if (activeStream) return true;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          activeStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 640 }
            }
          });
        } catch (e1) {
          activeStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }
          });
        }

        if (faceIdVideo && activeStream) {
          faceIdVideo.muted = true;
          faceIdVideo.playsInline = true;
          faceIdVideo.setAttribute('autoplay', 'true');
          faceIdVideo.setAttribute('playsinline', 'true');
          faceIdVideo.setAttribute('webkit-playsinline', 'true');
          faceIdVideo.setAttribute('muted', 'true');
          faceIdVideo.srcObject = activeStream;
          faceIdVideo.style.display = 'block';
          if (faceIdFallback) faceIdFallback.style.display = 'none';
          try {
            await faceIdVideo.play();
          } catch(pErr) {}
          await new Promise(resolve => {
            if (faceIdVideo.readyState >= 2) return resolve();
            faceIdVideo.onloadedmetadata = () => {
              faceIdVideo.play().catch(() => {});
              resolve();
            };
            setTimeout(resolve, 800);
          });
          return true;
        }
      }
    } catch (err) {
      console.warn('Camera access unavailable or declined:', err);
    }

    if (faceIdVideo) faceIdVideo.style.display = 'none';
    if (faceIdFallback) faceIdFallback.style.display = 'flex';
    return false;
  }

  function stopCamera() {
    isScanning = false;
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = null;
    }
    if (activeStream) {
      try {
        activeStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      activeStream = null;
    }
    if (faceIdVideo) {
      faceIdVideo.srcObject = null;
    }
  }

  function resetScanVisuals() {
    if (faceIdLaser) faceIdLaser.style.display = 'block';
    if (faceIdSuccessBadge) faceIdSuccessBadge.classList.remove('show');
    if (faceIdMismatchBadge) faceIdMismatchBadge.classList.remove('show');
    if (faceIdLockIconWrap) faceIdLockIconWrap.classList.remove('unlocked', 'mismatched');
    if (faceIdLockShackle) {
      faceIdLockShackle.setAttribute('d', 'M7 11V7a5 5 0 0 1 10 0v4');
    }
    if (faceIdBrackets) {
      faceIdBrackets.classList.remove('matched', 'mismatch');
    }
    if (faceIdMismatchActions) {
      faceIdMismatchActions.style.display = 'none';
    }
    if (faceIdProgressFill) {
      faceIdProgressFill.style.background = 'linear-gradient(90deg, var(--primary) 0%, #10b981 100%)';
      faceIdProgressFill.style.width = '0%';
    }
    if (passcodeWrap) {
      passcodeWrap.style.display = 'none';
    }
    if (pinError) {
      pinError.style.display = 'none';
    }
  }

  function updateUIForState() {
    const profile = getSavedProfile();
    resetScanVisuals();

    // Permanent Verification Mode (Zero Enrollment Prompts)
    if (faceIdProfilePill) {
      faceIdProfilePill.style.display = 'inline-flex';
      if (faceIdProfileAvatar) {
        faceIdProfileAvatar.src = (profile && profile.avatar) ? profile.avatar : 'assets/images/photo2.jpg';
      }
    }
    if (faceIdUnregisteredBanner) faceIdUnregisteredBanner.style.display = 'none';
    if (faceIdTitle) faceIdTitle.textContent = "Face ID ile Mührü Aç";
    if (faceIdSubtitle) faceIdSubtitle.textContent = "Bu mektup sadece Ceylin'in gözlerine mühürlendi. Lütfen yüzünü kameraya göster sevgilim...";
    if (faceIdEnrollControls) faceIdEnrollControls.style.display = 'none';
    if (faceIdMismatchActions) faceIdMismatchActions.style.display = 'none';
    if (faceIdStatusText) faceIdStatusText.textContent = "Kamera açıldı, yüz taranıyor...";
    if (faceIdProgressFill) faceIdProgressFill.style.width = '30%';
  }

  // Complete successful verification
  function completeVerification(similarity = 96) {
    isScanning = false;
    if (scanTimer) clearTimeout(scanTimer);

    if (faceIdStatusText) {
      faceIdStatusText.innerHTML = `<strong style="color:#10b981;">Doğrulandı: Ceylin'in Yüzü (Eşleşme: %${similarity})</strong>`;
    }
    if (faceIdProgressFill) {
      faceIdProgressFill.style.background = 'linear-gradient(90deg, var(--primary) 0%, #10b981 100%)';
      faceIdProgressFill.style.width = '100%';
    }
    if (faceIdLaser) faceIdLaser.style.display = 'none';
    if (faceIdSuccessBadge) faceIdSuccessBadge.classList.add('show');
    if (faceIdMismatchBadge) faceIdMismatchBadge.classList.remove('show');
    if (faceIdBrackets) {
      faceIdBrackets.classList.remove('mismatch');
      faceIdBrackets.classList.add('matched');
    }

    // Unlock icon animation
    if (faceIdLockIconWrap) {
      faceIdLockIconWrap.classList.remove('mismatched');
      faceIdLockIconWrap.classList.add('unlocked');
    }
    if (faceIdLockShackle) {
      faceIdLockShackle.setAttribute('d', 'M7 7a5 5 0 0 1 10 0v0');
    }

    try { sfx.playFaceIDSuccess(); } catch(e) {}
    try { sfx.playWaxCrack(); } catch(e) {}

    // Heart burst celebration
    try {
      if (window.romanticCanvas && window.romanticCanvas.createBurst) {
        window.romanticCanvas.createBurst(window.innerWidth / 2, window.innerHeight / 2, 32);
      }
    } catch (e) {}

    // Envelope wax seal crack
    const waxSeal = envelope.querySelector('.wax-seal');
    if (waxSeal) {
      waxSeal.classList.add('seal-cracking');
      setTimeout(() => waxSeal.classList.remove('seal-cracking'), 2000);
    }

    // Open letter modal smoothly
    setTimeout(() => {
      closeFaceId();
      document.body.classList.add('letter-active');
      document.body.classList.add('modal-open');
      if (letterModal) letterModal.classList.add('open');
      try { sfx.playUnlockChime(); } catch(e) {}
    }, 1000);
  }

  // Live Verification Scan Loop (Frame by frame)
  async function startVerificationScan() {
    const cameraOk = await startCamera();
    if (!cameraOk) {
      if (faceIdStatusText) {
        faceIdStatusText.innerHTML = '<span style="color:#f43f5e; font-weight:600;">Kameraya erişilemedi. Mührü aşk şifremizle açabilirsiniz:</span>';
      }
      showPasscodeBox();
      return;
    }

    const modelsReady = await ensureModelsLoaded();
    if (!modelsReady) {
      if (faceIdStatusText) {
        faceIdStatusText.innerHTML = '<span>Face ID hazırlanıyor... veya şifre ile mührü açabilirsiniz:</span>';
      }
      showPasscodeBox();
    }

    isScanning = true;
    let consecutiveMatches = 0;
    let mismatchCount = 0;
    let scanAttemptStartTime = Date.now();

    async function scanFrame() {
      if (!isScanning) return;

      if (!faceIdVideo || faceIdVideo.readyState < 2) {
        if (Date.now() - scanAttemptStartTime > 4000) {
          if (faceIdStatusText) {
            faceIdStatusText.innerHTML = '<span>Kamera bekleniyor... Dilerseniz şifreyle açabilirsiniz:</span>';
          }
          showPasscodeBox();
        }
        scanTimer = setTimeout(scanFrame, 250);
        return;
      }

      try {
        if (!modelsLoaded) {
          await ensureModelsLoaded();
          if (!modelsLoaded) {
            scanTimer = setTimeout(scanFrame, 500);
            return;
          }
        }

        const detection = await faceapi.detectSingleFace(
          faceIdVideo,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.22 })
        ).withFaceLandmarks().withFaceDescriptor();

        if (!isScanning) return;

        if (!detection) {
          consecutiveMatches = 0;
          if (faceIdBrackets) faceIdBrackets.classList.remove('matched', 'mismatch');
          if (faceIdStatusText) faceIdStatusText.textContent = "Kameraya bakın... Yüz aranıyor";
          if (faceIdProgressFill) faceIdProgressFill.style.width = '35%';
          scanTimer = setTimeout(scanFrame, 220);
          return;
        }

        const profile = getSavedProfile();

        // 2. Compare descriptors with Ceylin's permanent & multi-enrolled profiles
        const descriptorsToCompare = (profile.descriptors && profile.descriptors.length > 0)
          ? profile.descriptors
          : [profile.descriptor];

        let minDistance = 999;
        for (const targetDesc of descriptorsToCompare) {
          const d = faceapi.euclideanDistance(targetDesc, detection.descriptor);
          if (d < minDistance) minDistance = d;
        }

        const distance = minDistance;
        const similarity = getCosineSimilarityPercent(distance);

        // Distance threshold: 0.595 (iPhone ve farklı ışıklarda Ceylin'i güvenle tanır, yabancıyı KESİNLİKLE reddeder)
        if (distance < 0.595) {
          consecutiveMatches++;
          if (faceIdBrackets) {
            faceIdBrackets.classList.remove('mismatch');
            faceIdBrackets.classList.add('matched');
          }
          if (faceIdStatusText) {
            faceIdStatusText.innerHTML = `<span style="color:#10b981; font-weight:600;">Ceylin algılandı (%${similarity})... Mühür Açılıyor</span>`;
          }
          if (faceIdProgressFill) faceIdProgressFill.style.width = '100%';

          completeVerification(similarity);
          return;
        } else {
          // BAŞKASI GÖRDÜ / YABANCI YÜZ: KESİNLİKLE HATA VER!
          mismatchCount++;
          consecutiveMatches = 0;
          if (faceIdBrackets) {
            faceIdBrackets.classList.remove('matched');
            faceIdBrackets.classList.add('mismatch');
          }
          if (faceIdMismatchBadge) {
            faceIdMismatchBadge.classList.add('show');
            setTimeout(() => {
              if (faceIdMismatchBadge) faceIdMismatchBadge.classList.remove('show');
            }, 800);
          }
          if (faceIdLockIconWrap) {
            faceIdLockIconWrap.classList.remove('unlocked');
            faceIdLockIconWrap.classList.add('mismatched');
            setTimeout(() => {
              if (faceIdLockIconWrap) faceIdLockIconWrap.classList.remove('mismatched');
            }, 600);
          }

          if (faceIdStatusText) {
            faceIdStatusText.innerHTML = `<strong style="color:#e11d48; font-size:0.95rem; display:block;">⛔ HATA: Yabancı Yüz Algılandı! Bu mektup sadece Ceylin'e özeldir (%${similarity}).</strong>`;
          }
          if (faceIdProgressFill) {
            faceIdProgressFill.style.background = '#e11d48';
            faceIdProgressFill.style.width = '100%';
          }

          const now = Date.now();
          if (now - lastMismatchSoundTime > 1600) {
            try { sfx.playFaceIDMismatch(); } catch(e) {}
            lastMismatchSoundTime = now;
          }

          if (faceIdMismatchActions) {
            faceIdMismatchActions.style.display = 'flex';
          }

          showPasscodeBox();
        }
      } catch (err) {
        console.warn('Frame scan error:', err);
      }

      scanTimer = setTimeout(scanFrame, 300);
    }

    scanFrame();
  }

  // Face ID Update / Re-enroll buttons for Ceylin
  const faceIdUpdateCameraBtn = document.getElementById('face-id-update-camera-btn');
  const faceIdUpdateFileBtn = document.getElementById('face-id-update-file-btn');
  const faceIdPhotoInput = document.getElementById('face-id-photo-input');

  async function handleUpdateFaceFromCamera() {
    if (!faceIdVideo || faceIdVideo.readyState < 2) {
      if (faceIdStatusText) {
        faceIdStatusText.innerHTML = '<span style="color:#f43f5e; font-weight:600;">Kamera henüz hazır değil! Lütfen kameraya bakın veya fotoğraftan güncelleyin.</span>';
      }
      return;
    }

    if (faceIdStatusText) {
      faceIdStatusText.innerHTML = '<span style="color:var(--primary); font-weight:600;">📸 Yüzünüz taranıyor ve kaydediliyor... Lütfen kameraya bakın</span>';
    }

    try {
      await ensureModelsLoaded();
      const detection = await faceapi.detectSingleFace(
        faceIdVideo,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.20 })
      ).withFaceLandmarks().withFaceDescriptor();

      if (detection) {
        const avatarUrl = cropFaceAvatar(faceIdVideo, detection.detection.box);
        const updatedProfile = saveProfile(detection.descriptor, avatarUrl);
        if (faceIdProfileAvatar) {
          faceIdProfileAvatar.src = avatarUrl || updatedProfile.avatar;
        }
        if (faceIdStatusText) {
          faceIdStatusText.innerHTML = '<strong style="color:#10b981;">✅ Harika! Ceylin\'in yeni yüzü başarıyla kaydedildi ve buluta eşitlendi.</strong>';
        }
        try { sfx.playSuccess(); } catch (e) {}
        setTimeout(() => {
          completeVerification(99);
        }, 800);
      } else {
        if (faceIdStatusText) {
          faceIdStatusText.innerHTML = '<span style="color:#f43f5e; font-weight:600;">Kamerada yüz bulunamadı! Lütfen yüzünüzü çerçevenin ortasına getirin.</span>';
        }
      }
    } catch (err) {
      console.error('Update face error:', err);
      if (faceIdStatusText) {
        faceIdStatusText.innerHTML = '<span style="color:#f43f5e;">Yüz güncellenirken hata oluştu. Şifreyle açmayı deneyin.</span>';
      }
    }
  }

  if (faceIdUpdateCameraBtn) {
    faceIdUpdateCameraBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleUpdateFaceFromCamera();
    });
  }

  if (faceIdUpdateFileBtn && faceIdPhotoInput) {
    faceIdUpdateFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      faceIdPhotoInput.click();
    });

    faceIdPhotoInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (faceIdStatusText) {
        faceIdStatusText.innerHTML = '<span style="color:var(--primary); font-weight:600;">🖼️ Fotoğraf inceleniyor... Lütfen bekleyin</span>';
      }

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const img = new Image();
        img.onload = async () => {
          try {
            await ensureModelsLoaded();
            const detection = await faceapi.detectSingleFace(
              img,
              new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.18 })
            ).withFaceLandmarks().withFaceDescriptor();

            if (detection) {
              const avatarUrl = cropFaceAvatar(img, detection.detection.box);
              const updatedProfile = saveProfile(detection.descriptor, avatarUrl);
              if (faceIdProfileAvatar) {
                faceIdProfileAvatar.src = avatarUrl || updatedProfile.avatar;
              }
              if (faceIdStatusText) {
                faceIdStatusText.innerHTML = '<strong style="color:#10b981;">✅ Fotoğraftaki yüz Ceylin olarak başarıyla kaydedildi ve eşitlendi!</strong>';
              }
              try { sfx.playSuccess(); } catch (e) {}
              setTimeout(() => {
                completeVerification(99);
              }, 900);
            } else {
              if (faceIdStatusText) {
                faceIdStatusText.innerHTML = '<span style="color:#f43f5e; font-weight:600;">Seçilen fotoğrafta yüz algılanamadı! Lütfen net bir selfie seçin.</span>';
              }
            }
          } catch (detErr) {
            console.error('Photo detection error:', detErr);
          }
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      faceIdPhotoInput.value = '';
    });
  }

  // Retry button when mismatched
  if (faceIdRetryBtn) {
    faceIdRetryBtn.addEventListener('click', () => {
      if (faceIdMismatchActions) faceIdMismatchActions.style.display = 'none';
      if (faceIdBrackets) faceIdBrackets.classList.remove('mismatch');
      if (faceIdStatusText) faceIdStatusText.textContent = "Kamera taranıyor... Ceylin kameraya baksın";
      if (!isScanning) {
        startVerificationScan();
      }
    });
  }

  // Close Face ID
  function closeFaceId() {
    stopCamera();
    document.body.classList.remove('face-id-active');
    document.body.classList.remove('modal-open');
    if (faceIdModal) faceIdModal.classList.remove('open');
    if (passcodeWrap) passcodeWrap.style.display = 'none';
    if (pinError) pinError.style.display = 'none';
    if (pinInput) pinInput.value = '';
  }

  if (faceIdCloseBtn) faceIdCloseBtn.addEventListener('click', closeFaceId);
  if (faceIdModal) {
    faceIdModal.addEventListener('click', (e) => {
      if (e.target === faceIdModal) closeFaceId();
    });
  }

  // Open Face ID on envelope click
  envelope.addEventListener('click', async () => {
    try { sfx.playPop(); } catch (err) {}
    document.body.classList.add('face-id-active');
    document.body.classList.add('modal-open');
    resetScanVisuals();
    if (faceIdModal) faceIdModal.classList.add('open');
    updateUIForState();
    startVerificationScan();
  });

  // Close Love Letter Modal
  function closeLetter() {
    document.body.classList.remove('letter-active');
    document.body.classList.remove('modal-open');
    if (letterModal) letterModal.classList.remove('open');
  }

  if (letterClose) {
    letterClose.addEventListener('click', closeLetter);
  }
  letterModal.addEventListener('click', (e) => {
    if (e.target === letterModal) closeLetter();
  });

  // Expose Face ID UI updater for Cloud Sync
  window.refreshFaceIdUI = updateUIForState;
}

// ==========================================================================
// RANDOM LOVE QUOTE GENERATOR
// ==========================================================================
function initQuoteGenerator() {
  const bubble = document.getElementById('quote-bubble');
  const btn = document.getElementById('quote-btn');

  if (!bubble || !btn) return;

  btn.addEventListener('click', () => {
    sfx.playPop();
    const current = bubble.textContent;
    let nextQuote = current;
    while (nextQuote === current) {
      nextQuote = CONFIG.DEFAULT_QUOTES[Math.floor(Math.random() * CONFIG.DEFAULT_QUOTES.length)];
    }

    bubble.style.opacity = '0';
    bubble.style.transform = 'translateY(8px)';
    bubble.style.transition = 'all 0.25s ease';

    setTimeout(() => {
      bubble.textContent = nextQuote;
      bubble.style.opacity = '1';
      bubble.style.transform = 'translateY(0)';
    }, 250);
  });
}

// ==========================================================================
// BUCKET LIST / BİZİM DİLEKLERİMİZ (SWIPE-TO-DELETE: SOLA & SAĞA KAYDIRMA)
// ==========================================================================
function initBucketList() {
  const listEl = document.getElementById('bucket-list');
  const form = document.getElementById('bucket-form');
  const input = document.getElementById('bucket-input');

  if (!listEl) return;

  function createBucketItemElement(text, completed = false) {
    const li = document.createElement('li');
    li.className = `bucket-item ${completed ? 'completed' : ''}`;
    li.innerHTML = `
      <div class="bucket-delete-backdrop">
        <div class="delete-hint left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
          <span>Sil</span>
        </div>
        <div class="delete-hint right">
          <span>Sil</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
        </div>
      </div>
      <div class="bucket-item-surface">
        <div class="bucket-checkbox">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <span class="bucket-text">${escapeHtml(text)}</span>
        <button type="button" class="bucket-quick-del-btn" title="Dileği sil" aria-label="Dileği sil">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `;

    attachSwipeEvents(li);
    return li;
  }

  function attachSwipeEvents(item) {
    const surface = item.querySelector('.bucket-item-surface');
    const backdrop = item.querySelector('.bucket-delete-backdrop');
    const delBtn = item.querySelector('.bucket-quick-del-btn');
    const leftHint = backdrop ? backdrop.querySelector('.delete-hint.left') : null;
    const rightHint = backdrop ? backdrop.querySelector('.delete-hint.right') : null;

    if (!surface) return;

    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isDragging = false;
    let isHorizontal = false;
    let isDeleting = false;

    // Direct deletion without asking
    function deleteItemImmediately(direction = 1) {
      if (isDeleting) return;
      isDeleting = true;

      try { sfx.playPop(); } catch (e) {}

      surface.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.22s ease';
      surface.style.transform = `translateX(${direction > 0 ? '115%' : '-115%'})`;
      surface.style.opacity = '0';

      setTimeout(() => {
        item.classList.add('deleting');
        setTimeout(() => {
          item.remove();
          saveBucketList();
          if (typeof window.showProtectionToast === 'function') {
            window.showProtectionToast('Dilek silindi');
          }
        }, 320);
      }, 180);
    }

    // Direct delete button click (no confirmation prompt)
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItemImmediately(1);
      });
    }

    // Touch events for mobile phones (sola / sağa kaydırma)
    item.addEventListener('touchstart', (e) => {
      if (isDeleting) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      currentX = startX;
      isDragging = true;
      isHorizontal = false;
      surface.style.transition = 'none';
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
      if (!isDragging || isDeleting) return;
      const touch = e.touches[0];
      const diffX = touch.clientX - startX;
      const diffY = touch.clientY - startY;

      if (!isHorizontal) {
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
          isHorizontal = true;
        } else if (Math.abs(diffY) > 8) {
          isDragging = false;
          return;
        }
      }

      if (isHorizontal) {
        currentX = touch.clientX;
        surface.style.transform = `translateX(${diffX}px)`;

        if (diffX > 0) {
          if (leftHint) leftHint.style.opacity = Math.min(1, Math.abs(diffX) / 60);
          if (rightHint) rightHint.style.opacity = '0';
        } else {
          if (rightHint) rightHint.style.opacity = Math.min(1, Math.abs(diffX) / 60);
          if (leftHint) leftHint.style.opacity = '0';
        }
      }
    }, { passive: true });

    item.addEventListener('touchend', () => {
      if (!isDragging || isDeleting) return;
      isDragging = false;

      const diffX = currentX - startX;

      if (isHorizontal && Math.abs(diffX) >= 65) {
        // Swiped far enough -> DIRECT DELETE IMMEDIATELY (no "emin misin" question!)
        deleteItemImmediately(diffX > 0 ? 1 : -1);
      } else if (isHorizontal) {
        // Spring snap back
        surface.style.transition = 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        surface.style.transform = 'translateX(0px)';
        if (leftHint) leftHint.style.opacity = '0.5';
        if (rightHint) rightHint.style.opacity = '0.5';
      } else if (Math.abs(diffX) < 10) {
        // Tap -> toggle completed
        item.classList.toggle('completed');
        try { sfx.playPop(); } catch (err) {}
        saveBucketList();
      }
    });

    // Mouse / Pointer drag support for desktop
    item.addEventListener('pointerdown', (e) => {
      if (isDeleting || e.pointerType === 'touch') return;
      if (e.target.closest('.bucket-quick-del-btn')) return;

      startX = e.clientX;
      startY = e.clientY;
      currentX = startX;
      isDragging = true;
      isHorizontal = false;
      surface.style.transition = 'none';

      function onPointerMove(ev) {
        if (!isDragging || isDeleting) return;
        const diffX = ev.clientX - startX;
        const diffY = ev.clientY - startY;

        if (!isHorizontal && Math.abs(diffX) > 6) {
          isHorizontal = true;
        }

        if (isHorizontal) {
          currentX = ev.clientX;
          surface.style.transform = `translateX(${diffX}px)`;

          if (diffX > 0) {
            if (leftHint) leftHint.style.opacity = Math.min(1, Math.abs(diffX) / 60);
            if (rightHint) rightHint.style.opacity = '0';
          } else {
            if (rightHint) rightHint.style.opacity = Math.min(1, Math.abs(diffX) / 60);
            if (leftHint) leftHint.style.opacity = '0';
          }
        }
      }

      function onPointerUp() {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);

        if (!isDragging || isDeleting) return;
        isDragging = false;

        const diffX = currentX - startX;
        if (isHorizontal && Math.abs(diffX) >= 65) {
          // Direct delete on drag
          deleteItemImmediately(diffX > 0 ? 1 : -1);
        } else if (isHorizontal) {
          surface.style.transition = 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
          surface.style.transform = 'translateX(0px)';
          if (leftHint) leftHint.style.opacity = '0.5';
          if (rightHint) rightHint.style.opacity = '0.5';
        } else if (Math.abs(diffX) < 8) {
          item.classList.toggle('completed');
          try { sfx.playPop(); } catch (err) {}
          saveBucketList();
        }
      }

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });
  }

  // Add new item
  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;

      try { sfx.playPop(); } catch(e) {}
      const li = createBucketItemElement(val, false);
      listEl.appendChild(li);
      input.value = '';
      saveBucketList();
    });
  }

  function saveBucketList() {
    const items = [];
    listEl.querySelectorAll('.bucket-item').forEach(item => {
      const textEl = item.querySelector('.bucket-text');
      if (textEl) {
        items.push({
          text: textEl.textContent.trim(),
          completed: item.classList.contains('completed')
        });
      }
    });
    localStorage.setItem('ce_bucket_list_v2', JSON.stringify(items));
    if (window.CloudSync) window.CloudSync.save('bucket_list', items);
  }

  function loadBucketList() {
    localStorage.removeItem('ceylin_bucket_list');
    const saved = localStorage.getItem('ce_bucket_list_v2');

    if (saved) {
      try {
        const items = JSON.parse(saved);
        if (Array.isArray(items)) {
          listEl.innerHTML = '';
          items.forEach(it => {
            const li = createBucketItemElement(it.text, it.completed);
            listEl.appendChild(li);
          });
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }

    // Attach to any pre-rendered items from HTML
    listEl.querySelectorAll('.bucket-item').forEach(item => {
      attachSwipeEvents(item);
    });
  }

  loadBucketList();
  window.reloadBucketList = loadBucketList;
}

// ==========================================================================
// NEW DIARY ENTRY MODAL & STORAGE (ÖZEL HATIRA NOTLARI: DÜZENLEME & SİLME)
// ==========================================================================
function initDiaryEntries() {
  const addBtn = document.getElementById('open-add-diary-btn');
  const modal = document.getElementById('diary-modal');
  const closeBtn = document.getElementById('diary-modal-close');
  const form = document.getElementById('diary-form');
  const grid = document.getElementById('diary-grid');

  // Edit Modal Elements
  const editModal = document.getElementById('diary-edit-modal');
  const editClose = document.getElementById('diary-edit-modal-close');
  const editForm = document.getElementById('diary-edit-form');
  const editIdInput = document.getElementById('diary-edit-id');
  const editTitleInput = document.getElementById('diary-edit-title');
  const editTextInput = document.getElementById('diary-edit-text');

  if (!modal || !form || !grid) return;

  const STORAGE_KEY = 'ceylin_custom_entries_v4';
  const DELETED_KEY = 'ceylin_deleted_diary_ids_v4';

  const DEFAULT_DIARY_ENTRIES = [
    {
      id: 'diary-1',
      title: "Resmen 'Biz' Olduğumuz O Güzel Gün",
      date: '27 Eylül 2026',
      text: "27 Eylül 2026... Kalplerimizin birbirine mühürlendiği, el ele yepyeni bir masalın ilk sayfasına adım attığımız o eşsiz gün. Dünyanın en güzel başlangıcı seninle oldu...",
      stamp: 'assets/hearts/2.svg'
    },
    {
      id: 'diary-2',
      title: 'En Sevdiğim Gülüşün',
      date: 'Unutulmaz Bir An',
      text: "Bazen öyle içten ve tatlı gülüyorsun ki, içimdeki bütün yorgunluklar bir anda silinip gidiyor. Dünyanın en huzurlu yeri senin o sıcacık tebessümünün yanı...",
      stamp: 'assets/hearts/5.svg'
    },
    {
      id: 'diary-3',
      title: 'İyi ki Sen, Daima Sen',
      date: 'Bize Dair Not',
      text: "Birlikte yürüdüğümüz her yol, paylaştığımız her sessizlik bile seninle bir şiir gibi. Kalbimin en güvenli ve en sevgi dolu köşesi sana emanet bir tanem...",
      stamp: 'assets/hearts/12.svg'
    },
    {
      id: 'diary-4',
      title: 'Neden Biz? (C&E)',
      date: 'Özel İtiraf',
      text: "Çünkü biz birlikte bir bütün olduk; birbirimizin en yakın dostu, sırdaşı, neşesi, huzuru ve hayata gülümseme sebebiyiz...",
      stamp: 'assets/hearts/17.svg'
    }
  ];

  function getDeletedDiaryIds() {
    try {
      return JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function addDeletedDiaryId(id) {
    const list = getDeletedDiaryIds();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(DELETED_KEY, JSON.stringify(list));
      if (window.CloudSync) window.CloudSync.save('deleted_diary_ids', list);
    }
  }

  function getDiaryEntries() {
    const deleted = getDeletedDiaryIds();
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('ceylin_custom_entries');
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(e => !deleted.includes(e.id));
        }
      }
      // Migrate from old ceylin_custom_entries if present
      const rawOld = localStorage.getItem('ceylin_custom_entries');
      let initialList = [...DEFAULT_DIARY_ENTRIES];
      if (rawOld !== null) {
        try {
          const parsedOld = JSON.parse(rawOld);
          if (Array.isArray(parsedOld)) {
            parsedOld.forEach(oldItem => {
              if (oldItem && oldItem.title && !initialList.some(item => item.title === oldItem.title)) {
                initialList.unshift({
                  id: 'diary-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
                  title: oldItem.title,
                  date: oldItem.date || 'Özel Gün',
                  text: oldItem.text,
                  stamp: oldItem.stamp || 'assets/hearts/1.svg'
                });
              }
            });
          }
        } catch(err) {}
      }
      const filtered = initialList.filter(e => !deleted.includes(e.id));
      saveDiaryEntries(filtered, false);
      return filtered;
    } catch(e) {
      console.warn('Error reading diary entries:', e);
      return DEFAULT_DIARY_ENTRIES.filter(e => !deleted.includes(e.id));
    }
  }

  function saveDiaryEntries(entries, pushToCloud = true) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    localStorage.setItem('ceylin_custom_entries', JSON.stringify(entries));
    if (pushToCloud && window.CloudSync) window.CloudSync.save('diary', entries);
  }

  function renderDiaryGrid() {
    const entries = getDiaryEntries();
    grid.innerHTML = '';
    if (!entries.length) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--text-muted); font-size: 0.95rem;">
          Henüz özel hatıra notu bulunmuyor. Aşağıdaki butondan yeni bir tane ekleyebilirsiniz.
        </div>
      `;
      return;
    }

    entries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'diary-card';
      card.dataset.id = entry.id;
      card.innerHTML = `
        <div class="diary-card-header">
          <span class="diary-date">${escapeHtml(entry.date)}</span>
          <img src="${entry.stamp || 'assets/hearts/1.svg'}" alt="Heart" class="diary-stamp">
        </div>
        <h3 class="diary-card-title">
          <span>${escapeHtml(entry.title)}</span>
          <span class="diary-toggle-indicator">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </h3>
        <p class="diary-card-text">${escapeHtml(entry.text)}</p>
        <div class="diary-card-footer">
          <span class="diary-tag">#BizimAnımız</span>
          <div class="diary-card-actions">
            <button type="button" class="diary-action-btn edit" title="Notu Düzenle" data-id="${entry.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Düzenle</span>
            </button>
            <button type="button" class="diary-action-btn delete" title="Notu Sil" data-id="${entry.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span>Sil</span>
            </button>
          </div>
        </div>
      `;

      // Accordion toggle on click (sadece kart başlığına veya kartın boş alanına basınca)
      card.addEventListener('click', (e) => {
        if (e.target.closest('.diary-card-actions')) return;
        try { sfx.playPop(); } catch (err) {}
        card.classList.toggle('expanded');
      });

      // Edit Button
      const editBtn = card.querySelector('.diary-action-btn.edit');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditModal(entry.id);
        });
      }

      // Delete Button
      const delBtn = card.querySelector('.diary-action-btn.delete');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`"${entry.title}" hatıra notunu silmek istediğinize emin misiniz?`)) {
            addDeletedDiaryId(entry.id);
            const updated = getDiaryEntries().filter(item => item.id !== entry.id);
            saveDiaryEntries(updated);
            renderDiaryGrid();
            try { sfx.playPop(); } catch(err) {}
          }
        });
      }

      grid.appendChild(card);
    });
  }

  // Edit Modal Handlers
  function openEditModal(id) {
    const entries = getDiaryEntries();
    const entry = entries.find(item => item.id === id);
    if (!entry) return;

    if (editIdInput) editIdInput.value = entry.id;
    if (editTitleInput) editTitleInput.value = entry.title;
    if (editTextInput) editTextInput.value = entry.text;

    try { sfx.playPop(); } catch(err) {}
    if (editModal) editModal.classList.add('open');
  }

  function closeEditModal() {
    if (editModal) editModal.classList.remove('open');
  }

  if (editClose) {
    editClose.addEventListener('click', closeEditModal);
  }

  if (editModal) {
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) closeEditModal();
    });
  }

  if (editForm) {
    editForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = editIdInput ? editIdInput.value : '';
      const newTitle = editTitleInput ? editTitleInput.value.trim() : '';
      const newText = editTextInput ? editTextInput.value.trim() : '';

      if (!id || !newTitle || !newText) return;

      const entries = getDiaryEntries();
      const target = entries.find(item => item.id === id);
      if (target) {
        target.title = newTitle;
        target.text = newText;
        saveDiaryEntries(entries);
        try { sfx.playUnlockChime(); } catch(err) {}
        renderDiaryGrid();
        closeEditModal();
      }
    });
  }

  // Add Modal Handlers
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      sfx.playPop();
      modal.classList.add('open');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('open');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('diary-input-title').value.trim();
    const date = document.getElementById('diary-input-date').value.trim();
    const text = document.getElementById('diary-input-text').value.trim();

    if (!title || !text) return;

    try { sfx.playUnlockChime(); } catch(err) {}
    const newEntry = {
      id: 'diary-' + Date.now(),
      title,
      date: date || 'Özel Bir Gün',
      text,
      stamp: 'assets/hearts/1.svg'
    };

    const entries = getDiaryEntries();
    entries.unshift(newEntry);
    saveDiaryEntries(entries);
    renderDiaryGrid();

    form.reset();
    modal.classList.remove('open');
  });

  renderDiaryGrid();

  window.reloadDiary = renderDiaryGrid;
}

// ==========================================================================
// PINK LINED NOTEBOOK (ANI DEFTERİ) & TABLE OF CONTENTS (İÇİNDEKİLER) LOGIC
// ==========================================================================
function initPinkNotebook() {
  const dateDisplay = document.getElementById('notebook-date-display');
  const titleInput = document.getElementById('notebook-title');
  const contentInput = document.getElementById('notebook-content');
  const saveBtn = document.getElementById('notebook-save-btn');
  const newBtn = document.getElementById('notebook-new-btn');
  const statusMsg = document.getElementById('notebook-status-msg');

  // Table of Contents (İçindekiler) Elements
  const tocBtn = document.getElementById('notebook-toc-btn');
  const tocCountBadge = document.getElementById('toc-count-badge');
  const tocModal = document.getElementById('notebook-toc-modal');
  const tocCloseBtn = document.getElementById('notebook-toc-close');
  const tocSearchInput = document.getElementById('toc-search-input');
  const tocListContainer = document.getElementById('toc-list-container');

  if (!titleInput || !contentInput || !saveBtn) return;

  // Voice & Speech-to-Text Elements
  const speechBtn = document.getElementById('notebook-speech-btn');
  const speechLabel = document.getElementById('notebook-speech-label');
  const voiceRecordBtn = document.getElementById('notebook-voice-record-btn');
  const voiceStatusBox = document.getElementById('notebook-voice-recording-status');
  const recTimeDisplay = document.getElementById('notebook-rec-time');
  const recStopBtn = document.getElementById('notebook-rec-stop-btn');
  const recCancelBtn = document.getElementById('notebook-rec-cancel-btn');
  const audioPlayerWrap = document.getElementById('notebook-audio-player-wrap');
  const audioPlayBtn = document.getElementById('notebook-audio-play-btn');
  const playIcon = document.getElementById('notebook-play-icon');
  const pauseIcon = document.getElementById('notebook-pause-icon');
  const audioCurTime = document.getElementById('notebook-audio-cur-time');
  const audioTotalTime = document.getElementById('notebook-audio-total-time');
  const audioProgress = document.getElementById('notebook-audio-progress');
  const audioTrack = document.getElementById('notebook-audio-track');
  const audioDelBtn = document.getElementById('notebook-audio-del-btn');
  const pageAudioEl = document.getElementById('notebook-page-audio');

  let currentPageIndex = 0; // 0 = latest page
  let isNewDraft = false;
  let currentPageAudio = null;

  function setupAudioPlayer(audioDataUrl) {
    if (!audioPlayerWrap || !pageAudioEl) return;
    if (!audioDataUrl) {
      audioPlayerWrap.style.display = 'none';
      pageAudioEl.pause();
      pageAudioEl.src = '';
      if (playIcon) playIcon.style.display = 'block';
      if (pauseIcon) pauseIcon.style.display = 'none';
      return;
    }

    currentPageAudio = audioDataUrl;
    pageAudioEl.src = audioDataUrl;
    audioPlayerWrap.style.display = 'block';
    if (playIcon) playIcon.style.display = 'block';
    if (pauseIcon) pauseIcon.style.display = 'none';
    if (audioProgress) audioProgress.style.width = '0%';
    if (audioCurTime) audioCurTime.textContent = '0:00';

    pageAudioEl.onloadedmetadata = () => {
      if (audioTotalTime && pageAudioEl.duration) {
        audioTotalTime.textContent = formatAudioSec(pageAudioEl.duration);
      }
    };

    pageAudioEl.ontimeupdate = () => {
      if (!pageAudioEl.duration) return;
      const pct = (pageAudioEl.currentTime / pageAudioEl.duration) * 100;
      if (audioProgress) audioProgress.style.width = pct + '%';
      if (audioCurTime) audioCurTime.textContent = formatAudioSec(pageAudioEl.currentTime);
    };

    pageAudioEl.onended = () => {
      if (playIcon) playIcon.style.display = 'block';
      if (pauseIcon) pauseIcon.style.display = 'none';
      if (audioProgress) audioProgress.style.width = '0%';
    };
  }

  function formatAudioSec(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  }

  if (audioPlayBtn && pageAudioEl) {
    audioPlayBtn.addEventListener('click', () => {
      if (pageAudioEl.paused) {
        pageAudioEl.play();
        if (playIcon) playIcon.style.display = 'none';
        if (pauseIcon) pauseIcon.style.display = 'block';
      } else {
        pageAudioEl.pause();
        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon) pauseIcon.style.display = 'none';
      }
    });
  }

  if (audioTrack && pageAudioEl) {
    audioTrack.addEventListener('click', (e) => {
      const rect = audioTrack.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (pageAudioEl.duration) {
        pageAudioEl.currentTime = (clickX / rect.width) * pageAudioEl.duration;
      }
    });
  }

  if (audioDelBtn) {
    audioDelBtn.addEventListener('click', () => {
      if (confirm('Bu sayfadaki ses kaydını silmek istediğinize emin misiniz?')) {
        currentPageAudio = null;
        setupAudioPlayer(null);
      }
    });
  }

  // Speech-to-Text (Sesten Yazıya - Türkçe Web Speech API)
  let speechRec = null;
  let isListening = false;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (speechBtn) {
    speechBtn.addEventListener('click', () => {
      if (!SpeechRecognition) {
        alert('Tarayıcınız sesten yazıya özelliğini desteklemiyor. Lütfen Google Chrome veya Safari kullanın.');
        return;
      }

      if (isListening) {
        if (speechRec) speechRec.stop();
        return;
      }

      try {
        speechRec = new SpeechRecognition();
        speechRec.lang = 'tr-TR';
        speechRec.continuous = true;
        speechRec.interimResults = false;

        speechRec.onstart = () => {
          isListening = true;
          speechBtn.classList.add('listening');
          if (speechLabel) speechLabel.textContent = 'Dinleniyor...';
          try { sfx.playPop(); } catch(e) {}
        };

        speechRec.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              const text = event.results[i][0].transcript.trim();
              if (text) {
                if (contentInput.value.trim().length > 0) {
                  contentInput.value += ' ' + text;
                } else {
                  contentInput.value = text;
                }
              }
            }
          }
        };

        speechRec.onerror = () => {
          isListening = false;
          speechBtn.classList.remove('listening');
          if (speechLabel) speechLabel.textContent = 'Sesten Yazıya';
        };

        speechRec.onend = () => {
          isListening = false;
          speechBtn.classList.remove('listening');
          if (speechLabel) speechLabel.textContent = 'Sesten Yazıya';
        };

        speechRec.start();
      } catch(err) {
        console.warn('SpeechRecognition failed:', err);
      }
    });
  }

  // Voice Memo Audio Recording (MediaRecorder API)
  let mediaRec = null;
  let audioChunks = [];
  let voiceTimer = null;
  let voiceSecs = 0;

  if (voiceRecordBtn && voiceStatusBox && recStopBtn && recCancelBtn) {
    voiceRecordBtn.addEventListener('click', async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Cihazınız ses kaydı yapmayı desteklemiyor veya izin verilmedi.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        voiceSecs = 0;

        let options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
          if (MediaRecorder.isTypeSupported('audio/mp4')) {
            options = { mimeType: 'audio/mp4' };
          } else {
            options = {};
          }
        }

        mediaRec = new MediaRecorder(stream, options);

        mediaRec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRec.onstop = () => {
          clearInterval(voiceTimer);
          stream.getTracks().forEach(t => t.stop());
          voiceStatusBox.style.display = 'none';
          voiceRecordBtn.style.display = 'inline-flex';

          if (audioChunks.length > 0) {
            const blob = new Blob(audioChunks, { type: mediaRec.mimeType || 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
              currentPageAudio = reader.result;
              setupAudioPlayer(currentPageAudio);
              if (typeof window.showProtectionToast === 'function') {
                window.showProtectionToast('Sesli not kaydedildi. Kaydet butonuna dokunarak sayfayı saklayabilirsin.');
              }
            };
            reader.readAsDataURL(blob);
          }
        };

        mediaRec.start();
        voiceRecordBtn.style.display = 'none';
        voiceStatusBox.style.display = 'flex';
        recTimeDisplay.textContent = '00:00';

        voiceTimer = setInterval(() => {
          voiceSecs++;
          const mins = String(Math.floor(voiceSecs / 60)).padStart(2, '0');
          const secs = String(voiceSecs % 60).padStart(2, '0');
          recTimeDisplay.textContent = `${mins}:${secs}`;
        }, 1000);

        try { sfx.playPop(); } catch(e) {}
      } catch(err) {
        console.warn('Microphone error:', err);
        alert('Mikrofon erişimi sağlanamadı. Lütfen tarayıcınızdan mikrofon izni verin.');
      }
    });

    recStopBtn.addEventListener('click', () => {
      if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop();
    });

    recCancelBtn.addEventListener('click', () => {
      if (mediaRec && mediaRec.state !== 'inactive') {
        audioChunks = [];
        mediaRec.stop();
      }
      clearInterval(voiceTimer);
      voiceStatusBox.style.display = 'none';
      voiceRecordBtn.style.display = 'inline-flex';
    });
  }

  // Turkish date formatting helper with short day abbreviations (pzt, salı, prş etc.)
  function formatTurkishDate(d) {
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    const days = [
      'Paz', 'Pzt', 'Salı', 'Çrş', 'Prş', 'Cum', 'Cmt'
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${days[d.getDay()]}`;
  }

  function abbreviateDateString(str) {
    if (!str || typeof str !== 'string') return str;
    return str
      .replace(/Pazartesi/g, 'Pzt')
      .replace(/Pazar/g, 'Paz')
      .replace(/Çarşamba/g, 'Çrş')
      .replace(/Perşembe/g, 'Prş')
      .replace(/Cumartesi/g, 'Cmt')
      .replace(/Cuma/g, 'Cum');
  }

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Pink Notebook Storage Key (Empty by default for user to create from scratch)
  const STORAGE_KEY = 'ce_notebook_pages_v3';

  // One-time clear of legacy pre-seeded default pages so the user gets a fresh empty notebook
  try {
    if (!localStorage.getItem('ce_notebook_cleared_v3')) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('ce_notebook_pages_v2');
      localStorage.removeItem('ce_notebook_pages');
      localStorage.setItem('ce_notebook_cleared_v3', 'true');
    }
  } catch(e) {}

  function getPages() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((p, idx) => ({
            id: p.id || ('page-' + idx + '-' + Date.now()),
            dateISO: p.dateISO || toISODate(new Date()),
            dateFormatted: abbreviateDateString(p.dateFormatted) || formatTurkishDate(new Date()),
            title: p.title || '',
            content: p.content || '',
            audio: p.audio || null
          }));
        }
      }
    } catch(e) {
      console.warn('Error reading stored notebook pages:', e);
    }

    // Empty by default - ready for user to write their own pages
    return [];
  }

  function savePages(pages) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
      if (window.CloudSync) window.CloudSync.save('notebook', pages);
    } catch(e) {
      console.error('Error saving notebook pages:', e);
    }
    updateViews();
  }

  // Load a page by index into the notebook editor
  function loadPageByIndex(idx) {
    const pages = getPages();
    if (idx < 0 || idx >= pages.length) return;

    currentPageIndex = idx;
    isNewDraft = false;
    const page = pages[idx];

    titleInput.value = page.title || '';
    contentInput.value = page.content || '';
    currentPageAudio = page.audio || null;
    setupAudioPlayer(currentPageAudio);

    if (dateDisplay) dateDisplay.textContent = abbreviateDateString(page.dateFormatted) || '';

    updateViews();
  }

  // Render Table of Contents (İçindekiler) List Modal
  function renderTableOfContents(filterQuery = '') {
    if (!tocListContainer) return;
    try {
      const pages = getPages();
      tocListContainer.innerHTML = '';

      if (!pages.length) {
        tocListContainer.innerHTML = `
          <div style="text-align:center; padding:38px 16px; color:var(--text-muted); font-size:0.95rem;">
            <span style="display:block; margin-bottom:12px;"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span>
            <strong style="color:var(--text-dark); display:block; margin-bottom:6px; font-size:1.15rem; font-family:var(--font-serif);">Defterimiz Henüz Boş</strong>
            Defterimiz şu an tertemiz. İlk sayfamızı pembe sayfaya yazıp <strong>"Bu Günü Deftere Kaydet"</strong> butonuna dokunarak günlüğümüze ekleyebilirsin.
          </div>
        `;
        return;
      }

      const q = String(filterQuery || '').toLowerCase().trim();
      const filtered = pages.filter(p => {
        if (!q) return true;
        const titleStr = String(p.title || '').toLowerCase();
        const contentStr = String(p.content || '').toLowerCase();
        const dateStr = String(p.dateFormatted || '').toLowerCase();
        return titleStr.includes(q) || contentStr.includes(q) || dateStr.includes(q);
      });

      if (!filtered.length) {
        tocListContainer.innerHTML = `
          <div style="text-align:center; padding:36px 12px; color:var(--text-muted); font-size:0.95rem;">
            <span style="display:block; margin-bottom:12px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
            Aramanızla eşleşen bir defter sayfası bulunamadı.
          </div>
        `;
        return;
      }

      filtered.forEach((p) => {
        const originalIndex = pages.findIndex(item => item.id === p.id);
        const isCurrent = !isNewDraft && originalIndex === currentPageIndex;

        const card = document.createElement('div');
        card.className = `toc-card-item ${isCurrent ? 'active-in-editor' : ''}`;
        card.innerHTML = `
          <div class="toc-card-top">
            <span class="toc-item-date">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              ${escapeHtml(p.dateFormatted || '')}
            </span>
            <span class="toc-page-badge">
              Sayfa #${originalIndex + 1}${isCurrent ? ' (Açık)' : ''}${p.audio ? ' • 🎙️ Sesli Not' : ''}
            </span>
          </div>
          <h4 class="toc-item-title">${escapeHtml(p.title || 'Bizim Günümüz')}</h4>
          <p class="toc-item-snippet">${escapeHtml(p.content || '')}</p>
          <div class="toc-item-bottom">
            <span class="toc-item-open-btn">
              Sayfayı Defterde Aç →
            </span>
            <button type="button" class="toc-item-del-btn" title="Bu sayfayı defterden sil">Sayfayı Sil</button>
          </div>
        `;

        // Click card to open in notebook
        card.addEventListener('click', (e) => {
          if (e.target.closest('.toc-item-del-btn')) return;
          try { sfx.playPop(); } catch (err) {}
          loadPageByIndex(originalIndex);
          if (tocModal) tocModal.classList.remove('open');
          const diarySec = document.getElementById('diary');
          if (diarySec) {
            diarySec.scrollIntoView({ behavior: 'smooth' });
          }
        });

        // Delete page
        const delBtn = card.querySelector('.toc-item-del-btn');
        if (delBtn) {
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dateLabel = p.dateFormatted || p.dateISO || 'Bu';
            if (confirm(`"${dateLabel}" tarihli sayfayı defterden silmek istediğinize emin misiniz?`)) {
              const allPages = getPages();
              const removeIdx = allPages.findIndex(item => item.id === p.id);
              if (removeIdx >= 0) {
                allPages.splice(removeIdx, 1);
                savePages(allPages);
                if (allPages.length > 0) {
                  loadPageByIndex(0);
                } else {
                  titleInput.value = '';
                  contentInput.value = '';
                  isNewDraft = true;
                  updateViews();
                }
              }
            }
          });
        }

        tocListContainer.appendChild(card);
      });
    } catch (err) {
      console.error('Error in renderTableOfContents:', err);
    }
  }

  // Update badges and sync TOC
  function updateViews() {
    try {
      const pages = getPages();
      const total = pages.length;

      if (tocCountBadge) {
        tocCountBadge.textContent = total;
      }

      renderTableOfContents(tocSearchInput?.value || '');
    } catch (err) {
      console.error('Error updating views:', err);
    }
  }

  // Open Table of Contents modal
  function openTOC(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();

    try {
      sfx.playPop();
    } catch (err) {}

    const modal = tocModal || document.getElementById('notebook-toc-modal');
    if (modal) {
      modal.classList.add('open');
    }

    try {
      if (tocSearchInput) tocSearchInput.value = '';
      renderTableOfContents('');
    } catch (err) {
      console.error('renderTableOfContents in openTOC failed:', err);
    }
  }

  // Close Table of Contents modal
  function closeTOC(e) {
    if (e && e.preventDefault) e.preventDefault();
    const modal = tocModal || document.getElementById('notebook-toc-modal');
    if (modal) {
      modal.classList.remove('open');
    }
  }

  // Expose globally
  window.openTableOfContents = openTOC;
  window.closeTableOfContents = closeTOC;

  if (tocBtn) {
    tocBtn.addEventListener('click', openTOC);
  }

  // Close TOC modal
  if (tocCloseBtn) {
    tocCloseBtn.addEventListener('click', closeTOC);
  }
  if (tocModal) {
    tocModal.addEventListener('click', (e) => {
      if (e.target === tocModal) closeTOC();
    });
  }

  if (tocSearchInput) {
    tocSearchInput.addEventListener('input', (e) => {
      renderTableOfContents(e.target.value);
    });
  }

  // Save Button Handler (Always saves with today's live date)
  saveBtn.addEventListener('click', () => {
    const title = titleInput.value.trim() || 'Bizim Günümüz';
    const content = contentInput.value.trim();

    if (!content) {
      alert('Lütfen günlüğe yazmak istediğin bir anı veya not yaz bir tanem.');
      contentInput.focus();
      return;
    }

    sfx.playUnlockChime();

    const now = new Date();
    const isoDate = toISODate(now);
    const dateFormatted = formatTurkishDate(now);

    const pages = getPages();
    const existingIndex = pages.findIndex(p => p.dateISO === isoDate);

    const newPage = {
      id: existingIndex >= 0 ? pages[existingIndex].id : 'page-' + Date.now(),
      dateISO: isoDate,
      dateFormatted: dateFormatted,
      title: title,
      content: content,
      audio: currentPageAudio || null
    };

    if (existingIndex >= 0) {
      pages[existingIndex] = newPage;
      currentPageIndex = existingIndex;
    } else {
      pages.unshift(newPage); // Insert as newest
      currentPageIndex = 0;
    }
    isNewDraft = false;

    savePages(pages);
    if (dateDisplay) dateDisplay.textContent = dateFormatted;

    // Show success status indicator
    if (statusMsg) {
      statusMsg.classList.add('show');
      setTimeout(() => statusMsg.classList.remove('show'), 3500);
    }
  });

  // New Page Button Handler (Always sets today's date)
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      sfx.playPop();
      titleInput.value = '';
      contentInput.value = '';
      currentPageAudio = null;
      setupAudioPlayer(null);
      isNewDraft = true;

      const now = new Date();
      if (dateDisplay) dateDisplay.textContent = formatTurkishDate(now);

      updateViews();
      titleInput.focus();
    });
  }

  // Initial load: setup views with current live date
  const initialPages = getPages();
  const today = new Date();
  const todayISO = toISODate(today);
  const todayFormatted = formatTurkishDate(today);

  // If there is an entry specifically saved for today, load it; otherwise show today's fresh date ready to write!
  const todayIdx = initialPages.findIndex(p => p.dateISO === todayISO);
  if (todayIdx >= 0) {
    loadPageByIndex(todayIdx);
  } else {
    titleInput.value = '';
    contentInput.value = '';
    isNewDraft = true;
    if (dateDisplay) dateDisplay.textContent = todayFormatted;
    updateViews();
  }

  window.reloadNotebook = function() {
    updateViews();
    const pages = getPages();
    if (currentPageIndex >= pages.length) {
      currentPageIndex = Math.max(0, pages.length - 1);
    }
    loadPageByIndex(currentPageIndex);
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==========================================================================
// ==========================================================================
// SIPSAK (INSTANT CAMERA & DEDICATED ALBUM)
// ==========================================================================
function initSipsak() {
  const modal = document.getElementById('sipsak-modal');
  const closeBtn = document.getElementById('sipsak-close-btn');
  const video = document.getElementById('sipsak-live-video');
  const flash = document.getElementById('sipsak-flash');
  const flipBtn = document.getElementById('sipsak-flip-cam-btn');
  const flipBottomBtn = document.getElementById('sipsak-flip-bottom-btn');
  const shutterBtn = document.getElementById('sipsak-shutter-btn');
  const nativeBtn = document.getElementById('sipsak-native-btn');
  const cameraViewport = document.getElementById('sipsak-camera-viewport');
  const shutterBar = document.getElementById('sipsak-shutter-bar');

  // Fallback elements
  const fallbackWrap = document.getElementById('sipsak-camera-fallback');
  const fallbackLaunchBtn = document.getElementById('sipsak-fallback-launch-btn');
  const directInput = document.getElementById('sipsak-direct-input');

  // Developing state elements
  const devView = document.getElementById('sipsak-developing-view');
  const devImg = document.getElementById('sipsak-dev-img');
  const devStamp = document.getElementById('sipsak-dev-stamp');

  // Sipsak Album Modal elements (Sağdaki pembe butona basınca açılan galeri)
  const albumModal = document.getElementById('sipsak-album-modal');
  const albumCloseBtn = document.getElementById('sipsak-album-close');
  const actionSnapBtn = document.getElementById('sipsak-action-snap-btn');

  // Dedicated Grid element
  const sipsakGrid = document.getElementById('sipsak-grid');
  const fabBtn = document.getElementById('mobile-sipsak-fab');
  const bottomNavContainer = document.querySelector('.bottom-nav-container');

  // Lightbox elements
  const lightboxModal = document.getElementById('sipsak-lightbox-modal');
  const lightboxClose = document.getElementById('sipsak-lightbox-close');
  const lightboxImg = document.getElementById('sipsak-lightbox-img');
  const lightboxStamp = document.getElementById('sipsak-lightbox-stamp');
  const sipsakLightboxDelBtn = document.getElementById('sipsak-lightbox-del-btn');
  const mirrorBtn = document.getElementById('sipsak-mirror-btn');

  const STORAGE_KEY_SIPSAK = 'ce_sipsak_album_v1';
  const STORAGE_KEY_DELETED_SIPSAK = 'ce_deleted_sipsak_ids_v1';
  let activeStream = null;
  let currentFacingMode = 'environment'; // 'environment' (rear) or 'user' (selfie)
  let isMirrorMode = true; // Selfie mirror reflection active by default
  let activeSipsakId = null;

  function getDeletedSipsakIds() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DELETED_SIPSAK);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return [];
  }

  function addDeletedSipsakId(id) {
    if (!id) return;
    try {
      const list = getDeletedSipsakIds();
      if (!list.includes(id)) {
        list.push(id);
        localStorage.setItem(STORAGE_KEY_DELETED_SIPSAK, JSON.stringify(list));
        if (window.CloudSync) window.CloudSync.save('deleted_sipsak_ids', list);
      }
    } catch(e) {}
  }

  // Şipşak açıldığında mobilde bottom navbar ve sağ alttaki pembe butonu gizle
  function hideMobileNavAndFab() {
    document.body.classList.add('sipsak-modal-active');
    if (fabBtn) {
      fabBtn.style.setProperty('display', 'none', 'important');
      fabBtn.style.setProperty('opacity', '0', 'important');
      fabBtn.style.setProperty('visibility', 'hidden', 'important');
      fabBtn.style.setProperty('pointer-events', 'none', 'important');
    }
    if (bottomNavContainer) {
      bottomNavContainer.style.setProperty('display', 'none', 'important');
      bottomNavContainer.style.setProperty('opacity', '0', 'important');
      bottomNavContainer.style.setProperty('visibility', 'hidden', 'important');
      bottomNavContainer.style.setProperty('pointer-events', 'none', 'important');
    }
  }

  // Şipşak kapandığında mobilde bottom navbar ve sağ alttaki pembe butonu geri getir
  function restoreMobileNavAndFab() {
    const isAnySipsakOpen = 
      (albumModal && albumModal.classList.contains('open')) ||
      (modal && modal.classList.contains('open')) ||
      (lightboxModal && lightboxModal.classList.contains('open'));

    if (!isAnySipsakOpen) {
      document.body.classList.remove('sipsak-modal-active');
      if (fabBtn) {
        fabBtn.style.removeProperty('display');
        fabBtn.style.removeProperty('opacity');
        fabBtn.style.removeProperty('visibility');
        fabBtn.style.removeProperty('pointer-events');
      }
      if (bottomNavContainer) {
        bottomNavContainer.style.removeProperty('display');
        bottomNavContainer.style.removeProperty('opacity');
        bottomNavContainer.style.removeProperty('visibility');
        bottomNavContainer.style.removeProperty('pointer-events');
      }
    }
  }

  function updateMirrorState() {
    const shouldMirror = isMirrorMode && (currentFacingMode === 'user');
    if (video) {
      video.classList.toggle('mirror-mode', shouldMirror);
      video.style.transform = shouldMirror ? 'scaleX(-1)' : 'none';
    }
    if (mirrorBtn) {
      mirrorBtn.style.display = (currentFacingMode === 'user') ? 'inline-flex' : 'none';
      mirrorBtn.classList.toggle('active', isMirrorMode);
    }
  }

  function openSipsakAlbum() {
    if (!albumModal) return;
    hideMobileNavAndFab();
    renderSipsakGallery();
    albumModal.classList.add('open');
    try { sfx.playPop(); } catch(err) {}
  }

  function closeSipsakAlbum() {
    if (albumModal) albumModal.classList.remove('open');
    restoreMobileNavAndFab();
  }

  function triggerCameraCapture() {
    openDirectCamera();
  }

  function getSipsakPhotos() {
    const deleted = getDeletedSipsakIds();
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SIPSAK);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(p => !deleted.includes(p.id));
      }
    } catch(e) {}
    return [];
  }

  function saveSipsakPhotos(list) {
    try {
      localStorage.setItem(STORAGE_KEY_SIPSAK, JSON.stringify(list));
      if (window.CloudSync) window.CloudSync.save('sipsak', list);
    } catch(e) {
      console.warn('Storage quota for sipsak:', e);
    }
  }

  function formatTurkishDateTime(d) {
    const months = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} • ${hours}:${minutes}`;
  }

  // Camera stream controls
  async function startCamera() {
    stopCamera();
    if (fallbackWrap) fallbackWrap.style.display = 'none';

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia not supported in this browser environment');
      }

      // Safe constraints without breaking mobile aspect ratios
      const constraints = {
        video: {
          facingMode: currentFacingMode === 'user' ? 'user' : { ideal: 'environment' }
        },
        audio: false
      };

      try {
        activeStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (cErr) {
        console.warn('Initial constraints failed, retrying simple video constraint:', cErr);
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      if (video && activeStream) {
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('muted', '');
        video.srcObject = activeStream;
        video.style.display = 'block';
        updateMirrorState();

        try {
          await video.play();
        } catch(playErr) {
          console.warn('Video play caught error:', playErr);
        }
      }
      return true;
    } catch (err) {
      console.warn('Direct camera stream failed, showing fallback:', err);
      if (video) video.style.display = 'none';
      if (fallbackWrap) fallbackWrap.style.display = 'flex';
      return false;
    }
  }

  function stopCamera() {
    if (activeStream) {
      try {
        activeStream.getTracks().forEach(t => t.stop());
      } catch(e) {}
      activeStream = null;
    }
    if (video) {
      video.srcObject = null;
    }
  }

  // Open direct camera modal
  async function openDirectCamera() {
    if (!modal) return;
    hideMobileNavAndFab();
    if (devView) devView.style.display = 'none';
    if (cameraViewport) cameraViewport.style.display = 'block';
    if (shutterBar) shutterBar.style.display = 'flex';

    modal.classList.add('open');
    await startCamera();
  }

  // Close camera modal
  function closeCameraModal() {
    stopCamera();
    if (modal) modal.classList.remove('open');
    restoreMobileNavAndFab();
  }

  // Flip camera between front & back
  async function toggleCameraFacing() {
    currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
    try { sfx.playPop(); } catch(e) {}
    await startCamera();
    updateMirrorState();
  }

  // Capture photo immediately & save permanently
  function captureAndSaveImmediately() {
    if (!video || video.readyState < 2) {
      if (directInput) directInput.click();
      return;
    }

    // 1. Shutter sound
    try { sfx.playShutter(); } catch(e) {}

    // 2. Screen Flash animation
    if (flash) {
      flash.classList.add('flash-active');
      setTimeout(() => flash.classList.remove('flash-active'), 220);
    }

    // 3. Draw square frame to canvas
    const canvas = document.createElement('canvas');
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 640;
    const size = Math.min(vw, vh);
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;

    canvas.width = 800;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');

    // If using front camera with mirror reflection active, mirror image
    if (isMirrorMode && currentFacingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, sx, sy, size, size, 0, 0, 800, 800);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

    // 4. Save photo IMMEDIATELY
    const stamp = formatTurkishDateTime(new Date());
    const newPhoto = {
      id: 'sipsak-' + Date.now(),
      img: dataUrl,
      timestamp: stamp
    };

    const photos = getSipsakPhotos();
    photos.unshift(newPhoto);
    saveSipsakPhotos(photos);

    // 5. Developing preview animation
    showDevelopingAnimation(dataUrl, stamp);
  }

  // Show developing Polaroid for 1.8 seconds, then scroll to dedicated section
  function showDevelopingAnimation(dataUrl, stamp) {
    stopCamera();

    if (cameraViewport) cameraViewport.style.display = 'none';
    if (shutterBar) shutterBar.style.display = 'none';

    if (devView) {
      devView.style.display = 'flex';
      if (devImg) devImg.src = dataUrl;
      if (devStamp) devStamp.textContent = stamp;
    }

    // Heart burst celebration
    try {
      if (window.romanticCanvas && window.romanticCanvas.createBurst) {
        window.romanticCanvas.createBurst(window.innerWidth / 2, window.innerHeight / 2, 28);
      }
    } catch(e) {}

    if (typeof window.showProtectionToast === 'function') {
      window.showProtectionToast('Şipşak fotoğrafınız anında kaydedildi.');
    }

    renderSipsakGallery();

    setTimeout(() => {
      closeCameraModal();
      openSipsakAlbum();
    }, 1800);
  }

  // Fallback native camera input
  if (directInput) {
    directInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const tempImg = new Image();
        tempImg.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 900;
          let w = tempImg.width;
          let h = tempImg.height;
          if (w > h && w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(tempImg, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

          const stamp = formatTurkishDateTime(new Date());
          const newPhoto = {
            id: 'sipsak-' + Date.now(),
            img: dataUrl,
            timestamp: stamp
          };

          const photos = getSipsakPhotos();
          photos.unshift(newPhoto);
          saveSipsakPhotos(photos);

          showDevelopingAnimation(dataUrl, stamp);
        };
        tempImg.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      directInput.value = '';
    });
  }

  // Native camera button triggers direct input
  if (nativeBtn && directInput) {
    nativeBtn.addEventListener('click', () => {
      directInput.click();
    });
  }

  if (fallbackLaunchBtn && directInput) {
    fallbackLaunchBtn.addEventListener('click', () => {
      directInput.click();
    });
  }

  // Render dedicated section Polaroid grid
  function renderSipsakGallery() {
    if (!sipsakGrid) return;
    const photos = getSipsakPhotos();

    if (!photos.length) {
      sipsakGrid.innerHTML = `
        <div class="sipsak-empty-card">
          <span class="sipsak-empty-icon"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>
          <h4>Henüz Şipşak Fotoğraf Yok</h4>
          <p>Sağ alttaki Şipşak butonuna dokunup ilk anlık fotoğrafınızı çekebilirsiniz!</p>
        </div>
      `;
      return;
    }

    sipsakGrid.innerHTML = '';
    photos.forEach((photo) => {
      const card = document.createElement('div');
      card.className = 'sipsak-card';
      card.innerHTML = `
        <div class="sipsak-card-img-wrap">
          <img src="${photo.img}" alt="Şipşak Fotoğraf">
        </div>
        <div class="sipsak-card-bottom">
          <span class="sipsak-card-stamp">${escapeHtml(photo.timestamp || 'Anlık Hatıra')}</span>
          <span class="sipsak-card-flash">Şipşak</span>
        </div>
      `;

      card.addEventListener('click', () => {
        openSipsakLightbox(photo);
      });

      sipsakGrid.appendChild(card);
    });
  }

  // Lightbox for Şipşak photos
  function openSipsakLightbox(photo) {
    if (!lightboxModal) return;
    activeSipsakId = photo.id;
    hideMobileNavAndFab();
    if (lightboxImg) lightboxImg.src = photo.img;
    if (lightboxStamp) lightboxStamp.textContent = photo.timestamp || 'Anlık Hatıra';
    lightboxModal.classList.add('open');
    try { sfx.playPop(); } catch(e) {}
  }

  function closeSipsakLightbox() {
    if (lightboxModal) lightboxModal.classList.remove('open');
    restoreMobileNavAndFab();
  }

  if (sipsakLightboxDelBtn) {
    sipsakLightboxDelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!activeSipsakId) return;
      if (confirm('Bu şipşak anıyı silmek istediğinize emin misiniz?')) {
        addDeletedSipsakId(activeSipsakId);
        const photos = getSipsakPhotos().filter(p => p.id !== activeSipsakId);
        saveSipsakPhotos(photos);
        renderSipsakGallery();
        closeSipsakLightbox();
        try { sfx.playUnlockChime(); } catch(err) {}
        if (typeof window.showProtectionToast === 'function') {
          window.showProtectionToast('Şipşak fotoğraf silindi.');
        }
      }
    });
  }

  // Event Listeners
  if (shutterBtn) shutterBtn.addEventListener('click', captureAndSaveImmediately);
  if (flipBtn) flipBtn.addEventListener('click', toggleCameraFacing);
  if (flipBottomBtn) flipBottomBtn.addEventListener('click', toggleCameraFacing);
  if (mirrorBtn) {
    mirrorBtn.addEventListener('click', () => {
      isMirrorMode = !isMirrorMode;
      updateMirrorState();
      try { sfx.playPop(); } catch(e) {}
      if (typeof window.showProtectionToast === 'function') {
        window.showProtectionToast(isMirrorMode ? 'Selfie yansıtma modu açık' : 'Selfie yansıtma modu kapalı');
      }
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeCameraModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeCameraModal();
    });
  }

  // Mobile vs Desktop check for Sipsak
  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
           ('ontouchstart' in window && window.innerWidth <= 1024);
  }

  // Trigger button - Sağ alttaki pembe kamera butonu Şipşak Albümünü ve galerisini açar
  if (fabBtn) {
    fabBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!isMobileDevice()) {
        if (typeof window.showProtectionToast === 'function') {
          window.showProtectionToast('Şipşak özelliği yalnızca mobil cihazlarda kullanılabilir.');
        } else {
          alert('Şipşak özelliği yalnızca mobil cihazlarda kullanılabilir.');
        }
        return;
      }
      openSipsakAlbum();
    });
  }

  // Albüm içindeki 'Yeni Şipşak Fotoğraf Çek' butonu kamerayı tetikler
  if (actionSnapBtn) {
    actionSnapBtn.addEventListener('click', (e) => {
      e.preventDefault();
      try { sfx.playPop(); } catch(err) {}
      triggerCameraCapture();
    });
  }

  // Albüm modalı kapatma butonları
  if (albumCloseBtn) albumCloseBtn.addEventListener('click', closeSipsakAlbum);
  if (albumModal) {
    albumModal.addEventListener('click', (e) => {
      if (e.target === albumModal) closeSipsakAlbum();
    });
  }

  if (lightboxClose) lightboxClose.addEventListener('click', closeSipsakLightbox);
  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeSipsakLightbox();
    });
  }

  // Initial render
  renderSipsakGallery();

  // Expose globally
  window.openSipsakAlbum = openSipsakAlbum;
  window.closeSipsakAlbum = closeSipsakAlbum;
  window.reloadSipsak = renderSipsakGallery;
  window.triggerDirectSipsak = triggerCameraCapture;
  window.openSipsak = openSipsakAlbum;
  window.closeSipsak = closeCameraModal;
  window.restoreSipsakNav = restoreMobileNavAndFab;
}

// ==========================================================================
// HERO PHOTO CLICK & CHANGE
// ==========================================================================
function initHeroPhoto() {
  const heroWrap = document.getElementById('hero-img-wrap');
  const heroImg = document.getElementById('hero-img');
  const heroChangeBtn = document.getElementById('hero-change-btn');
  const heroFileInput = document.getElementById('hero-file-input');

  const SAVED_HERO_KEY = 'ce_custom_hero_image_v2';

  // Restore saved hero photo on load
  try {
    const savedHero = localStorage.getItem(SAVED_HERO_KEY);
    if (savedHero && heroImg) {
      heroImg.src = savedHero;
    }
  } catch(e) {}

  function triggerHeroUpload(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    try { sfx.playPop(); } catch (err) {}
    if (heroFileInput) heroFileInput.click();
  }

  if (heroWrap) heroWrap.addEventListener('click', triggerHeroUpload);
  if (heroImg) heroImg.addEventListener('click', triggerHeroUpload);
  if (heroChangeBtn) heroChangeBtn.addEventListener('click', triggerHeroUpload);

  if (heroFileInput) {
    heroFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const tempImg = new Image();
        tempImg.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1200;
          let w = tempImg.width;
          let h = tempImg.height;

          if (w > h && w > maxDim) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else if (h > maxDim) {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }

          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(tempImg, 0, 0, w, h);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.88);

          if (heroImg) heroImg.src = compressedDataUrl;
          try {
            localStorage.setItem(SAVED_HERO_KEY, compressedDataUrl);
            if (window.CloudSync) window.CloudSync.save('hero_image', compressedDataUrl);
          } catch(err) {
            console.warn('Storage limit reached:', err);
          }

          try {
            sfx.playUnlockChime();
            if (window.romanticCanvas && window.romanticCanvas.createBurst) {
              window.romanticCanvas.createBurst(window.innerWidth / 2, window.innerHeight / 3, 24);
            }
          } catch(err) {}

          if (typeof window.showProtectionToast === 'function') {
            window.showProtectionToast('Ana fotoğrafımız başarıyla güncellendi!');
          }
        };
        tempImg.src = event.target.result;
      };
      reader.readAsDataURL(file);
      heroFileInput.value = '';
    });
  }
}

// ==========================================================================
// INTERACTIVE LIVE DRAWING CANVAS (BİRLİKTE CANLI ÇİZİM)
// ==========================================================================
// ==========================================================================
// INTERACTIVE LOVE DRAWING CANVAS (AŞK TUVALİMİZ)
// ==========================================================================
function initLoveDrawing() {
  const canvas = document.getElementById('love-draw-canvas');
  const wrapper = document.getElementById('draw-canvas-wrapper');
  if (!canvas || !wrapper) return;

  const ctx = canvas.getContext('2d');
  const boardContainer = document.getElementById('draw-board-container');
  const toolbar = document.getElementById('draw-toolbar');
  const fullscreenBtn = document.getElementById('draw-fullscreen-btn');
  const dragHandle = document.getElementById('palette-drag-handle');
  const collapseBtn = document.getElementById('palette-collapse-btn');
  const colorDots = document.querySelectorAll('#draw-colors .color-dot');
  const customColorInput = document.getElementById('draw-custom-color');
  const brushButtons = document.querySelectorAll('#draw-brush-sizes .brush-size-btn');
  const eraserBtn = document.getElementById('draw-eraser-btn');
  const stampButtons = document.querySelectorAll('#draw-stamps .stamp-btn');
  const undoBtn = document.getElementById('draw-undo-btn');
  const clearBtn = document.getElementById('draw-clear-btn');
  const saveBtn = document.getElementById('draw-save-btn');

  // Fixed internal resolution for crisp high-quality rendering & perfect cross-device coordinate sync
  canvas.width = 900;
  canvas.height = 675;

  // Drawing state
  let currentColor = '#ff477e';
  let brushSize = 6;
  let isEraser = false;
  let activeStamp = null; // SVG heart asset stamp path
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  const undoStack = [];
  const MAX_UNDO = 25;
  const LOCAL_STORAGE_KEY = 'ce_love_canvas_cache_v1';
  let cloudSaveTimer = null;

  // Pre-load Heart Asset Stamps from assets/hearts/
  const stampImages = {};
  const heartAssets = [
    'assets/hearts/1.svg',
    'assets/hearts/2.svg',
    'assets/hearts/3.svg',
    'assets/hearts/5.svg',
    'assets/hearts/7.svg',
    'assets/hearts/8.svg',
    'assets/hearts/11.svg',
    'assets/hearts/13.svg'
  ];
  heartAssets.forEach(src => {
    const img = new Image();
    img.src = src;
    stampImages[src] = img;
  });

  // Initialize canvas with white background
  function initBackground() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    loadCachedCanvas();
  }

  function saveUndoSnapshot() {
    try {
      if (undoStack.length >= MAX_UNDO) undoStack.shift();
      undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    } catch (e) {}
  }

  function loadCachedCanvas() {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = cached;
      }
    } catch (e) {}
  }

  function scheduleCloudSave() {
    if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        localStorage.setItem(LOCAL_STORAGE_KEY, dataUrl);
        if (window.CloudSync) {
          window.CloudSync.save('drawing_canvas', dataUrl);
        }
      } catch (e) {}
    }, 500);
  }

  // Exact coordinate mapping from screen coordinates to canvas pixels
  function getCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return {
      x: Math.max(0, Math.min(canvas.width, x)),
      y: Math.max(0, Math.min(canvas.height, y))
    };
  }

  function renderStroke(fromX, fromY, toX, toY, color, size, eraser) {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = eraser ? '#ffffff' : color;
    ctx.lineWidth = eraser ? size * 4 : size * 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.closePath();
  }

  function renderHeartStamp(x, y, stampSrc) {
    const stampSize = 96;
    const drawIt = (img) => {
      ctx.drawImage(img, x - stampSize / 2, y - stampSize / 2, stampSize, stampSize);
    };

    if (stampImages[stampSrc] && stampImages[stampSrc].complete) {
      drawIt(stampImages[stampSrc]);
    } else {
      const img = new Image();
      img.onload = () => drawIt(img);
      img.src = stampSrc;
      stampImages[stampSrc] = img;
    }
  }

  // Pointer Down (Start Drawing or Stamp)
  function handleDown(clientX, clientY) {
    window._lastLocalDrawTime = Date.now();
    const pt = getCanvasCoords(clientX, clientY);

    if (activeStamp) {
      saveUndoSnapshot();
      renderHeartStamp(pt.x, pt.y, activeStamp);
      scheduleCloudSave();
      broadcastDrawingData({
        type: 'stamp',
        x: pt.x / canvas.width,
        y: pt.y / canvas.height,
        stamp: activeStamp
      });
      try { sfx.playPop(); } catch (err) {}
      return;
    }

    isDrawing = true;
    lastX = pt.x;
    lastY = pt.y;
    saveUndoSnapshot();

    // Draw initial dot on tap
    const dotRadius = (isEraser ? brushSize * 4 : brushSize * 1.5) / 2;
    ctx.beginPath();
    ctx.arc(lastX, lastY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = isEraser ? '#ffffff' : currentColor;
    ctx.fill();

    broadcastDrawingData({
      type: 'dot',
      x: lastX / canvas.width,
      y: lastY / canvas.height,
      color: currentColor,
      size: brushSize,
      eraser: isEraser
    });
  }

  // Pointer Move (Drawing lines)
  function handleMove(clientX, clientY) {
    if (!isDrawing || activeStamp) return;
    window._lastLocalDrawTime = Date.now();
    const pt = getCanvasCoords(clientX, clientY);
    renderStroke(lastX, lastY, pt.x, pt.y, currentColor, brushSize, isEraser);

    broadcastDrawingData({
      type: 'stroke',
      from: [lastX / canvas.width, lastY / canvas.height],
      to: [pt.x / canvas.width, pt.y / canvas.height],
      color: currentColor,
      size: brushSize,
      eraser: isEraser
    });

    lastX = pt.x;
    lastY = pt.y;
  }

  // Pointer Up (End Drawing)
  function handleUp() {
    if (!isDrawing) return;
    isDrawing = false;
    window._lastLocalDrawTime = Date.now();
    try {
      const dataUrl = canvas.toDataURL('image/png');
      localStorage.setItem(LOCAL_STORAGE_KEY, dataUrl);
    } catch(e) {}
    scheduleCloudSave();
  }

  // Modern unified Pointer Events with clean legacy Touch fallback (prevents pointercancel conflict)
  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      handleDown(e.clientX, e.clientY);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    });

    const endPointerDrawing = (e) => {
      if (!isDrawing) return;
      try {
        if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}
      handleUp();
    };

    canvas.addEventListener('pointerup', endPointerDrawing);
    canvas.addEventListener('pointercancel', endPointerDrawing);
  } else {
    // Legacy fallback for devices/browsers without PointerEvent
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        e.preventDefault();
        handleDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (!isDrawing) return;
      if (e.touches && e.touches[0]) {
        e.preventDefault();
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    const endTouchDrawing = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      handleUp();
    };

    canvas.addEventListener('touchend', endTouchDrawing, { passive: false });
    canvas.addEventListener('touchcancel', endTouchDrawing, { passive: false });

    // Legacy Mouse fallback
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      handleDown(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      handleMove(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      if (isDrawing) handleUp();
    });
  }

  // Tool Controls: Colors with instant event switching
  colorDots.forEach(dot => {
    const pickColor = (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      colorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      currentColor = dot.dataset.color || '#ff477e';
      isEraser = false;
      activeStamp = null;
      if (eraserBtn) eraserBtn.classList.remove('active');
      stampButtons.forEach(s => s.classList.remove('active'));
      canvas.style.cursor = 'crosshair';
      try { sfx.playPop(); } catch (err) {}
    };
    dot.addEventListener('click', pickColor);
  });

  if (customColorInput) {
    customColorInput.addEventListener('input', (e) => {
      currentColor = e.target.value;
      isEraser = false;
      activeStamp = null;
      colorDots.forEach(d => d.classList.remove('active'));
      if (eraserBtn) eraserBtn.classList.remove('active');
      stampButtons.forEach(s => s.classList.remove('active'));
      canvas.style.cursor = 'crosshair';
    });
  }

  // Brush sizes
  brushButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      brushButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      brushSize = parseInt(btn.dataset.size || '6', 10);
      try { sfx.playPop(); } catch (err) {}
    });
  });

  // Eraser button (Sağ üstteki yazısız silgi butonu)
  if (eraserBtn) {
    eraserBtn.addEventListener('click', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      isEraser = !isEraser;
      activeStamp = null;
      stampButtons.forEach(s => s.classList.remove('active'));
      if (isEraser) {
        eraserBtn.classList.add('active');
        canvas.style.cursor = 'cell';
      } else {
        eraserBtn.classList.remove('active');
        canvas.style.cursor = 'crosshair';
      }
      try { sfx.playPop(); } catch (err) {}
    });
  }

  // Stamp selection: User Heart Assets with smooth switching
  stampButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      const stamp = btn.dataset.stamp;
      if (activeStamp === stamp) {
        activeStamp = null;
        btn.classList.remove('active');
        canvas.style.cursor = 'crosshair';
      } else {
        stampButtons.forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        activeStamp = stamp;
        isEraser = false;
        if (eraserBtn) eraserBtn.classList.remove('active');
        canvas.style.cursor = 'pointer';
      }
      try { sfx.playPop(); } catch (err) {}
    });
  });

  // Undo button (Sağ üstteki yazısız buton)
  if (undoBtn) {
    undoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (undoStack.length === 0) return;
      const lastState = undoStack.pop();
      if (lastState instanceof ImageData) {
        ctx.putImageData(lastState, 0, 0);
        scheduleCloudSave();
      } else if (typeof lastState === 'string') {
        const img = new Image();
        img.onload = () => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          scheduleCloudSave();
        };
        img.src = lastState;
      }
      try { sfx.playPop(); } catch (err) {}
    });
  }

  // Modern Romantic Clear Dialog elements
  const clearModal = document.getElementById('draw-clear-modal');
  const clearCancelBtn = document.getElementById('draw-clear-cancel-btn');
  const clearConfirmBtn = document.getElementById('draw-clear-confirm-btn');

  function openClearModal() {
    if (clearModal) clearModal.classList.add('open');
    try { sfx.playPop(); } catch (err) {}
  }

  function closeClearModal() {
    if (clearModal) clearModal.classList.remove('open');
  }

  function executeClearCanvas() {
    // 1. Mark clear timestamp to block incoming stale cloud sync
    window._lastDrawingClearTime = Date.now();

    // 2. Clear undo history so old strokes are wiped completely
    undoStack.length = 0;

    // 3. Clear canvas buffer with clean white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 4. Cancel any pending delayed save
    if (cloudSaveTimer) {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = null;
    }

    // 5. Generate blank data URL & synchronously save to localStorage
    const blankDataUrl = canvas.toDataURL('image/png');
    localStorage.setItem(LOCAL_STORAGE_KEY, blankDataUrl);

    // 6. Immediately sync blank canvas to cloud backend (no delay)
    if (window.CloudSync) {
      window.CloudSync.save('drawing_canvas', blankDataUrl);
    }

    // 7. Broadcast clear event to PeerJS WebRTC partner
    broadcastDrawingData({ type: 'clear' });

    // 8. Close modal & play sound & show feedback toast
    closeClearModal();
    try { sfx.playPop(); } catch (err) {}
    if (typeof window.showProtectionToast === 'function') {
      window.showProtectionToast('Tuval tamamen temizlendi.');
    }
  }

  // Clear button (Sağ üstteki yazısız buton)
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openClearModal();
    });
  }

  if (clearCancelBtn) {
    clearCancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeClearModal();
    });
  }

  if (clearConfirmBtn) {
    clearConfirmBtn.addEventListener('click', (e) => {
      e.preventDefault();
      executeClearCanvas();
    });
  }

  if (clearModal) {
    clearModal.addEventListener('click', (e) => {
      if (e.target === clearModal) closeClearModal();
    });
  }

  // Save to Love Album button
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const todayFormatted = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      const newMemory = {
        id: 'memory-draw-' + Date.now(),
        title: 'Birlikte Aşk Çizimimiz',
        date: todayFormatted,
        desc: 'Aşk tuvalimizde el ele, birlikte çizdiğimiz özel anımız...',
        img: dataUrl,
        category: 'special'
      };

      try {
        const raw = localStorage.getItem('ce_custom_memories_v3');
        const list = raw ? JSON.parse(raw) : [];
        list.unshift(newMemory);
        localStorage.setItem('ce_custom_memories_v3', JSON.stringify(list));
        if (window.CloudSync) window.CloudSync.save('memories', list);
        if (typeof window.reloadGallery === 'function') window.reloadGallery();
      } catch (e) {
        console.warn('Error saving drawing to memories:', e);
      }

      try {
        sfx.playUnlockChime();
        if (window.romanticCanvas && window.romanticCanvas.createBurst) {
          window.romanticCanvas.createBurst(window.innerWidth / 2, window.innerHeight / 2, 28);
        }
      } catch (e) {}

      if (typeof window.showProtectionToast === 'function') {
        window.showProtectionToast('Çiziminiz Aşk Albümüne eklendi!');
      }

      const gallerySection = document.getElementById('gallery');
      if (gallerySection) {
        gallerySection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // Real-time PeerJS WebRTC P2P Support (Unified LiveP2P Engine)
  function broadcastDrawingData(data) {
    if (window.LiveP2P) {
      window.LiveP2P.send(data);
    }
  }

  function handleRemoteData(data) {
    if (!data) return;
    if (data.type === 'stroke') {
      const fromX = data.from[0] * canvas.width;
      const fromY = data.from[1] * canvas.height;
      const toX = data.to[0] * canvas.width;
      const toY = data.to[1] * canvas.height;
      renderStroke(fromX, fromY, toX, toY, data.color, data.size, data.eraser);
    } else if (data.type === 'dot') {
      const x = data.x * canvas.width;
      const y = data.y * canvas.height;
      const dotRadius = (data.eraser ? data.size * 4 : data.size * 1.5) / 2;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = data.eraser ? '#ffffff' : data.color;
      ctx.fill();
    } else if (data.type === 'stamp') {
      const x = data.x * canvas.width;
      const y = data.y * canvas.height;
      renderHeartStamp(x, y, data.stamp);
    } else if (data.type === 'clear') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  window.handleRemoteDrawingData = handleRemoteData;

  // CloudSync Remote Image Loader
  window.syncRemoteDrawing = function(dataUrl) {
    if (!dataUrl || isDrawing) return;
    if (Date.now() - (window._lastLocalDrawTime || 0) < 30000) return;
    if (Date.now() - (window._lastDrawingClearTime || 0) < 30000) return;
    const currentCached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (currentCached === dataUrl) return;

    const img = new Image();
    img.onload = () => {
      if (Date.now() - (window._lastLocalDrawTime || 0) < 30000) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      localStorage.setItem(LOCAL_STORAGE_KEY, dataUrl);
    };
    img.src = dataUrl;
  };

  // ==========================================================================
  // TAM EKRAN ÇİZİM MODU & HAREKETLİ YÜZEN PALET (DRAGGABLE PALETTE)
  // ==========================================================================
  let isDrawingFullscreen = false;

  function toggleFullscreenDrawing() {
    isDrawingFullscreen = !isDrawingFullscreen;
    try { sfx.playPop(); } catch (err) {}

    const currentData = canvas.toDataURL('image/png');

    if (isDrawingFullscreen) {
      if (boardContainer) boardContainer.classList.add('is-fullscreen');
      document.body.classList.add('fullscreen-drawing-active');
      if (toolbar) {
        toolbar.classList.add('is-floating-palette');
        toolbar.style.top = '30px';
        toolbar.style.left = '20px';
      }
      if (fullscreenBtn) {
        fullscreenBtn.setAttribute('title', 'Tam Ekrandan Çık');
        fullscreenBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
        `;
      }
      if (typeof window.showProtectionToast === 'function') {
        window.showProtectionToast('Tam ekran çizim moduna geçildi. Paleti sürükleyerek dilediğin yere taşıyabilirsin.');
      }
    } else {
      if (boardContainer) boardContainer.classList.remove('is-fullscreen');
      document.body.classList.remove('fullscreen-drawing-active');
      if (toolbar) {
        toolbar.classList.remove('is-floating-palette');
        toolbar.classList.remove('minimized');
        toolbar.style.top = '';
        toolbar.style.left = '';
      }
      if (fullscreenBtn) {
        fullscreenBtn.setAttribute('title', 'Tam Ekran Çizim Modu');
        fullscreenBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        `;
      }
    }

    // Canvas yeniden boyutlandığında çizimi koru
    setTimeout(() => {
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = currentData;
    }, 60);
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFullscreenDrawing();
    });
  }

  const fullscreenCloseBtn = document.getElementById('draw-fullscreen-close-btn');
  const paletteExitBtn = document.getElementById('palette-exit-btn');

  if (fullscreenCloseBtn) {
    fullscreenCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isDrawingFullscreen) toggleFullscreenDrawing();
    });
  }

  if (paletteExitBtn) {
    paletteExitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isDrawingFullscreen) toggleFullscreenDrawing();
    });
  }

  // ESC tuşuyla tam ekrandan çıkma
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDrawingFullscreen) {
      toggleFullscreenDrawing();
    }
  });

  // Yüzen Palet Sürükleme (Drag & Drop) Mekanizması
  if (dragHandle && toolbar) {
    let isDraggingPalette = false;
    let startPointerX = 0;
    let startPointerY = 0;
    let startToolbarX = 0;
    let startToolbarY = 0;

    const onPalettePointerDown = (e) => {
      if (!toolbar.classList.contains('is-floating-palette')) return;
      if (e.target.closest('#palette-collapse-btn')) return;

      isDraggingPalette = true;
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

      startPointerX = clientX;
      startPointerY = clientY;

      const rect = toolbar.getBoundingClientRect();
      startToolbarX = rect.left;
      startToolbarY = rect.top;

      toolbar.style.transition = 'none';
      if (e.cancelable && e.type.startsWith('touch')) e.preventDefault();
    };

    const onPalettePointerMove = (e) => {
      if (!isDraggingPalette) return;
      if (e.cancelable) e.preventDefault();

      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

      const deltaX = clientX - startPointerX;
      const deltaY = clientY - startPointerY;

      let newX = startToolbarX + deltaX;
      let newY = startToolbarY + deltaY;

      const pad = 10;
      const maxW = window.innerWidth - toolbar.offsetWidth - pad;
      const maxH = window.innerHeight - toolbar.offsetHeight - pad;

      newX = Math.max(pad, Math.min(maxW, newX));
      newY = Math.max(pad, Math.min(maxH, newY));

      toolbar.style.left = `${newX}px`;
      toolbar.style.top = `${newY}px`;
    };

    const onPalettePointerUp = () => {
      if (!isDraggingPalette) return;
      isDraggingPalette = false;
      toolbar.style.transition = '';
    };

    dragHandle.addEventListener('pointerdown', onPalettePointerDown);
    window.addEventListener('pointermove', onPalettePointerMove, { passive: false });
    window.addEventListener('pointerup', onPalettePointerUp);
    window.addEventListener('pointercancel', onPalettePointerUp);

    // Dokunmatik cihazlar için ekstra touch desteği
    dragHandle.addEventListener('touchstart', onPalettePointerDown, { passive: false });
    window.addEventListener('touchmove', onPalettePointerMove, { passive: false });
    window.addEventListener('touchend', onPalettePointerUp);
  }

  // Paleti Küçült / Büyüt Butonu (— / +)
  if (collapseBtn && toolbar) {
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try { sfx.playPop(); } catch (err) {}
      toolbar.classList.toggle('minimized');
      const isMin = toolbar.classList.contains('minimized');
      collapseBtn.textContent = isMin ? '+' : '—';
      collapseBtn.setAttribute('title', isMin ? 'Paleti Genişlet' : 'Paleti Küçült');
    });
  }

  // Initialize Canvas
  initBackground();
}

// ==========================================================================
// ANTI-COPY & ANTI-SAVE AS PROTECTION (PROPRIETARY LOVE JOURNAL)
// ==========================================================================
function initProtection() {
  const toast = document.getElementById('protected-toast');
  const toastText = document.getElementById('protected-toast-text');
  let toastTimer = null;

  window.showProtectionToast = function(msg = "Bu anılar ve fotoğraflar sadece Ceylin & Emre'ye özeldir, kopyalanamaz.") {
    if (!toast) return;
    if (toastText) toastText.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  };

  // 1. Prevent Right-Click Context Menu
  document.addEventListener('contextmenu', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;

    e.preventDefault();
    window.showProtectionToast('Fotoğrafları farklı kaydetmeye ve kopyalamaya izin verilmiyor.');
    return false;
  }, { capture: true });

  // 2. Prevent Copy Event outside text fields
  document.addEventListener('copy', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;

    e.preventDefault();
    window.showProtectionToast('Aşk günlüğümüzün yazıları kopyalanamaz.');
    return false;
  }, { capture: true });

  // 3. Prevent Dragging Images
  document.addEventListener('dragstart', (e) => {
    if (e.target && e.target.tagName === 'IMG') {
      e.preventDefault();
      return false;
    }
  });

  // 4. Prevent Keyboard Save / Print / View Source / Copy shortcuts
  document.addEventListener('keydown', (e) => {
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    if (!isCmdOrCtrl) return;

    const key = e.key ? e.key.toLowerCase() : '';

    // Save page / photo (Ctrl+S or Cmd+S)
    if (key === 's') {
      e.preventDefault();
      window.showProtectionToast('Sayfayı ve fotoğrafları kaydetmeye izin verilmiyor.');
      return false;
    }

    // Print page (Ctrl+P or Cmd+P)
    if (key === 'p') {
      e.preventDefault();
      window.showProtectionToast('Anılarımızı yazdırmaya izin verilmiyor.');
      return false;
    }

    // View source (Ctrl+U or Cmd+U)
    if (key === 'u') {
      e.preventDefault();
      return false;
    }

    // Copy (Ctrl+C or Cmd+C) when not typing in an input
    if (key === 'c') {
      const activeEl = document.activeElement;
      const tag = activeEl ? activeEl.tagName.toLowerCase() : '';
      if (tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
        window.showProtectionToast('Aşk günlüğümüzün yazıları kopyalanamaz.');
        return false;
      }
    }
  });
}

// ==========================================================================
// MINIMAL ROMANTIC HAMBURGER MENU (Sağ Üst Sadeleştirilmiş Dinamik Menü)
// ==========================================================================
function initHeaderMenu() {
  const hamburgerBtn = document.getElementById('header-hamburger-btn');
  const dropdownMenu = document.getElementById('header-dropdown-menu');
  const backdrop = document.getElementById('header-menu-backdrop');
  const closeBtn = document.getElementById('header-dropdown-close');

  if (!hamburgerBtn || !dropdownMenu) return;
  if (hamburgerBtn.dataset.menuInit === 'true') return;
  hamburgerBtn.dataset.menuInit = 'true';

  // Helper: Live Data Counters Query
  function getLiveStats() {
    let memoryCount = 0;
    try {
      const delM = JSON.parse(localStorage.getItem('ce_deleted_memory_ids_v3') || '[]');
      const rawM = localStorage.getItem('ce_custom_memories_v3');
      if (rawM) {
        const arr = JSON.parse(rawM);
        if (Array.isArray(arr)) memoryCount = arr.filter(m => !delM.includes(m.id)).length;
      } else {
        memoryCount = (typeof CONFIG !== 'undefined' && CONFIG.MEMORIES) ? CONFIG.MEMORIES.length : 6;
      }
    } catch (e) {
      memoryCount = 6;
    }

    let sipsakCount = 0;
    try {
      const delS = JSON.parse(localStorage.getItem('ce_deleted_sipsak_ids_v1') || '[]');
      const rawS = localStorage.getItem('ce_sipsak_album_v1');
      if (rawS) {
        const arr = JSON.parse(rawS);
        if (Array.isArray(arr)) sipsakCount = arr.filter(s => !delS.includes(s.id)).length;
      }
    } catch (e) {}

    let diaryCount = 0;
    try {
      const delD = JSON.parse(localStorage.getItem('ceylin_deleted_diary_ids_v4') || '[]');
      const rawD = localStorage.getItem('ceylin_custom_entries_v4') || localStorage.getItem('ceylin_custom_entries');
      if (rawD) {
        const arr = JSON.parse(rawD);
        if (Array.isArray(arr)) diaryCount = arr.filter(d => !delD.includes(d.id)).length;
      } else {
        diaryCount = 3;
      }
    } catch (e) {
      diaryCount = 3;
    }

    let notebookCount = 0;
    try {
      const rawNb = localStorage.getItem('ce_notebook_pages_v3');
      if (rawNb) {
        const arr = JSON.parse(rawNb);
        if (Array.isArray(arr)) notebookCount = arr.length;
      }
    } catch (e) {}

    let bucketTotal = 0;
    let bucketCompleted = 0;
    try {
      const rawB = localStorage.getItem('ce_bucket_list_v2');
      if (rawB) {
        const arr = JSON.parse(rawB);
        if (Array.isArray(arr)) {
          bucketTotal = arr.length;
          bucketCompleted = arr.filter(b => b.completed).length;
        }
      } else {
        const items = document.querySelectorAll('#bucket-list-items .bucket-item');
        bucketTotal = items.length || 7;
        bucketCompleted = document.querySelectorAll('#bucket-list-items .bucket-item.completed').length || 2;
      }
    } catch (e) {
      bucketTotal = 7;
      bucketCompleted = 2;
    }

    const isPlaying = window.musicPlayer ? window.musicPlayer.isPlaying : false;

    return {
      memories: memoryCount,
      sipsak: sipsakCount,
      diary: diaryCount,
      notebook: notebookCount,
      bucket: { total: bucketTotal, completed: bucketCompleted },
      music: { isPlaying, song: 'Yalın - Ay Tenli Kadın' }
    };
  }

  // Update All Header Menu Dynamic Stats and Badges
  function updateHeaderMenuStats() {
    const stats = getLiveStats();

    // 1. Mini Top Chips Strip
    const chipMem = document.getElementById('chip-memories-num');
    if (chipMem) chipMem.textContent = stats.memories;
    const chipSip = document.getElementById('chip-sipsak-num');
    if (chipSip) chipSip.textContent = stats.sipsak;
    const chipDiary = document.getElementById('chip-diary-num');
    if (chipDiary) chipDiary.textContent = stats.diary;
    const chipNb = document.getElementById('chip-notebook-num');
    if (chipNb) chipNb.textContent = stats.notebook;
    const chipBucket = document.getElementById('chip-bucket-num');
    if (chipBucket) chipBucket.textContent = `${stats.bucket.completed}/${stats.bucket.total}`;

    // 2. Anılarımız Item
    const memBadge = document.getElementById('menu-memories-badge');
    const memDesc = document.getElementById('menu-memories-desc');
    if (memBadge) memBadge.textContent = `${stats.memories} Anı`;
    if (memDesc) memDesc.textContent = `${stats.memories} aşk fotoğrafı ve anımız albümde`;

    // 3. Şipşak Anlarımız Item
    const sipBadge = document.getElementById('menu-sipsak-badge');
    const sipDesc = document.getElementById('menu-sipsak-desc');
    if (sipBadge) sipBadge.textContent = `${stats.sipsak} Şipşak`;
    if (sipDesc) sipDesc.textContent = `${stats.sipsak} anlık çekilen aşk fotoğrafı`;

    // 4. Özel Hatıralar Item
    const diaryBadge = document.getElementById('menu-diary-badge');
    const diaryDesc = document.getElementById('menu-diary-desc');
    if (diaryBadge) diaryBadge.textContent = `${stats.diary} Not`;
    if (diaryDesc) diaryDesc.textContent = `${stats.diary} özel aşk notumuz saklı`;

    // 5. Pembe Anı Defteri Item
    const nbBadge = document.getElementById('menu-notebook-badge');
    const nbDesc = document.getElementById('menu-notebook-desc');
    if (nbBadge) nbBadge.textContent = `${stats.notebook} Sayfa`;
    if (nbDesc) nbDesc.textContent = `${stats.notebook} sayfa ortak günlüğümüz`;

    // 6. Hayal Listesi Item
    const bucketBadge = document.getElementById('menu-bucket-badge');
    const bucketDesc = document.getElementById('menu-bucket-desc');
    if (bucketBadge) bucketBadge.textContent = `${stats.bucket.completed}/${stats.bucket.total}`;
    if (bucketDesc) bucketDesc.textContent = `${stats.bucket.completed} / ${stats.bucket.total} hayalimiz gerçekleşti`;

    // 7. Müzik Durumu
    const musicBadge = document.getElementById('menu-music-badge');
    const musicTitle = document.getElementById('menu-music-title');
    const musicDesc = document.getElementById('menu-music-desc');
    const musicIcon = document.querySelector('.dropdown-item-icon.music');
    if (musicBadge) {
      musicBadge.textContent = stats.music.isPlaying ? '▶ Çalıyor' : '⏸ Duraklatıldı';
      musicBadge.style.background = stats.music.isPlaying ? 'rgba(244,63,94,0.15)' : 'rgba(100,116,139,0.12)';
      musicBadge.style.color = stats.music.isPlaying ? 'var(--primary)' : '#64748b';
    }
    if (musicTitle) {
      musicTitle.textContent = stats.music.isPlaying ? 'Romantik Melodi (Çalıyor)' : 'Romantik Melodi (Durduruldu)';
    }
    if (musicDesc) {
      musicDesc.textContent = `${stats.music.song} (${stats.music.isPlaying ? 'Çalıyor' : 'Durduruldu'})`;
    }
    if (musicIcon) {
      musicIcon.style.background = stats.music.isPlaying ? 'linear-gradient(135deg, #f43f5e, #e11d48)' : 'rgba(244, 63, 94, 0.12)';
      musicIcon.style.color = stats.music.isPlaying ? '#ffffff' : 'var(--primary)';
    }
  }

  function openMenu() {
    updateHeaderMenuStats();
    hamburgerBtn.classList.add('is-active');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    dropdownMenu.classList.add('is-open');
    dropdownMenu.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('is-open');
  }

  function closeMenu() {
    hamburgerBtn.classList.remove('is-active');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    dropdownMenu.classList.remove('is-open');
    dropdownMenu.setAttribute('aria-hidden', 'true');
    if (backdrop) backdrop.classList.remove('is-open');
  }

  function toggleMenu(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (dropdownMenu.classList.contains('is-open')) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  hamburgerBtn.addEventListener('click', toggleMenu);

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
    });
  }

  // Click outside to close anywhere on the screen
  document.addEventListener('click', (e) => {
    if (dropdownMenu.classList.contains('is-open')) {
      if (!dropdownMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
        closeMenu();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdownMenu.classList.contains('is-open')) {
      closeMenu();
    }
  });

  // Helper for smooth scrolling to section with alias fallbacks
  function scrollToSection(targetId) {
    closeMenu();
    let target = document.getElementById(targetId);
    if (!target) {
      if (targetId === 'memories') target = document.getElementById('gallery');
      else if (targetId === 'bucket-list' || targetId === 'bucket') target = document.getElementById('bucketlist');
      else if (targetId === 'notebook') target = document.querySelector('.notebook-wrapper') || document.getElementById('diary');
      else if (targetId === 'diary') target = document.getElementById('diary-grid') || document.getElementById('diary');
    }
    if (target) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  }

  // 1. Anılarımız (Fotoğraf Albümü)
  const navMemoriesBtn = document.getElementById('menu-nav-memories');
  if (navMemoriesBtn) {
    navMemoriesBtn.addEventListener('click', () => {
      scrollToSection('memories');
    });
  }

  // 2. Şipşak Anlarımız (Modalı Aç)
  const navSipsakBtn = document.getElementById('menu-nav-sipsak');
  if (navSipsakBtn) {
    navSipsakBtn.addEventListener('click', () => {
      closeMenu();
      const sipsakFab = document.getElementById('mobile-sipsak-fab') || document.getElementById('mobile-sipsak-fab-btn') || document.querySelector('.mobile-sipsak-fab');
      if (sipsakFab) {
        sipsakFab.click();
      } else {
        const sipsakModal = document.getElementById('sipsak-modal');
        if (sipsakModal) sipsakModal.classList.add('open');
      }
    });
  }

  // 3. Özel Hatıra Notları (Mektup Notları)
  const navDiaryBtn = document.getElementById('menu-nav-diary');
  if (navDiaryBtn) {
    navDiaryBtn.addEventListener('click', () => {
      scrollToSection('diary');
    });
  }

  // 4. Pembe Anı Defteri (Sayfalara Kaydır)
  const navNotebookBtn = document.getElementById('menu-nav-notebook');
  if (navNotebookBtn) {
    navNotebookBtn.addEventListener('click', () => {
      scrollToSection('notebook');
    });
  }

  // 5. Hayal Listesi
  const navBucketBtn = document.getElementById('menu-nav-bucket');
  if (navBucketBtn) {
    navBucketBtn.addEventListener('click', () => {
      scrollToSection('bucket-list');
    });
  }

  // 6. Romantik Melodi (Canlı Çal / Durdur)
  const menuMusicBtn = document.getElementById('menu-music-btn');
  if (menuMusicBtn) {
    menuMusicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try { sfx.playPop(); } catch (err) {}
      if (window.musicPlayer) {
        window.musicPlayer.toggle();
        setTimeout(updateHeaderMenuStats, 100);
      }
    });
  }

  // 7. Playlist Linki
  const menuPlaylistBtn = document.getElementById('menu-playlist-btn');
  if (menuPlaylistBtn) {
    menuPlaylistBtn.addEventListener('click', () => {
      closeMenu();
    });
  }

  // 8. Hızlı Yeni Anı Ekle
  const menuAddBtn = document.getElementById('menu-add-memory-btn');
  if (menuAddBtn) {
    menuAddBtn.addEventListener('click', () => {
      closeMenu();
      if (typeof window.openAddModal === 'function') {
        window.openAddModal();
      } else {
        const legacyBtn = document.getElementById('open-add-memory-btn');
        if (legacyBtn) legacyBtn.click();
      }
    });
  }

  // 9. Canlı Senkronize Et Butonu
  const menuSyncBtn = document.getElementById('menu-sync-btn');
  if (menuSyncBtn) {
    menuSyncBtn.addEventListener('click', async () => {
      const syncSvg = document.getElementById('menu-sync-svg');
      if (syncSvg) syncSvg.style.animation = 'spin 0.8s linear infinite';
      try { sfx.playPop(); } catch (err) {}
      if (window.CloudSync) {
        await window.CloudSync.syncAll(true, true);
      }
      setTimeout(() => {
        if (syncSvg) syncSvg.style.animation = '';
        updateHeaderMenuStats();
        closeMenu();
      }, 700);
    });
  }

  // 10. iPhone PWA Modal Helper
  const menuPwaBtn = document.getElementById('menu-pwa-install-btn');
  const iosPwaModal = document.getElementById('ios-pwa-modal');
  const iosPwaClose = document.getElementById('ios-pwa-close-btn');
  const iosPwaGotit = document.getElementById('ios-pwa-gotit-btn');

  function openPwaModal() {
    closeMenu();
    if (iosPwaModal) {
      document.body.classList.add('modal-open');
      iosPwaModal.classList.add('open');
      try { sfx.playPop(); } catch (e) {}
    }
  }

  function closePwaModal() {
    if (iosPwaModal) {
      document.body.classList.remove('modal-open');
      iosPwaModal.classList.remove('open');
    }
  }

  if (menuPwaBtn) menuPwaBtn.addEventListener('click', openPwaModal);
  if (iosPwaClose) iosPwaClose.addEventListener('click', closePwaModal);
  if (iosPwaGotit) iosPwaGotit.addEventListener('click', closePwaModal);
  if (iosPwaModal) {
    iosPwaModal.addEventListener('click', (e) => {
      if (e.target === iosPwaModal) closePwaModal();
    });
  }

  // 11. Günlüğü Kilitle
  const menuLockBtn = document.getElementById('menu-lock-btn');
  if (menuLockBtn) {
    menuLockBtn.addEventListener('click', () => {
      closeMenu();
      try { sfx.playLockClick(); } catch (err) {}
      localStorage.removeItem('ceylin_unlocked_v3');
      localStorage.removeItem('ce_authenticated_v3');
      window.location.reload();
    });
  }

  // Initial stats calculation
  updateHeaderMenuStats();

  window.closeHeaderMenu = closeMenu;
  window.openHeaderMenu = openMenu;
  window.updateHeaderMenuStats = updateHeaderMenuStats;
}

// ==========================================================================
// GLOBAL MODAL NAVBAR & SHIPSIAK FAB OBSERVER
// Sekme / Modal açıldığında masaüstü ve mobilde navbar ve şipşak butonu gizlensin
// ==========================================================================
function initGlobalModalObserver() {
  const syncModalVisibility = () => {
    const hasOpenModal = !!document.querySelector('.modal-overlay.open') ||
                         document.body.classList.contains('fullscreen-drawing-active') ||
                         document.body.classList.contains('face-id-active') ||
                         document.body.classList.contains('letter-active') ||
                         document.body.classList.contains('sipsak-modal-active');
    if (hasOpenModal) {
      document.body.classList.add('modal-open');
    } else {
      if (!document.querySelector('.modal-overlay.open') && !document.body.classList.contains('fullscreen-drawing-active')) {
        document.body.classList.remove('modal-open');
      }
    }
  };

  const observer = new MutationObserver(() => {
    syncModalVisibility();
  });

  document.querySelectorAll('.modal-overlay').forEach(el => {
    observer.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  });

  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  syncModalVisibility();
}

// ==========================================================================
// INITIALIZATION ON DOM READY
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initProtection();
  initHeroPhoto();
  initGlobalModalObserver();

  // Initialize Romantic Music Player first so password gate and triggers can use it
  window.musicPlayer = new RomanticMusicPlayer();

  const safeInit = (name, fn) => {
    try {
      fn();
    } catch (err) {
      console.error(`Error initializing ${name}:`, err);
    }
  };

  safeInit('HeaderMenu', initHeaderMenu);
  safeInit('PasswordGate', initPasswordGate);
  safeInit('LoveCounter', initLoveCounter);
  safeInit('BottomNav', initBottomNav);
  safeInit('Gallery', initGallery);
  safeInit('LoveLetter', initLoveLetter);
  safeInit('QuoteGenerator', initQuoteGenerator);
  safeInit('BucketList', initBucketList);
  safeInit('DiaryEntries', initDiaryEntries);
  safeInit('PinkNotebook', initPinkNotebook);
  safeInit('Sipsak', initSipsak);
  safeInit('LoveDrawing', initLoveDrawing);

  if (window.CloudSync) {
    try { window.CloudSync.init(); } catch (err) { console.error('CloudSync init:', err); }
  }

  // Press ESC to close any modal & exit fullscreen drawing
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      document.body.classList.remove('modal-open');
      if (typeof window.restoreSipsakNav === 'function') {
        window.restoreSipsakNav();
      }
      if (document.body.classList.contains('fullscreen-drawing-active')) {
        const fsBtn = document.getElementById('draw-fullscreen-btn');
        if (fsBtn) fsBtn.click();
      }
    }
  });
});
