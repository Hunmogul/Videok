/**
 * VideoKurátor – RatingModel.js
 * Értékelés entitás definíció és validáció
 * 1. Fázis: Lokális tárolás
 */

// ── Konstansok ──────────────────────────────────────────────────────────────

export const RATING_TYPES = Object.freeze({
  LIKE:    'like',
  DISLIKE: 'dislike',
  DANGER:  'danger',
});

// A veszélyes jelzés minden egyéb jelzést felülír
// Prioritás: danger > dislike > like
const RATING_PRIORITY = {
  [RATING_TYPES.DANGER]:  3,
  [RATING_TYPES.DISLIKE]: 2,
  [RATING_TYPES.LIKE]:    1,
};

// ── Validáció ────────────────────────────────────────────────────────────────

/**
 * Értékelés adatok validálása.
 * @param {object} data - { videoId, userId, type }
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRatingInput(data) {
  const errors = [];

  if (!data.videoId || typeof data.videoId !== 'string' || data.videoId.trim() === '') {
    errors.push('Videó azonosító megadása kötelező');
  }

  if (!data.userId || typeof data.userId !== 'string' || data.userId.trim() === '') {
    errors.push('Felhasználó azonosító megadása kötelező');
  }

  if (!data.type || !Object.values(RATING_TYPES).includes(data.type)) {
    errors.push(`Érvénytelen értékelés típus. Lehetséges értékek: ${Object.values(RATING_TYPES).join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Prioritás kezelés ────────────────────────────────────────────────────────

/**
 * Meghatározza, hogy az új értékelés felülírja-e a meglévőt.
 * A veszélyes jelzés minden egyéb jelzést felülír.
 * @param {string} existingType - Meglévő értékelés típusa
 * @param {string} newType - Új értékelés típusa
 * @returns {boolean} - true ha az új felülírja a meglévőt
 */
export function shouldOverride(existingType, newType) {
  return RATING_PRIORITY[newType] > RATING_PRIORITY[existingType];
}

// ── Gyár függvény ────────────────────────────────────────────────────────────

/**
 * Új Rating objektum létrehozása.
 * @param {object} input - { videoId, userId, type }
 * @returns {{ success: boolean, rating?: object, errors?: string[] }}
 */
export function createRating(input) {
  const validation = validateRatingInput(input);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  const rating = {
    id:        crypto.randomUUID(),
    videoId:   input.videoId.trim(),
    userId:    input.userId.trim(),
    type:      input.type,
    createdAt: new Date().toISOString(),
  };

  return { success: true, rating };
}
