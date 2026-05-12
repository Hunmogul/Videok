/**
 * VideoKurátor – UserService.js
 * Felhasználó életciklus, szankció és munkamenet kezelés
 * 1. Fázis: Lokális tárolás
 */

import {
  createUser,
  hashEmail,
  validateDisplayName,
  evaluateSanctions,
} from './UserModel.js';
import {
  getLocalUser,
  saveLocalUser,
  getAllVideos,
  updateVideo,
  addToBlacklist,
  openDB,
} from './StorageService.js';

// ── Munkamenet inicializálás ──────────────────────────────────────────────────

/**
 * Alkalmazás indításakor meghívandó.
 * Ha nincs tárolt felhasználó, létrehoz egyet.
 * Ha van, betölti és ellenőrzi a szankciós állapotot.
 * @returns {Promise<{ user: object, notifications: string[] }>}
 */
export async function initializeUser() {
  await openDB();

  let user = await getLocalUser();
  const notifications = [];

  // Első indítás – új felhasználó létrehozása
  if (!user) {
    const result = createUser({});
    if (!result.success) {
      throw new Error(`Felhasználó inicializálás sikertelen: ${result.errors.join(', ')}`);
    }
    user = result.user;
    await saveLocalUser(user);
    notifications.push('welcome');
    return { user, notifications };
  }

  // Meglévő felhasználó – kitiltás ellenőrzés
  if (user.isBanned) {
    return { user, notifications: ['banned'] };
  }

  // Veszélyes linkek határidő ellenőrzése
  const deadlineNotifications = await checkDangerDeadlines(user);
  notifications.push(...deadlineNotifications);

  // Szankció újraértékelés (határidő lejárat után változhatott)
  user = await getLocalUser();
  const sanctions = evaluateSanctions(user);

  if (sanctions.shouldBan) {
    user = await banUser(user, sanctions.reason);
    notifications.push('banned');
    return { user, notifications };
  }

  if (sanctions.shouldWarn && !user.warningShown) {
    notifications.push('warning');
    user.warningShown = true;
    await saveLocalUser(user);
  }

  // Aktív veszélyes linkek értesítése
  const dangerVideos = await getActiveDangerVideos(user.id);
  if (dangerVideos.length > 0) {
    notifications.push('danger_videos');
  }

  return { user, notifications, dangerVideos };
}

// ── Email regisztráció ───────────────────────────────────────────────────────

/**
 * Email cím hozzárendelése a meglévő felhasználóhoz.
 * Az email hash-elve kerül tárolásra.
 * @param {string} email
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function registerEmail(email) {
  try {
    const user = await getLocalUser();
    if (!user) {
      return { success: false, error: 'Nincs inicializált felhasználó' };
    }

    if (user.emailHash) {
      return { success: false, error: 'Email cím már regisztrálva van' };
    }

    const emailHash = await hashEmail(email);

    // 1. fázisban: lokális egyediség ellenőrzés nem szükséges
    // (csak egy user van lokálisan)
    // 2. fázisban: szerver oldali egyediség ellenőrzés szükséges

    user.emailHash = emailHash;
    await saveLocalUser(user);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Megjelenő név kezelés ────────────────────────────────────────────────────

/**
 * Megjelenő név beállítása vagy frissítése.
 * @param {string|null} name
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function setDisplayName(name) {
  const validation = validateDisplayName(name);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const user = await getLocalUser();
  if (!user) {
    return { success: false, error: 'Nincs inicializált felhasználó' };
  }

  if (user.isBanned) {
    return { success: false, error: 'Kitiltott felhasználó nem módosíthatja adatait' };
  }

  // 1. fázis: lokális egyediség nem szükséges (egy user van)
  // 2. fázisban: szerver oldali névütközés ellenőrzés kell

  user.displayName = validation.normalized;
  await saveLocalUser(user);

  return { success: true, displayName: validation.normalized };
}

// ── Veszélyes link kezelés ───────────────────────────────────────────────────

/**
 * Lekéri a felhasználó aktív (letiltott, de még nem törölt) veszélyes videóit.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function getActiveDangerVideos(userId) {
  try {
    const videos = await getAllVideos();
    const now    = new Date();

    return videos.filter(v =>
      v.uploadedBy === userId &&
      v.isBlacklisted &&
      v.dangerDeadline &&
      new Date(v.dangerDeadline) > now
    );
  } catch {
    return [];
  }
}

/**
 * Veszélyes linkek határidejének ellenőrzése appba lépéskor.
 * Ha lejárt a 7 napos határidő és a user nem törölte → szankció.
 * @param {object} user
 * @returns {Promise<string[]>} értesítés típusok
 */
