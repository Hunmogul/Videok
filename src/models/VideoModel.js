/**
 * VideoKurátor – VideoModel.js
 * Videó entitás definíció és validáció
 * 1. Fázis: Lokális tárolás
 */

// ── Konstansok ──────────────────────────────────────────────────────────────

export const PLATFORMS = Object.freeze({
  YOUTUBE:   'youtube',
  INSTAGRAM: 'instagram',
  TIKTOK:    'tiktok',
  FACEBOOK:  'facebook',
});

export const VIDEO_TITLE_MAX_LENGTH = 25;
export const DANGER_THRESHOLD       = 3;   // Ennyi veszélyes jelzés után letiltás
export const DANGER_DEADLINE_DAYS   = 7;   // Napok a jóvátételre

// ── Platform URL felismerés ──────────────────────────────────────────────────

/**
 * Felismeri a platformot és kinyeri a videóazonosítót az URL-ből.
 * @param {string} rawUrl
 * @returns {{ platform: string, videoId: string } | null}
 */
export function parsePlatformUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  let url;
  try {
    // Protokoll nélküli URL-ek kezelése
    const normalized = rawUrl.trim().startsWith('http')
      ? rawUrl.trim()
      : `https://${rawUrl.trim()}`;
    url = new URL(normalized);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const path = url.pathname;

  // ── YouTube ──
  if (host === 'youtube.com' || host === 'youtu.be') {
    // youtu.be/ID
    if (host === 'youtu.be') {
      const id = path.slice(1).split('?')[0];
      if (id) return { platform: PLATFORMS.YOUTUBE, videoId: id };
    }
    // youtube.com/shorts/ID
    const shortsMatch = path.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) return { platform: PLATFORMS.YOUTUBE, videoId: shortsMatch[1] };
    // youtube.com/watch?v=ID
    const watchId = url.searchParams.get('v');
    if (watchId) return { platform: PLATFORMS.YOUTUBE, videoId: watchId };
    return null;
  }

  // ── Instagram ──
  if (host === 'instagram.com') {
    const reelMatch = path.match(/\/reel\/([a-zA-Z0-9_-]+)/);
    if (reelMatch) return { platform: PLATFORMS.INSTAGRAM, videoId: reelMatch[1] };
    const pMatch = path.match(/\/p\/([a-zA-Z0-9_-]+)/);
    if (pMatch) return { platform: PLATFORMS.INSTAGRAM, videoId: pMatch[1] };
    return null;
  }

  // ── TikTok ──
  if (host === 'tiktok.com' || host === 'vm.tiktok.com') {
    // vm.tiktok.com/ID (rövidített)
    if (host === 'vm.tiktok.com') {
      const id = path.slice(1).split('?')[0];
      if (id) return { platform: PLATFORMS.TIKTOK, videoId: id };
    }
    // tiktok.com/@user/video/ID
    const videoMatch = path.match(/\/video\/(\d+)/);
    if (videoMatch) return { platform: PLATFORMS.TIKTOK, videoId: videoMatch[1] };
    return null;
  }

  // ── Facebook ──
  if (host === 'facebook.com' || host === 'fb.watch') {
    // fb.watch/ID (rövidített)
    if (host === 'fb.watch') {
      const id = path.slice(1).split('?')[0];
      if (id) return { platform: PLATFORMS.FACEBOOK, videoId: id };
    }
    // facebook.com/reel/ID
    const reelMatch = path.match(/\/reel\/(\d+)/);
    if (reelMatch) return { platform: PLATFORMS.FACEBOOK, videoId: reelMatch[1] };
    // facebook.com/watch?v=ID
    const watchId = url.searchParams.get('v');
    if (watchId) return { platform: PLATFORMS.FACEBOOK, videoId: watchId };
    return null;
  }

  return null;
}

// ── Thumbnail generálás ──────────────────────────────────────────────────────

/**
 * Visszaadja a videó thumbnail URL-jét platform alapján.
 * Instagram és TikTok esetén nincs közvetlen thumbnail API,
 * ezért placeholder-t használunk.
 * @param {string} platform
 * @param {string} videoId
 * @returns {string}
 */
