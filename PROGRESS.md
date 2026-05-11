# VideoKurátor – Fejlesztési Napló

**Utolsó frissítés:** 2026-05-10

---

## 🔄 Jelenlegi állapot:
1. Modul (Adatstruktúra) – ✅ Kész
2. Modul (Felhasználói rendszer) – ⏳ Jóváhagyásra vár
3. Modul (UI – Saját lista) – Következő

## ✅ Elvégzett lépések:
- [2026-05-10] Koncepció kidolgozva
- [2026-05-10] Teljes specifikáció elkészítve és jóváhagyva
- [2026-05-10] 1. Modul – Adatstruktúra elkészült és jóváhagyva
- [2026-05-10] 2. Modul – Felhasználói rendszer elkészült

## ⏳ Következő lépés:
- 2. Modul jóváhagyása
- 3. Modul – UI (Saját lista) specifikáció és implementáció

## 📁 Fájlok:
- `SPEC.md` – Teljes specifikáció
- `PROGRESS.md` – Ez a fájl
- `src/models/VideoModel.js` – Videó entitás + validáció
- `src/models/RatingModel.js` – Értékelés entitás + validáció
- `src/models/StorageService.js` – Lokális IndexedDB tárolás
- `src/models/ModelTests.js` – Model tesztesetek (20 db)
- `src/models/UserModel.js` – Felhasználó entitás + validáció
- `src/models/UserService.js` – Felhasználó életciklus + szankciók
- `src/models/UserTests.js` – User tesztesetek (14 db)

---

## 📝 Modulok naplója:

### 1. Modul – Adatstruktúra ✅
- Platform felismerés: YouTube, Instagram, TikTok, Facebook
- Kategória validálás és normalizálás
- Duplikáció és feketelistás ellenőrzés
- Értékelés prioritás logika (danger > dislike > like)
- Veszélyes küszöb figyelés (3 jelzés → letiltás + 7 napos határidő)
- 20 teszteset implementálva

### 2. Modul – Felhasználói rendszer ⏳
- Email SHA-256 hash-elés (eredeti email soha nem tárolódik)
- Megjelenő név validáció (max 25 kar., csak szóközök elutasítva)
- Auto UUID generálás első indításkor
- Szankció logika (1 letiltott: semmi, 2: figyelmeztetés, 3: kitiltás)
- Azonnali kitiltás 3+ egyidejű aktív veszélyes linknél
- 7 napos határidő figyelés appba lépéskor
- Veszélyes link jóvátételi lehetőség (önkéntes törlés)
- Admin jelző kezelése
- 14 teszteset implementálva
