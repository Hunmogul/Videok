/**
 * VideoKurátor – UserModel.js
 * Felhasználó entitás definíció, validáció és email hash kezelés
 * 1. Fázis: Lokális tárolás
 */

// ── Konstansok ──────────────────────────────────────────────────────────────

export const DISPLAY_NAME_MAX_LENGTH = 25;
export const WARNING_THRESHOLD       = 2;   // Ennyi letiltott link után figyelmeztetés
export const BAN_THRESHOLD           = 3;   // Ennyi letiltott link után végleges kitiltás
export const ACTIVE_DANGER_BAN_LIMIT = 3;   // Ennyi egyidejű veszélyes link után azonnali kitiltás

// ── Email hash ───────────────────────────────────────────────────────────────

/**
 * Email cím SHA-256 hash-elése.
 * Az eredeti email soha nem kerül tárolásra.
 * @param {string} email
 * @returns {Promise<string>} hex hash string
 */
export async function hashEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new Error('Érvénytelen email cím');
  }

  const normalized = email.trim().toLowerCase();

  if (!isValidEmailFormat(normalized)) {
    throw new Error('Érvénytelen email formátum');
  }

  const encoder = new TextEncoder();
  const data    = encoder.encode(normalized);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Email formátum ellenőrzés (alapszintű).
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Megjelenő név validáció ──────────────────────────────────────────────────

/**
 * Megjelenő név validálása.
 * @param {string|null} name
 * @returns {{ valid: boolean, normalized: string|null, error?: string }}
 */
export function validateDisplayName(name) {
  // Opcionális – ha nincs megadva, anonim
  if (name === null || name === undefined || name === '') {
    return { valid: true, normalized: null };
  }

  if (typeof name !== 'string') {
    return { valid: false, normalized: null, error: 'A név csak szöveg lehet' };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { valid: false, normalized: null, error: 'A név nem lehet csak szóközökből álló' };
  }

  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return {
      valid: false,
      normalized: null,
      error: `A név maximum ${DISPLAY_NAME_MAX_LENGTH} karakter lehet (jelenleg: ${trimmed.length})`,
    };
  }

  return { valid: true, normalized: trimmed };
}

// ── Szankció állapot számítás ────────────────────────────────────────────────

/**
 * Felhasználó szankció állapotának meghatározása.
 * @param {object} user
 * @returns {{ shouldBan: boolean, shouldWarn: boolean, reason?: string }}
 */
export function evaluateSanctions(user) {
  if (!user) return { shouldBan: false, shouldWarn: false };

  // Azonnali kitiltás: 3+ egyidejű aktív veszélyes link
  if ((user.activeDangerCount || 0) >= ACTIVE_DANGER_BAN_LIMIT) {
    return {
      shouldBan: true,
      shouldWarn: false,
      reason: `${ACTIVE_DANGER_BAN_LIMIT} egyidejű veszélyes link – azonnali kitiltás`,
    };
  }

  // Végleges kitiltás: 3 letiltott link jóvátétel nélkül
  if ((user.bannedLinkCount || 0) >= BAN_THRESHOLD) {
    return {
      shouldBan: true,
      shouldWarn: false,
      reason: `${BAN_THRESHOLD} letiltott link jóvátétel nélkül – végleges kitiltás`,
    };
  }

  // Figyelmeztetés: 2 letiltott link
  if ((user.bannedLinkCount || 0) >= WARNING_THRESHOLD) {
    return { shouldBan: false, shouldWarn: true };
  }

  return { shouldBan: false, shouldWarn: false };
}

// ── Gyár függvény ────────────────────────────────────────────────────────────

/**
 * Új felhasználó objektum létrehozása.
 * @param {object} input - { emailHash?, displayName?, isAdmin? }
 * @returns {{ success: boolean, user?: object, errors?: string[] }}
 */
export function createUser(input = {}) {
  const errors = [];

  // Megjelenő név validáció
  const nameResult = validateDisplayName(input.displayName);
  if (!nameResult.valid) {
    errors.push(nameResult.error);
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const user = {
    id:               crypto.randomUUID(),
    emailHash:        input.emailHash || null,
    displayName:      nameResult.normalized,
    isAdmin:          input.isAdmin === true,
    isBanned:         false,
    bannedAt:         null,
    bannedReason:     null,
    bannedLinkCount:  0,     // Jóvátétel nélkül letiltott linkek száma
    activeDangerCount: 0,    // Egyidejű aktív veszélyes linkek száma
    warningShown:     false, // Figyelmeztetés megjelent-e már
    createdAt:        new Date().toISOString(),
    invitedBy:        input.invitedBy || null,
  };

  return { success: true, user };
}
