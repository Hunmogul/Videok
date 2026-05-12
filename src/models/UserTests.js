/**
 * VideoKurátor – UserTests.js
 * Tesztesetek a UserModel és UserService modulokhoz
 */

import {
  createUser,
  hashEmail,
  validateDisplayName,
  evaluateSanctions,
  DISPLAY_NAME_MAX_LENGTH,
  WARNING_THRESHOLD,
  BAN_THRESHOLD,
  ACTIVE_DANGER_BAN_LIMIT,
} from './UserModel.js';

import {
  initializeUser,
  registerEmail,
  setDisplayName,
  getCurrentUser,
  resolveAndDeleteDangerVideo,
} from './UserService.js';

import { __DEV__clearAllData } from './StorageService.js';

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

// ── UserModel tesztek ────────────────────────────────────────────────────────

function runUserModelTests() {
  console.log('\n👤 UserModel tesztek\n' + '─'.repeat(40));

  // U1 – Első indítás: auto UUID
  test('U1 – Új felhasználó auto UUID-val jön létre', () => {
    const result = createUser({});
    assert(result.success, `Hibák: ${result.errors?.join(', ')}`);
    assert(result.user.id, 'UUID szükséges');
    assert(result.user.id.length === 36, 'UUID formátum érvénytelen');
  });

  // U2 – Név megadása
  test('U2 – Megjelenő név elfogadva', () => {
    const result = createUser({ displayName: 'Gábor' });
    assert(result.success);
    assertEqual(result.user.displayName, 'Gábor');
  });

  // U3 – Név max hossz
  test(`U3 – ${DISPLAY_NAME_MAX_LENGTH} karakteres név elfogadva`, () => {
    const name   = 'A'.repeat(DISPLAY_NAME_MAX_LENGTH);
    const result = validateDisplayName(name);
    assert(result.valid, result.error);
  });

  // U4 – Név túl hosszú
  test(`U4 – ${DISPLAY_NAME_MAX_LENGTH + 1}+ karakteres név elutasítva`, () => {
    const name   = 'A'.repeat(DISPLAY_NAME_MAX_LENGTH + 1);
    const result = validateDisplayName(name);
    assert(!result.valid, 'Túl hosszú nevet el kell utasítani');
  });

  // U5 – Csak szóközök
  test('U5 – Csak szóközökből álló név elutasítva', () => {
    const result = validateDisplayName('   ');
    assert(!result.valid, 'Szóközökből álló nevet el kell utasítani');
  });

  // U6 – Email hash
  testAsync('U6 – Email SHA-256 hash-elése', async () => {
    const hash = await hashEmail('test@test.com');
    assert(typeof hash === 'string', 'Hash string kell legyen');
    assert(hash.length === 64, `SHA-256 hash 64 karakter, kapott: ${hash.length}`);
  });

  // U7 – Azonos email → azonos hash (konzisztencia)
  testAsync('U7 – Azonos email azonos hash-t ad', async () => {
    const hash1 = await hashEmail('test@test.com');
    const hash2 = await hashEmail('test@test.com');
    assertEqual(hash1, hash2, 'Azonos email azonos hash-t kell adjon');
  });

  // U8 – Admin jelző
  test('U8 – Admin jelző helyesen kerül beállításra', () => {
    const result = createUser({ isAdmin: true });
    assert(result.success);
    assert(result.user.isAdmin === true, 'Admin jelző nem lett beállítva');
  });

  // U9 – 1 letiltott link: semmi
  test('U9 – 1 letiltott link: nincs szankció', () => {
    const user    = { bannedLinkCount: 1, activeDangerCount: 0 };
    const result  = evaluateSanctions(user);
    assert(!result.shouldBan,  'Nem szabad kitiltani');
    assert(!result.shouldWarn, 'Nem szabad figyelmeztetni');
  });

  // U10 – 2 letiltott link: figyelmeztetés
  test(`U10 – ${WARNING_THRESHOLD} letiltott link: figyelmeztetés`, () => {
    const user   = { bannedLinkCount: WARNING_THRESHOLD, activeDangerCount: 0 };
    const result = evaluateSanctions(user);
    assert(!result.shouldBan, 'Nem szabad kitiltani');
    assert(result.shouldWarn, 'Figyelmeztetést kell küldeni');
  });

  // U11 – 3 letiltott link: kitiltás
  test(`U11 – ${BAN_THRESHOLD} letiltott link: végleges kitiltás`, () => {
    const user   = { bannedLinkCount: BAN_THRESHOLD, activeDangerCount: 0 };
    const result = evaluateSanctions(user);
    assert(result.shouldBan, 'Kitiltásnak kell történnie');
  });

  // U12 – 3+ egyidejű veszélyes link: azonnali kitiltás
  test(`U12 – ${ACTIVE_DANGER_BAN_LIMIT}+ aktív veszélyes link: azonnali kitiltás`, () => {
    const user   = { bannedLinkCount: 0, activeDangerCount: ACTIVE_DANGER_BAN_LIMIT };
    const result = evaluateSanctions(user);
    assert(result.shouldBan, 'Azonnali kitiltásnak kell történnie');
  });
}

