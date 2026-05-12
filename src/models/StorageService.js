/**
 * VideoKurátor – StorageService.js
 * Lokális adattárolás IndexedDB segítségével
 * 1. Fázis: Lokális tárolás
 */

import { DANGER_THRESHOLD, DANGER_DEADLINE_DAYS } from './VideoModel.js';
import { RATING_TYPES, shouldOverride }            from './RatingModel.js';

// ── Konfiguráció ─────────────────────────────────────────────────────────────

const DB_NAME    = 'videokurator';
const DB_VERSION = 1;

const STORES = Object.freeze({
  VIDEOS:     'videos',
  RATINGS:    'ratings',
  BLACKLIST:  'blacklist',
  USER:       'user',
});

// ── Adatbázis inicializálás ──────────────────────────────────────────────────

let _db = null;

/**
 * Megnyitja (és szükség esetén létrehozza) az IndexedDB adatbázist.
 * @returns {Promise<IDBDatabase>}
 */
export async function openDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Videos store
      if (!db.objectStoreNames.contains(STORES.VIDEOS)) {
        const videoStore = db.createObjectStore(STORES.VIDEOS, { keyPath: 'id' });
        videoStore.createIndex('platform',      'platform',      { unique: false });
        videoStore.createIndex('uploadedBy',    'uploadedBy',    { unique: false });
        videoStore.createIndex('addedAt',       'addedAt',       { unique: false });
        videoStore.createIndex('isBlacklisted', 'isBlacklisted', { unique: false });
        videoStore.createIndex('videoId',       'videoId',       { unique: false });
      }

      // Ratings store
      if (!db.objectStoreNames.contains(STORES.RATINGS)) {
        const ratingStore = db.createObjectStore(STORES.RATINGS, { keyPath: 'id' });
        ratingStore.createIndex('videoId',          'videoId',          { unique: false });
        ratingStore.createIndex('userId',           'userId',           { unique: false });
        // Összetett index: egy user egy videóra csak egyszer értékelhet
        ratingStore.createIndex('userId_videoId',   ['userId', 'videoId'], { unique: true });
      }

      // Blacklist store
      if (!db.objectStoreNames.contains(STORES.BLACKLIST)) {
        const blacklistStore = db.createObjectStore(STORES.BLACKLIST, { keyPath: 'id' });
        // Platform + videoId együtt egyedi
        blacklistStore.createIndex('platform_videoId', ['platform', 'videoId'], { unique: true });
      }

      // User store (egyetlen rekord: a saját felhasználó)
      if (!db.objectStoreNames.contains(STORES.USER)) {
        db.createObjectStore(STORES.USER, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;

      // Kapcsolat váratlan bezárásának kezelése
      _db.onversionchange = () => {
        _db.close();
        _db = null;
      };

      resolve(_db);
    };

    request.onerror = () => {
      reject(new Error(`Adatbázis megnyitása sikertelen: ${request.error?.message}`));
    };
  });
}

// ── Segédfüggvények ──────────────────────────────────────────────────────────

/**
 * Általános IDBRequest Promise wrapper.
 * @param {IDBRequest} request
 * @returns {Promise<any>}
 */
function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(new Error(request.error?.message || 'Adatbázis hiba'));
  });
}

/**
 * Tranzakció indítása.
 * @param {string[]} storeNames
 * @param {'readonly'|'readwrite'} mode
 * @returns {Promise<IDBTransaction>}
 */
async function getTransaction(storeNames, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(storeNames, mode);
}

// ── Feketelistás ellenőrzés ──────────────────────────────────────────────────

/**
 * Ellenőrzi, hogy egy videó szerepel-e a feketelistan.
 * @param {string} platform
 * @param {string} videoId
 * @returns {Promise<boolean>}
 */
export async function isBlacklisted(platform, videoId) {
  try {
    const tx    = await getTransaction([STORES.BLACKLIST]);
    const store = tx.objectStore(STORES.BLACKLIST);
    const index = store.index('platform_videoId');
    const result = await promisify(index.get([platform, videoId]));
    return result !== undefined;
  } catch {
    // Biztonságos irányból: ha nem tudjuk ellenőrizni, ne engedjük be
    return true;
  }
}

// ── Videó műveletek ──────────────────────────────────────────────────────────