export function buildThumbnailUrl(platform, videoId) {
  switch (platform) {
    case PLATFORMS.YOUTUBE:
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    case PLATFORMS.INSTAGRAM:
      // Instagram nem enged közvetlen thumbnail lekérést – placeholder
      return `https://via.placeholder.com/320x180/E1306C/ffffff?text=Instagram`;
    case PLATFORMS.TIKTOK:
      // TikTok nem enged közvetlen thumbnail lekérést – placeholder
      return `https://via.placeholder.com/320x180/000000/ffffff?text=TikTok`;
    case PLATFORMS.FACEBOOK:
      return `https://via.placeholder.com/320x180/1877F2/ffffff?text=Facebook`;
    default:
      return `https://via.placeholder.com/320x180/cccccc/ffffff?text=Video`;
  }
}

// ── Kategória kezelés ────────────────────────────────────────────────────────

/**
 * Kategória string validálása és normalizálása.
 * @param {string} raw
 * @returns {{ valid: boolean, normalized: string, tags: string[], error?: string }}
 */
export function parseCategories(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: true, normalized: '', tags: [] };
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return { valid: true, normalized: '', tags: [] };
  }

  const tags = trimmed
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  if (tags.length === 0) {
    return { valid: false, normalized: '', tags: [], error: 'Érvénytelen kategória formátum' };
  }

  const normalized = tags.join(', ');
  return { valid: true, normalized, tags };
}

// ── Validáció ────────────────────────────────────────────────────────────────

/**
 * Videó adatok validálása létrehozás előtt.
 * @param {object} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateVideoInput(data) {
  const errors = [];

  // URL kötelező
  if (!data.url || typeof data.url !== 'string' || data.url.trim() === '') {
    errors.push('URL megadása kötelező');
  } else {
    const parsed = parsePlatformUrl(data.url);
    if (!parsed) {
      errors.push('Nem támogatott platform vagy érvénytelen URL');
    }
  }

  // Cím opcionális, de ha megadják, max 25 karakter
  if (data.title !== undefined && data.title !== null && data.title !== '') {
    if (typeof data.title !== 'string') {
      errors.push('A cím csak szöveg lehet');
    } else if (data.title.trim().length > VIDEO_TITLE_MAX_LENGTH) {
      errors.push(`A cím maximum ${VIDEO_TITLE_MAX_LENGTH} karakter lehet`);
    }
  }

  // Kategória opcionális, de ha megadják, validáljuk
  if (data.categories !== undefined && data.categories !== null && data.categories !== '') {
    const catResult = parseCategories(data.categories);
    if (!catResult.valid) {
      errors.push(catResult.error);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Gyár függvény ────────────────────────────────────────────────────────────

/**
 * Új Video objektum létrehozása validált adatokból.
 * @param {object} input - { url, title?, categories?, userId }
 * @returns {{ success: boolean, video?: object, errors?: string[] }}
 */
export function createVideo(input) {
  // 1. Validáció
  const validation = validateVideoInput(input);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  // 2. Platform felismerés
  const parsed = parsePlatformUrl(input.url);
  if (!parsed) {
    return { success: false, errors: ['Nem sikerült felismerni a platformot'] };
  }

  // 3. Kategória normalizálás
  const catResult = parseCategories(input.categories || '');

  // 4. Thumbnail
  const thumbnail = buildThumbnailUrl(parsed.platform, parsed.videoId);

  // 5. Videó objektum összeállítása
  const video = {
    id:            crypto.randomUUID(),
    url:           input.url.trim(),
    platform:      parsed.platform,
    videoId:       parsed.videoId,
    thumbnail,
    title:         input.title ? input.title.trim() : null,
    categories:    catResult.normalized,
    addedAt:       new Date().toISOString(),
    uploadedBy:    input.userId || 'anonymous',
    likeCount:     0,
    dislikeCount:  0,  // Csak admin látja
    dangerCount:   0,  // Csak admin látja
    isBlacklisted: false,
    blacklistedAt: null,
    dangerDeadline: null,
  };

  return { success: true, video };
}
