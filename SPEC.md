# VideoKurátor – Teljes Specifikáció

**Verzió:** 1.0  
**Dátum:** 2026-05-10  
**Státusz:** Jóváhagyott, fejlesztés előtt  

---

## 🎯 Az alkalmazás célja

Egy önszabályozó közösségi videókurátor alkalmazás, ahol a felhasználók
kiszűrik a "jó" videókat a sok hulladékból, és megosztják egymással.
Támogatott platformok: YouTube, Instagram, TikTok.

---

## 📋 FEJLESZTÉSI ÁLLAPOT

| Modul | Státusz | Megjegyzés |
|-------|---------|------------|
| Specifikáció | ✅ Kész | Jóváhagyva 2026-05-10 |
| Adatstruktúra | ⏳ Következő | - |
| Lokális tárolás | ⏳ Várakozik | - |
| UI – Saját lista | ⏳ Várakozik | - |
| UI – Felhő lista | ⏳ Várakozik | - |
| Felhasználói rendszer | ⏳ Várakozik | - |
| Értékelési rendszer | ⏳ Várakozik | - |
| Felhő backend | ⏳ Várakozik | 2. fázis |
| Meghívó rendszer | ⏳ Várakozik | 2. fázis |
| Adományozás | ⏳ Várakozik | - |

---

## 👤 FELHASZNÁLÓI RENDSZER

### Azonosítás:
- Email cím → SHA-256 hash tárolva
- Az eredeti email cím **soha nem kerül tárolásra**
- Regisztrációnál egyértelmű közlemény erről
- Auto-generált belső azonosító (UUID)

### Megjelenő név:
- Opcionális, max 25 karakter
- Egyedi, nem ismétlődhet a rendszerben
- Ha nem adja meg → anonim megjelenés

### Regisztráció – Meghívó rendszer:
- 3 független, meglévő felhasználó ajánlása szükséges
- 7 napos időkorlát az ajánlások összegyűjtésére
- Ha 7 napon belül nem gyűlik össze 3 ajánlás → folyamat újraindul
- Rendszergazda kivétel a meghívó szabály alól

### Rendszergazda jogkörök:
- Összes feltöltés látható
- Dislike mennyiségek láthatók
- Veszélyes jelzések száma és forrása látható
- Manuális kitiltás joga (felhasználó / link)
- Appba lépéskor részletes moderációs összesítő

---

## 🚫 SZANKCIÓS RENDSZER

### Feltöltői szankciók:
| Állapot | Következmény |
|---------|-------------|
| 1 letiltott link | Semmi |
| 2 letiltott link | Figyelmeztetés az appban |
| 3 letiltott link jóvátétel nélkül | Végleges kitiltás |
| 3+ aktív "veszélyes" link egyszerre | Azonnali kitiltás |

### Veszélyes link folyamat:
1. Link eléri a 3 veszélyes jelzést → automatikusan letiltva
2. Feltöltő értesítést kap appba lépéskor
3. 7 nap áll rendelkezésre a link törlésére
4. Ha törli → nem számít szankcióba
5. Ha nem törli 7 napon belül → szankcióba számít
6. 3 különböző link letiltva jóvátétel nélkül → végleges kitiltás

### Ajánlói felelősség:
- Ha az ajánlott felhasználó kitiltásra kerül → ajánló figyelmeztetést kap
- Az ajánlóval szemben más következmény nincs

### Feketelistás linkek:
- Letiltott linkek örökre a feketelista adatbázisban maradnak
- Senki nem töltheti fel újra (platform + videóazonosító alapján)
- Kitiltott felhasználók adatai is megmaradnak (újraregisztráció megakadályozása)

---

## 🎬 VIDEÓ ADATSTRUKTÚRA

### Mentett adatok (minden videóhoz):
```
{
  id: UUID (automatikus),
  url: String (kötelező),
  platform: "youtube" | "instagram" | "tiktok" (automatikus),
  videoId: String (automatikus, URL-ből kinyerve),
  thumbnail: String (automatikus),
  title: String (opcionális, max 25 karakter),
  categories: String[] (opcionális, vesszővel elválasztott),
  addedAt: Timestamp (automatikus),
  userId: String (automatikus, hash alapú),
  likes: Number,
  isBlacklisted: Boolean,
  dangerCount: Number (csak rendszergazdának látható),
  dislikeCount: Number (csak rendszergazdának látható)
}
```

### Platform felismerés URL alapján:
- `youtube.com/shorts/` → YouTube
- `youtu.be/` → YouTube
- `instagram.com/reel/` → Instagram
- `tiktok.com/` → TikTok
- Egyéb → elutasítva

---

## 👍 ÉRTÉKELÉSI RENDSZER

### Gombok:
- 👍 **Like** – jónak tartom, ajánlom másoknak
- 👎 **Dislike** – nem tetszik (személyes vélemény)
- ⚠️ **Veszélyes** – káros tartalom jelzése