// ── UserService tesztek ──────────────────────────────────────────────────────

async function runUserServiceTests() {
  console.log('\n⚙️ UserService tesztek\n' + '─'.repeat(40));

  await __DEV__clearAllData();

  // U1 – Első indítás
  await testAsync('U1 – Első indítás: felhasználó létrehozva', async () => {
    const { user, notifications } = await initializeUser();
    assert(user, 'Felhasználó létre kell jönnie');
    assert(user.id, 'UUID szükséges');
    assert(notifications.includes('welcome'), 'Welcome értesítés kell első indításkor');
  });

  // Második indítás – meglévő user betöltés
  await testAsync('Második indítás: meglévő user betöltve', async () => {
    const { user, notifications } = await initializeUser();
    assert(user, 'Felhasználónak meg kell maradnia');
    assert(!notifications.includes('welcome'), 'Welcome nem jöhet újra');
  });

  // U2 – Megjelenő név beállítás
  await testAsync('U2 – Megjelenő név sikeresen beállítva', async () => {
    const result = await setDisplayName('Gábor');
    assert(result.success, result.error);
    const user = await getCurrentUser();
    assertEqual(user.displayName, 'Gábor');
  });

  // U4 – Túl hosszú név elutasítása service szinten
  await testAsync('U4 – Túl hosszú név elutasítva (service szint)', async () => {
    const result = await setDisplayName('A'.repeat(DISPLAY_NAME_MAX_LENGTH + 1));
    assert(!result.success, 'Túl hosszú nevet el kell utasítani');
  });

  // U5 – Szóközök elutasítása service szinten
  await testAsync('U5 – Csak szóközök elutasítva (service szint)', async () => {
    const result = await setDisplayName('   ');
    assert(!result.success, 'Szóközöket el kell utasítani');
  });

  // U6 – Email regisztráció
  await testAsync('U6 – Email hash-elve kerül mentésre', async () => {
    const result = await registerEmail('gabor@test.com');
    assert(result.success, result.error);
    const user = await getCurrentUser();
    assert(user.emailHash, 'Hash-nek tárolva kell lennie');
    assert(user.emailHash.length === 64, 'SHA-256 hash szükséges');
  });

  // U7 – Duplikált email regisztráció
  await testAsync('U7 – Duplikált email regisztráció elutasítva', async () => {
    const result = await registerEmail('masik@test.com');
    assert(!result.success, 'Második email regisztrációt el kell utasítani');
  });

  // U13 – Kitiltott user hozzáférés megtagadva
  await testAsync('U14 – Kitiltott user: hozzáférés megtagadva', async () => {
    // Szimulálunk egy kitiltott usert
    const user     = await getCurrentUser();
    user.isBanned  = true;
    user.bannedAt  = new Date().toISOString();
    user.bannedReason = 'Teszt kitiltás';

    const { saveLocalUser } = await import('./StorageService.js');
    await saveLocalUser(user);

    const { user: loadedUser, notifications } = await initializeUser();
    assert(loadedUser.isBanned, 'Kitiltott usernek kitiltottnak kell maradnia');
    assert(notifications.includes('banned'), 'Banned értesítés szükséges');

    // Teszt utáni visszaállítás
    loadedUser.isBanned   = false;
    loadedUser.bannedAt   = null;
    loadedUser.bannedReason = null;
    await saveLocalUser(loadedUser);
  });

  // Takarítás
  await __DEV__clearAllData();
}

// ── Futtatás ─────────────────────────────────────────────────────────────────

export async function runUserTests() {
  console.log('🧪 VideoKurátor – User tesztek indítása\n' + '='.repeat(40));

  runUserModelTests();
  await runUserServiceTests();

  console.log('\n' + '='.repeat(40));
  console.log(`✅ Sikeres: ${passed}`);
  console.log(`❌ Sikertelen: ${failed}`);
  console.log(`📊 Összesen: ${passed + failed}`);

  return { passed, failed };
}