/**
 * Videó mentése a lokális adatbázisba.
 * Duplikáció és feketelistás ellenőrzéssel.
 * @param {object} video - createVideo() által visszaadott videó objektum
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function saveVideo(video) {
  try {
    // Feketelistás ellenőrzés
    const blacklisted = await isBlacklisted(video.platform, video.videoId);
    if (blacklisted) {
      return { success: false, error: 'Ez a videó tiltólistán szerepel' };
    }

    const tx    = await getTransaction([STORES.VIDEOS], 'readwrite');
    const store = tx.objectStore(STORES.VIDEOS);

    // Duplikáció ellenőrzés (videoId alapján)
    const index    = store.index('videoId');
    const existing = await promisify(index.get(video.videoId));
    if (existing) {
      return { success: false, error: 'Ez a videó már szerepel a gyűjteményben' };
    }

    await promisify(store.add(video));
    return { success: true };
  } catch (err) {
    return { success: false, error: `Mentési hiba: ${err.message}` };
  }
}

/**
 * Összes videó lekérése.
 * @returns {Promise<object[]>}
 */
export async function getAllVideos() {
  try {
    const tx    = await getTransaction([STORES.VIDEOS]);
    const store = tx.objectStore(STORES.VIDEOS);
    return await promisify(store.getAll());
  } catch {
    return [];
  }
}

/**
 * Egyetlen videó lekérése ID alapján.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getVideoById(id) {
  try {
    const tx    = await getTransaction([STORES.VIDEOS]);
    const store = tx.objectStore(STORES.VIDEOS);
    const result = await promisify(store.get(id));
    return result || null;
  } catch {
    return null;
  }
}

/**
 * Videó törlése.
 * @param {string} id
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function deleteVideo(id) {
  try {
    const tx    = await getTransaction([STORES.VIDEOS], 'readwrite');
    const store = tx.objectStore(STORES.VIDEOS);
    await promisify(store.delete(id));
    return { success: true };
  } catch (err) {
    return { success: false, error: `Törlési hiba: ${err.message}` };
  }
}

/**
 * Videó frissítése (pl. cím, kategória módosítás).
 * @param {string} id
 * @param {object} updates - Módosítandó mezők
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function updateVideo(id, updates) {
  try {
    const tx    = await getTransaction([STORES.VIDEOS], 'readwrite');
    const store = tx.objectStore(STORES.VIDEOS);

    const existing = await promisify(store.get(id));
    if (!existing) {
      return { success: false, error: 'Videó nem található' };
    }

    // Védett mezők – ezeket nem szabad kívülről módosítani
    const protected_fields = ['id', 'videoId', 'platform', 'uploadedBy', 'addedAt'];
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => !protected_fields.includes(key))
    );

    const updated = { ...existing, ...safeUpdates };
    await promisify(store.put(updated));
    return { success: true };
  } catch (err) {
    return { success: false, error: `Frissítési hiba: ${err.message}` };
  }
}

// ── Értékelés műveletek ──────────────────────────────────────────────────────

/**
 * Értékelés mentése.
 * Kezeli a duplikációt és a veszélyes jelzés prioritását.
 * @param {object} rating - createRating() által visszaadott értékelés objektum
 * @returns {Promise<{ success: boolean, overridden?: boolean, error?: string }>}
 */