### Szabályok:
- Veszélyes jelzés minden egyéb jelzést felülír
- Egy felhasználó egy videóra csak egyszer értékelhet
- Már értékelt videók nem jelennek meg újra a felhő listában
- Nincs fellebbezési lehetőség

### Láthatósági szabályok:
| Adat | Normál user | Feltöltő | Rendszergazda |
|------|-------------|----------|---------------|
| Like száma | ✅ | ✅ | ✅ |
| Dislike mennyisége | ❌ | ❌ | ✅ |
| Veszélyes jelzések száma | ❌ | ❌* | ✅ |
| Ki jelölte veszélyesnek | ❌ | ❌ | ✅ |
| Feltöltő neve | ✅ | ✅ | ✅ |

*A feltöltő csak annyit lát: "elérte a 3 veszélyes jelzést"

---

## 📋 LISTÁK

### Saját lista:
- Privát, csak a tulajdonos látja
- Elemek törölhetők
- Offline is elérhető
- Tartalmazza a saját feltöltéseket és a felhőből kiválasztottakat

### Felhő lista:
- Közösségi megosztott videók
- Már értékelt videók nem látszanak (like/dislike/veszélyes)
- Veszélyesnek jelölt (letiltott) videók nem látszanak
- Manuális szinkronizáció (felhasználó indítja)
- Beállítható letöltési limit: alapértelmezett 50 új videó / frissítés

### Feketelista:
- Örökre tiltott linkek adatbázisa
- Platform + videóazonosító alapján szűr
- Csak rendszergazda látja teljes részletekkel

---

## 🔍 SZŰRÉS ÉS RENDEZÉS

### Rendezési szempontok (kattintással váltható):
- Dátum (újabb / régebbi elől)
- Felhasználó (feltöltő neve alapján)
- Kategória (ábécé sorrendben)
- Cím (ábécé sorrendben)
- Like szám (népszerűség)
- *Bővíthető később*

### Szűrési lehetőségek:
- Platform szerint (YouTube / Instagram / TikTok)
- Kategória szerint (vesszős tagok külön-külön kereshetők)
- Dátum szerint (időintervallum)

### Nézetek:
- 📋 Lista nézet
- 🖼️ Kártya / Thumbnail nézet
- Váltható gombbal

---

## 💰 ADOMÁNYOZÁS

- **Ko-fi** gomb az appban (nemzetközi)
- **Revolut** link az appban (magyar közönség)
- Az appban egy "Támogatás" gomb vezet a lehetőségekhez

---

## 📢 REKLÁM POLITIKA

- Hagyományos reklámnak nincs helye
- Kivétel: organikus videó link, amely:
  - Nem szerepel a feketellistán
  - Magas like arányt kapott a közösségtől
  - Természetes módon jelenik meg a listában

---

## 🛠️ TECHNIKAI FÁZISOK

### 1. Fázis – Lokális (fejlesztés / tesztelés):
- Lokális adattárolás (IndexedDB / localStorage)
- Egyetlen felhasználó
- Nincs hálózati kommunikáció
- Platform: PWA vagy webalkalmazás (nyitott)

### 2. Fázis – Felhő (éles):
- Backend szerver (technológia: döntés előtt)
- Felhasználói regisztráció / meghívó rendszer
- Felhő adatbázis (döntés előtt: Firebase / Supabase)
- Szinkronizáció
- Platform véglegesítése (PWA / React Native / natív)

---

## ❓ NYITOTT KÉRDÉSEK (döntés előtt)

| Kérdés | Lehetőségek | Prioritás |
|--------|-------------|-----------|
| Platform | PWA / React Native / Natív Android | 2. fázis előtt |
| Backend | Firebase / Supabase / egyedi | 2. fázis előtt |
| Offline szinkronizáció stratégia | Automatikus / manuális merge | 2. fázis előtt |

---

## 📝 DÖNTÉSI NAPLÓ

| Dátum | Döntés | Indok |
|-------|--------|-------|
| 2026-05-10 | Email hash-elve tárolva | Adatvédelem |
| 2026-05-10 | Nincs fellebbezés | Közösségbe vetett bizalom |
| 2026-05-10 | Veszélyes jelzés felülír mindent | Biztonság prioritása |
| 2026-05-10 | Dislike nem látható | Személyes vélemény, nem általános |
| 2026-05-10 | Manuális felhő szinkron | Ismeretlen rendszersebesség |
| 2026-05-10 | Max 50 videó / frissítés | Teljesítmény optimalizálás |

---

## 🔄 ÚJ CHAT INDÍTÁSAKOR

Másold be ezt a szöveget az új chat elejére:

```
VideoKurátor projekt folytatása.
Kérlek olvasd el a csatolt SPEC.md fájlt.
Legutóbbi állapot: [IDE ÍRD MIT CSINÁLTUNK UTOLJÁRA]
Következő lépés: [IDE ÍRD MI A KÖVETKEZŐ FELADAT]
```

---

*Specifikáció vége – v1.0*
