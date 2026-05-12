/**
 * VideoKurátor – ModelTests.js
 * Tesztesetek a VideoModel, RatingModel és StorageService modulokhoz
 * Futtatás: böngésző konzolból vagy Node.js környezetben
 */

import { parsePlatformUrl, parseCategories, validateVideoInput, createVideo, PLATFORMS } from './VideoModel.js';
import { validateRatingInput, createRating, shouldOverride, RATING_TYPES } from './RatingModel.js';
import { openDB, saveVideo, getAllVideos, saveRating, getUserRatingForVideo, isBlacklisted, addToBlacklist, __DEV__clearAllData } from './StorageService.js';

// ── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Várt: "${expected}", kapott: "${actual}"`);
  }
}

// ── VideoModel tesztek ───────────────────────────────────────────────────────

function runVideoModelTests() {
  console.log('\n📹 VideoModel tesztek\n' + '─'.repeat(40));

  // V1 – YouTube Shorts
  test('V1 – YouTube Shorts URL felismerés', () => {
    const result = parsePlatformUrl('https://www.youtube.com/shorts/abc123');
    assert(result !== null, 'Eredmény nem lehet null');
    assertEqual(result.platform, PLATFORMS.YOUTUBE);
    assertEqual(result.videoId, 'abc123');
  });

  // V2 – Instagram Reel
  test('V2 – Instagram Reel URL felismerés', () => {
    const result = parsePlatformUrl('https://www.instagram.com/reel/xyz789/');
    assert(result !== null);
    assertEqual(result.platform, PLATFORMS.INSTAGRAM);
    assertEqual(result.videoId, 'xyz789');
  });

  // V3 – TikTok
  test('V3 – TikTok URL felismerés', () => {
    const result = parsePlatformUrl('https://www.tiktok.com/@user/video/123456');
    assert(result !== null);
    assertEqual(result.platform, PLATFORMS.TIKTOK);
    assertEqual(result.videoId, '123456');
  });

  // V4 – Rövidített YouTube
  test('V4 – Rövidített YouTube (youtu.be) felismerés', () => {
    const result = parsePlatformUrl('https://youtu.be/abc123');
    assert(result !== null);
    assertEqual(result.platform, PLATFORMS.YOUTUBE);
    assertEqual(result.videoId, 'abc123');
  });

  // V5 – Facebook (engedélyezett)
  test('V5a – Facebook watch URL felismerés', () => {
    const result = parsePlatformUrl('https://www.facebook.com/watch?v=123456');
    assert(result !== null);
    assertEqual(result.platform, PLATFORMS.FACEBOOK);
    assertEqual(result.videoId, '123456');
  });

  test('V5b – Facebook Reel URL felismerés', () => {
    const result = parsePlatformUrl('https://www.facebook.com/reel/123456');
    assert(result !== null);
    assertEqual(result.platform, PLATFORMS.FACEBOOK);
  });

  test('V5c – fb.watch rövidített URL felismerés', () => {
    const result = parsePlatformUrl('https://fb.watch/abc123/');
    assert(result !== null);
    assertEqual(result.platform, PLATFORMS.FACEBOOK);
  });

  // V6 – Üres URL
  test('V6 – Üres URL elutasítás', () => {
    const result = parsePlatformUrl('');
    assert(result === null, 'Üres URL-t el kell utasítani');
  });

  // V7 – Érvénytelen URL
  test('V7 – Érvénytelen URL elutasítás', () => {
    const result = parsePlatformUrl('nem-url');
    assert(result === null, 'Érvénytelen URL-t el kell utasítani');
  });

  // V8 – Cím max hossz
  test('V8 – Cím max 25 karakter elfogadva', () => {
    const validation = validateVideoInput({
      url: 'https://www.youtube.com/shorts/abc123',
      title: 'A'.repeat(25),
    });
    assert(validation.valid, `Hibák: ${validation.errors.join(', ')}`);
  });

  // V9 – Cím túl hosszú
  test('V9 – Cím 26+ karakter elutasítva', () => {
    const validation = validateVideoInput({
      url: 'https://www.youtube.com/shorts/abc123',
      title: 'A'.repeat(26),
    });
    assert(!validation.valid, '26 karakteres cím nem fogadható el');
  });

  // V10a – Egy kategória
  test('V10a – Egy kategória elfogadva', () => {
    const result = parseCategories('sport');
    assert(result.valid);
    assertEqual(result.tags.length, 1);
    assertEqual(result.tags[0], 'sport');
  });

  // V10b – Több kategória
  test('V10b – Több kategória elfogadva', () => {
    const result = parseCategories('sport, humor');
    assert(result.valid);
    assertEqual(result.tags.length, 2);
  });

  // V10c – Felesleges szóközök levágva
  test('V10c – Felesleges szóközök levágva', () => {
    const result = parseCategories('sport , humor ');
    assert(result.valid);
    assertEqual(result.tags[0], 'sport');
    assertEqual(result.tags[1], 'humor');
  });

  // V10d – Üres kategória elfogadva
  test('V10d – Üres kategória elfogadva (opcionális)', () => {
    const result = parseCategories('');
    assert(result.valid);
    assertEqual(result.tags.length, 0);
  });

  // V10e – Csak vesszők elutasítva
  test('V10e – Csak vesszők elutasítva', () => {
    const result = parseCategories(',,,');
    assert(!result.valid, 'Csak vesszőkből álló kategória nem fogadható el');
  });
}