export async function saveRating(rating) {
  try {
    const tx          = await getTransaction([STORES.RATINGS, STORES.VIDEOS], 'readwrite');
    const ratingStore = tx.objectStore(STORES.RATINGS);
    const videoStore  = tx.objectStore(STORES.VIDEOS);

    // Meglévő értékelés ellenőrzés
    const index    = ratingStore.index('userId_videoId');
    const existing = await promisify(index.get([rating.userId, rating.videoId]));

    if (existing) {
      // Ha ugyanolyan típus → elutasítás
      if (existing.type === rating.type) {
        return { success: false, error: 'Ezt a videót már értékelted' };
      }
      // Ha az új felülírhatja a régit (pl. danger > like)
      if (!shouldOverride(existing.type, rating.type)) {
        return { success: false, error: 'Nem lehet alacsonyabb prioritású értékelést adni' };
      }
      // Régi értékelés törlése, majd új hozzáadása
      await promisify(ratingStore.delete(existing.id));
    }

    await promisify(ratingStore.add(rating));

    // Videó számlálók frissítése
    const video = await promisify(videoStore.get(rating.videoId));
    if (video) {
      if (existing) {
        // Régi értékelés levonása
        if (existing.type === RATING_TYPES.LIKE)    video.likeCount    = Math.max(0, video.likeCount - 1);
        if (existing.type === RATING_TYPES.DISLIKE)  video.dislikeCount = Math.max(0, video.dislikeCount - 1);
        if (existing.type === RATING_TYPES.DANGER)   video.dangerCount  = Math.max(0, video.dangerCount - 1);
      }

      // Új értékelés hozzáadása
      if (rating.type === RATING_TYPES.LIKE)    video.likeCount++;
      if (rating.type === RATING_TYPES.DISLIKE)  video.dislikeCount++;
      if (rating.type === RATING_TYPES.DANGER) {
        video.dangerCount++;

        // Veszélyes küszöb ellenőrzés
        if (video.dangerCount >= DANGER_THRESHOLD) {
          video.isBlacklisted = true;
          video.blacklistedAt = new Date().toISOString();
          // 7 napos határidő a feltöltőnek
          const deadline = new Date();
          deadline.setDate(deadline.getDate() + DANGER_DEADLINE_DAYS);
          video.dangerDeadline = deadline.toISOString();
        }
      }

      await promisify(videoStore.put(video));
    }

    return { success: true, overridden: !!existing };
  } catch (err) {
    return { success: false, error: `Értékelési hiba: ${err.message}` };
  }
}

/**
 * Egy felhasználó értékelése egy adott videóra.
 * @param {string} userId
 * @param {string} videoId
 * @returns {Promise<object|null>}
 */
export async function getUserRatingForVideo(userId, videoId) {
  try {
    const tx    = await getTransaction([STORES.RATINGS]);
    const store = tx.objectStore(STORES.RATINGS);
    const index = store.index('userId_videoId');
    const result = await promisify(index.get([userId, videoId]));
    return result || null;
  } catch {
    return null;
  }
}

// ── Felhasználó műveletek ────────────────────────────────────────────────────

/**
 * Saját felhasználó adatainak lekérése.
 * @returns {Promise<object|null>}
 */
export async function getLocalUser() {
  try {
    const tx    = await getTransaction([STORES.USER]);
    const store = tx.objectStore(STORES.USER);
    const all   = await promisify(store.getAll());
    return all.length > 0 ? all[0] : null;
  } catch {
    return null;
  }
}

/**
 * Saját felhasználó adatainak mentése / frissítése.
 * @param {object} user
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function saveLocalUser(user) {
  try {
    const tx    = await getTransaction([STORES.USER], 'readwrite');
    const store = tx.objectStore(STORES.USER);
    await promisify(store.put(user));
    return { success: true };
  } catch (err) {
    return { success: false, error: `Felhasználó mentési hiba: ${err.message}` };
  }
}

// ── Feketelista műveletek ────────────────────────────────────────────────────

/**
 * Videó hozzáadása a feketelitához.
 * @param {object} entry - { platform, videoId, originalUrl, uploadedBy, reason }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function addToBlacklist(entry) {
  try {
    const tx    = await getTransaction([STORES.BLACKLIST], 'readwrite');
    const store = tx.objectStore(STORES.BLACKLIST);

    const record = {
      id:             crypto.randomUUID(),
      platform:       entry.platform,
      videoId:        entry.videoId,
      originalUrl:    entry.originalUrl,
      blacklistedAt:  new Date().toISOString(),
      reason:         entry.reason || 'danger',
      uploadedBy:     entry.uploadedBy,
    };

    await promisify(store.add(record));
    return { success: true };
  } catch (err) {
    // Duplikált blacklist bejegyzés nem hiba
    if (err.message?.includes('unique')) {
      return { success: true };
    }
    return { success: false, error: `Feketelistázási hiba: ${err.message}` };
  }
}

// ── Adatbázis törlés (fejlesztési segéd) ────────────────────────────────────

/**
 * Teljes adatbázis törlése. CSAK FEJLESZTÉSI CÉLRA!
 * @returns {Promise<void>}
 */
export async function __DEV__clearAllData() {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    throw new Error('clearAllData nem hívható éles környezetben');
  }
  if (_db) {
    _db.close();
    _db = null;
  }
  await promisify(indexedDB.deleteDatabase(DB_NAME));
}
