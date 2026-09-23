# ◈ AURORA OS

**Kompletny system operacyjny działający w przeglądarce.**

AURORA OS to środowisko graficzne napisane od zera — menedżer okien, wirtualny
system plików, shell i czternaście aplikacji — w całości w TypeScript, z **zerową
liczbą zależności w czasie działania**. Bez frameworków, bez bundlera
w runtime, bez serwera: jądro bootuje, renderuje i utrwala stan w całości
w przeglądarce.

> *"Twoja przeglądarka jest teraz Twoim komputerem."*

---

## ✨ Funkcje

| Warstwa | Co dostajesz |
|---|---|
| 🧠 **Jądro** | Animowana sekwencja bootu, typowany EventBus, tablica procesów (cykl życia PID, `ps`/`kill`), podsystem ustawień, trwałość w localStorage |
| 🪟 **Menedżer okien** | Przeciąganie, zmiana rozmiaru (8 uchwytów), minimalizacja / maksymalizacja / fokus, kaskadowe rozmieszczanie, szklana ramka, animacje otwierania/zamykania |
| 📂 **Wirtualny system plików** | Drzewo w pamięci w stylu POSIX z `ls` / `cd` / `cat` / `mkdir -p` / `cp` / `mv` / `rm -r` / `grep` / `tree`, poprawne kody błędów (`ENOENT`, `EISDIR`, `EEXIST`, `EPERM`), trwałość w localStorage |
| ⌨️ **Terminal** | Interaktywny shell z 35+ komendami, historia komend (↑/↓), dokańczanie ścieżek Tab, przekierowanie wyjścia (`>` i `>>`), renderowanie kolorów ANSI, `neofetch`, `fortune`, `sudo` (jesteś rootem) |
| 📱 **Aplikacje** | Pliki, Terminal, Edytor (Ctrl+S), Kalkulator, Paint (zapis PNG), Monitor systemu (wykresy na żywo), Ustawienia, O systemie |
| 🎨 **Motywy** | 5 motywów (Aurora, Midnight, Ember, Forest, Daylight) + 5 animowanych tapet |
| 🔊 **Audio** | W pełni proceduralny projekt dźwięku WebAudio — dźwięk bootu, kliknięcia UI, przeciągnięcia okien, brzęczyk błędów. Żadnych plików audio. |

## 🚀 Szybki start

```bash
npm install          # instaluje esbuild (narzędzie buildowe tylko dla dev)
npm run build        # bundluje do dist/ (main.js + style.css)
npm run serve        # http://localhost:8080
```

Otwórz http://localhost:8080 i uruchom system.

| Komenda | Co robi |
|---|---|
| `npm run build` | Bundle esbuild → `dist/main.js`, kopiuje CSS |
| `npm run typecheck` | ścisła kontrola typów `tsc` |
| `npm test` | uruchamia testy logiki rdzenia (EventBus, FS, shell) |
| `npm run serve` | statyczny serwer dla `index.html` |

## 🖱️ Pierwsze kroki w systemie

1. Kliknij dwukrotnie **Terminal** na pulpicie (albo użyj menu Start ◈).
2. Wpisz `help`, aby wyświetlić wszystkie 35+ komend.
3. `neofetch` pokaże baner systemu, `fortune` — sentencje.
4. Twórz pliki: `echo hello > hello.txt`, potem `cat hello.txt`.
5. `open editor hello.txt` do edycji graficznej.
6. Kliknij prawym przyciskiem pulpit: nowy folder, nowy plik, tapeta, ekran blokady.
7. `ps` + `kill <pid>` do zarządzania procesami.
8. Wciśnij **Ctrl+Alt+L**, aby zablokować system.

## 🗂️ Struktura projektu

```
aurora-os/
├── index.html              # Ekran bootu + DOM pulpitu
├── src/
│   ├── main.ts             # Wejście jądra: boot, pulpit, pasek zadań, menu Start, ekran blokady
│   ├── style.css           # Kompletny arkusz stylów OS (szklany UI, tapety, animacje)
│   ├── core/
│   │   ├── EventBus.ts     # Typowany backbone pub/sub
│   │   ├── ProcessManager.ts # Przydział PID, tablica procesów, telemetria
│   │   ├── WindowManager.ts  # Cykl życia okien, drag/resize/fokus/z-order
│   │   └── AppRegistry.ts  # Deklaratywny katalog aplikacji + launcher
│   ├── fs/
│   │   └── FileSystem.ts   # Wirtualny system plików (ścieżki, CRUD, trwałość)
│   ├── term/
│   │   ├── commands.ts     # Interpreter 35+ komend (czysty, testowalny)
│   │   └── Terminal.ts     # Interaktywny shell UI (historia, dokańczanie)
│   ├── apps/               # Terminal, Pliki, Edytor, Kalkulator, Paint,
│   │                       # Monitor, Ustawienia, O systemie
│   └── sound/
│       └── SoundSystem.ts  # Proceduralne efekty dźwiękowe WebAudio
├── tests/
│   └── run-tests.mjs       # Harness testów logiki rdzenia (bez DOM)
└── scripts/
    └── copy-assets.mjs     # Kopiuje CSS obok bundla
```

## 🧠 Architektura

```
┌─────────────────────────── Przeglądarka ───────────────────────────┐
│  boot() ──► ekran bootu ──► shell pulpitu                          │
│                                                                   │
│  ┌────────────┐   ┌─────────────┐   ┌───────────────────┐         │
│  │ WindowMgr  │   │ ProcessMgr  │   │    AppRegistry    │         │
│  │ drag/resize│   │ pid/ps/kill │   │ 8 zarej. aplikacji│         │
│  └─────┬──────┘   └──────┬──────┘   └────────┬──────────┘         │
│        └─────────────────┼───────────────────┘                    │
│                     ┌────▼─────┐                          ┌─────▼─────┐
│                     │ EventBus │◄── każdy moduł rozmawia   │ FileSystem│
│                     └────┬─────┘    tylko przez zdarzenia  │ +persist  │
│                          │                                └───────────┘
│                    ┌─────▼──────┐
│                    │   shell    │  Terminal ⇄ commands.ts ⇄ FileSystem
│                    └────────────┘
└───────────────────────────────────────────────────────────────────┘
```

**Reguły projektowe**

- **Brak bezpośrednich importów między podsystemami** — wszystko komunikuje
  się przez typowany `EventBus`, więc każdy moduł jest niezależnie testowalny.
- **Czysty rdzeń, cienki UI** — interpreter shella, system plików i event bus
  działają bez DOM; przeglądarka tylko renderuje.
- **Zero zależności w runtime** — bez Reacta, bez Reduxa, bez bundlera
  w wyjściu. `esbuild` to narzędzie buildowe tylko dla dev.

## 🧪 Testowanie

Logika rdzenia jest wolna od DOM i pokryta testami:

```bash
npm test
```

Obejmuje EventBus (emit/once/unsubscribe/izolacja błędów), system plików
(rozwiązywanie ścieżek, CRUD, kody błędów, operacje rekurencyjne) i interpreter
shella (echo, cd/pwd, ls, przekierowanie, cat, mkdir, touch, wc, nieznane
komendy).

## 📜 Licencja

MIT — rób z tym, co chcesz.