// ── RatingModel tesztek ──────────────────────────────────────────────────────

function runRatingModelTests() {
  console.log('\n👍 RatingModel tesztek\n' + '─'.repeat(40));

  // R1 – Normál like
  test('R1 – Normál like létrehozás', () => {
    const result = createRating({
      videoId: 'video-uuid-1',
      userId:  'user-uuid-1',
      type:    RATING_TYPES.LIKE,
    });
    assert(result.success);
    assert(result.rating.id);
    assertEqual(result.rating.type, RATING_TYPES.LIKE);
  });

  // R3 – Veszélyes felülír like-ot
  test('R3 – Danger nagyobb prioritású mint like', () => {
    const override = shouldOverride(RATING_TYPES.LIKE, RATING_TYPES.DANGER);
    assert(override, 'Danger-nek felül kell írnia a like-ot');
  });

  test('R3b – Like nem írja felül a danger-t', () => {
    const override = shouldOverride(RATING_TYPES.DANGER, RATING_TYPES.LIKE);
    assert(!override, 'Like nem írhatja felül a danger-t');
  });

  // R4 – Érvénytelen type
  test('R4 – Érvénytelen értékelés típus elutasítva', () => {
    const result = createRating({
      videoId: 'video-uuid-1',
      userId:  'user-uuid-1',
      type:    'love',
    });
    assert(!result.success, 'Érvénytelen típust el kell utasítani');
  });

  // R5 – Hiányzó videoId
  test('R5 – Hiányzó videoId elutasítva', () => {
    const result = createRating({
      videoId: null,
      userId:  'user-uuid-1',
      type:    RATING_TYPES.LIKE,
    });
    assert(!result.success);
  });

  // R6 – Hiányzó userId
  test('R6 – Hiányzó userId elutasítva', () => {
    const result = createRating({
      videoId: 'video-uuid-1',
      userId:  null,
      type:    RATING_TYPES.LIKE,
    });
    assert(!result.success);
  });
}

// ── StorageService tesztek ───────────────────────────────────────────────────

async function runStorageTests() {
  console.log('\n💾 StorageService tesztek\n' + '─'.repeat(40));

  // Tiszta állapot a teszteléshez
  await __DEV__clearAllData();

  // S1 – Videó mentés
  await testAsync('S1 – Videó mentése', async () => {
    const { video } = createVideo({
      url:    'https://www.youtube.com/shorts/test001',
      userId: 'user-1',
    });
    const result = await saveVideo(video);
    assert(result.success, result.error);
  });

  // S2 – Duplikált videó elutasítás
  await testAsync('S2 – Duplikált videó elutasítva', async () => {
    const { video } = createVideo({
      url:    'https://www.youtube.com/shorts/test001',
      userId: 'user-1',
    });
    const result = await saveVideo(video);
    assert(!result.success, 'Duplikált videót el kell utasítani');
  });

  // S3 – Összes videó lekérése
  await testAsync('S3 – Összes videó lekérése', async () => {
    const videos = await getAllVideos();
    assert(videos.length === 1, `Várt 1 videó, kapott: ${videos.length}`);
  });

  // S4 – Értékelés mentés
  await testAsync('S4 – Like értékelés mentése', async () => {
    const videos = await getAllVideos();
    const { rating } = createRating({
      videoId: videos[0].id,
      userId:  'user-1',
      type:    RATING_TYPES.LIKE,
    });
    const result = await saveRating(rating);
    assert(result.success, result.error);
  });

  // S5 – Duplikált értékelés elutasítás
  await testAsync('S5 – Duplikált értékelés elutasítva', async () => {
    const videos = await getAllVideos();
    const { rating } = createRating({
      videoId: videos[0].id,
      userId:  'user-1',
      type:    RATING_TYPES.LIKE,
    });
    const result = await saveRating(rating);
    assert(!result.success, 'Duplikált értékelést el kell utasítani');
  });

  // S6 – Feketelista
  await testAsync('S6 – Feketelistás videó elutasítva', async () => {
    await addToBlacklist({
      platform:    PLATFORMS.YOUTUBE,
      videoId:     'blacklisted001',
      originalUrl: 'https://www.youtube.com/shorts/blacklisted001',
      uploadedBy:  'user-x',
      reason:      'danger',
    });

    const { video } = createVideo({
      url:    'https://www.youtube.com/shorts/blacklisted001',
      userId: 'user-1',
    });
    const result = await saveVideo(video);
    assert(!result.success, 'Feketelistás videót el kell utasítani');
  });

  // Takarítás
  await __DEV__clearAllData();
}

// ── Futtatás ─────────────────────────────────────────────────────────────────

export async function runAllTests() {
  console.log('🧪 VideoKurátor – Model tesztek indítása\n' + '='.repeat(40));

  runVideoModelTests();
  runRatingModelTests();
  await runStorageTests();

  console.log('\n' + '='.repeat(40));
  console.log(`✅ Sikeres: ${passed}`);
  console.log(`❌ Sikertelen: ${failed}`);
  console.log(`📊 Összesen: ${passed + failed}`);

  return { passed, failed };
}