async function checkDangerDeadlines(user) {
  const notifications = [];

  try {
    const videos = await getAllVideos();
    const now    = new Date();
    let   changed = false;

    for (const video of videos) {
      if (
        video.uploadedBy === user.id &&
        video.isBlacklisted &&
        video.dangerDeadline &&
        !video.deadlineProcessed
      ) {
        const deadline = new Date(video.dangerDeadline);

        if (now > deadline) {
          // Határidő lejárt → szankció érvényesítése
          await updateVideo(video.id, { deadlineProcessed: true });
          await addToBlacklist({
            platform:    video.platform,
            videoId:     video.videoId,
            originalUrl: video.url,
            uploadedBy:  video.uploadedBy,
            reason:      'danger',
          });

          user.bannedLinkCount = (user.bannedLinkCount || 0) + 1;
          user.activeDangerCount = Math.max(0, (user.activeDangerCount || 0) - 1);
          changed = true;
          notifications.push('deadline_expired');
        }
      }
    }

    if (changed) {
      await saveLocalUser(user);
    }
  } catch (err) {
    console.error('Határidő ellenőrzés hiba:', err);
  }

  return notifications;
}

/**
 * Felhasználó által kezdeményezett veszélyes link törlése (jóvátétel).
 * 7 napos határidőn belül hívható.
 * @param {string} videoId - A videó belső UUID-ja
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function resolveAndDeleteDangerVideo(videoId) {
  try {
    const user = await getLocalUser();
    if (!user) return { success: false, error: 'Nincs felhasználó' };

    const videos = await getAllVideos();
    const video  = videos.find(v => v.id === videoId);

    if (!video) {
      return { success: false, error: 'Videó nem található' };
    }

    if (video.uploadedBy !== user.id) {
      return { success: false, error: 'Csak saját videót törölhetsz' };
    }

    if (!video.isBlacklisted) {
      return { success: false, error: 'Ez a videó nincs letiltva' };
    }

    const now      = new Date();
    const deadline = new Date(video.dangerDeadline);

    if (now > deadline) {
      return { success: false, error: 'A 7 napos határidő lejárt, törlés már nem lehetséges' };
    }

    // Videó törlése a saját listából (feketelistára nem kerül, mert jóváttette)
    await updateVideo(videoId, {
      isBlacklisted:     false,
      dangerDeadline:    null,
      deadlineProcessed: true,
      selfDeleted:       true,
      selfDeletedAt:     now.toISOString(),
    });

    // Aktív veszélyes link számláló csökkentése
    user.activeDangerCount = Math.max(0, (user.activeDangerCount || 0) - 1);
    await saveLocalUser(user);

    return { success: true };
  } catch (err) {
    return { success: false, error: `Törlési hiba: ${err.message}` };
  }
}

// ── Kitiltás ─────────────────────────────────────────────────────────────────

/**
 * Felhasználó végleges kitiltása.
 * @param {object} user
 * @param {string} reason
 * @returns {Promise<object>} frissített user objektum
 */
async function banUser(user, reason) {
  user.isBanned     = true;
  user.bannedAt     = new Date().toISOString();
  user.bannedReason = reason;
  await saveLocalUser(user);
  return user;
}

// ── Felhasználó lekérés ──────────────────────────────────────────────────────

/**
 * Aktuális felhasználó lekérése.
 * @returns {Promise<object|null>}
 */
export async function getCurrentUser() {
  return getLocalUser();
}

/**
 * Megjelenítési név vagy anonim placeholder visszaadása.
 * @param {object} user
 * @returns {string}
 */
export function getDisplayLabel(user) {
  if (!user) return 'Ismeretlen';
  return user.displayName || 'Anonim';
}

/**
 * Felhasználó adatainak frissítése (admin jelző kivételével).
 * @param {object} updates
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function updateCurrentUser(updates) {
  try {
    const user = await getLocalUser();
    if (!user) return { success: false, error: 'Nincs felhasználó' };

    if (user.isBanned) {
      return { success: false, error: 'Kitiltott felhasználó adatai nem módosíthatók' };
    }

    // Védett mezők – kívülről nem módosíthatók
    const protected_fields = ['id', 'emailHash', 'isAdmin', 'isBanned', 'bannedAt',
                               'bannedReason', 'bannedLinkCount', 'createdAt'];
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => !protected_fields.includes(key))
    );

    const updated = { ...user, ...safeUpdates };
    await saveLocalUser(updated);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
