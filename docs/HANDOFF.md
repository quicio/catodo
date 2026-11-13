---
id: handoff
status: vigente
version: 1.0.0
updated: 2026-11-10
---

# Handoff — Cátodo

## Qué es

Shell multimedia para Linux inspirado en TVs CRT: convierte un monitor en una
"smart TV" controlada por HTTP. Backend FastAPI que sirve API + frontend
estático; frontend React; shell Electron en kiosko fullscreen. Cada app es un
**canal** (Spotify, YouTube, Anime, TV, Crunchyroll).

En esta máquina (macOS arm64) se está **portando**: el target real sigue siendo
Linux (`systemd/`, `install.sh`, AppImage).

## Estado medido (2026-11-10)

| métrica | valor | comando |
|---|---|---|
| tests backend | **201 pasan, 0 fallan** | `./scripts/check.sh` → `pytest` |
| quality gate completo | **verde**, ~50 s | `./scripts/check.sh` |
| typecheck frontend | limpio (tsc 5.9.3 local) | `npm run typecheck` |
| Rust workspace | 3 crates, 6.212 líneas `.rs`, tests de contrato verdes | `./scripts/check-rust.sh` |
| backend | 55 archivos `.py`, 7.695 líneas | `find backend/catodo -name '*.py' \| xargs cat \| wc -l` |
| frontend | 39 archivos `.ts/.tsx`, 6.944 líneas | `find frontend/src …` |
| tests backend | 30 archivos en `backend/tests/` | `ls backend/tests` |
| specs | 32 capacidades en `openspec/specs/` | `ls openspec/specs` |
| changes activos | 8 en `openspec/changes/` | `ls openspec/changes \| grep -v archive` |
| git | rama `main`, HEAD `d619494` + M1 sin commitear | `git log -1` |

### M1–M5 — Release + backend Rust

Implementado en el working tree:

- `VERSION` único, `/api/version`, `catodo --version` y `scripts/check-version.sh`.
- release-please, CI Linux/macOS, release pipeline, checksums y artefactos.
- App macOS única con el backend Rust embebido (`release/backend-rust`, ~13 MB);
  Electron lo lanza como sidecar y lo apaga al salir.
- `run-dev.sh` y `run-prod.sh` usan Rust por defecto; Python queda como fallback
  (`CATODO_DEV_BACKEND=python`).
- Zip `Catodo-0.1.1-mac-arm64.zip` (~120 MB; +18 MB por ECS/Widevine), source
  tarball (~3.6 MB).
- Shell sobre Electron for Content Security (ECS) 45.2.1+wvcus: el CDM de
  Widevine se instala en runtime (`components.whenReady()`) y funciona en dev, en
  `Catodo.app` y en el AppImage (ADR-0007, reemplaza ADR-0003).
- Cask estático `catodo` publicado en el tap existente
  [`quicio/homebrew-tap`](https://github.com/quicio/homebrew-tap):
  `brew install --cask quicio/tap/catodo` (macOS arm64, sin notarizar).
- Canal IPTV (`iptv.rs`): playlist M3U/M3U8 local o por URL, grupos, zapping y
  proxy ffmpeg en vivo (`/api/channels/iptv/stream`); se configura con
  `iptv_playlist` y `iptv_headers`.
- API Rust: config/state/WS, canales web, Spotify (AppleScript), media/anime,
  arcade, plugins, libraries, modes, pair/QR, lyrics, wallpapers, tunnel, MQTT,
  cast, voice, mouse, idle y volumen.
- `rust/` con `catodo-domain`, `catodo-platform`, `catodo-server`, tests de
  contrato y límites de capas.

Los releases `v0.1.0`, `v0.1.1`, `v0.2.0`, `v0.2.1`, `v0.3.0` y `v0.4.0` están
publicados
con los artefactos macOS (versionado + alias estable `Catodo-mac-arm64.zip`),
Linux (AppImage, deb, source tarball) y `SHA256SUMS`. Desde `v0.2.0` los
artefactos incluyen Electron ECS con Widevine (ADR-0007) y desde `v0.3.0` la app
se puede cerrar con `⌘⇧Q` o un botón en Ajustes. `brew install --cask
quicio/tap/catodo` se verificó en esta máquina (macOS arm64) hasta `0.3.0`:
instala, quita la cuarentena y arranca con el sidecar Rust y Widevine disponible.

Pendiente de validación externa (no bloquea el código): probar
`install.sh`/AppImage en un Linux limpio. En CI, los runners macOS arm64 tienen
capacidad limitada (los jobs de `macos-15` se encolan varios minutos) y
`tests/test_arcade.py` + `test_boxart.py` fallaron una vez ahí aunque pasan
local; revisar si vuelve a pasar.

### Cómo se dejó el gate verde (en macOS)

Dos problemas de entorno, ninguno del producto, ya resueltos:

1. **`frontend/node_modules` ausente**: `check.sh` corre `npm run typecheck`
   (`tsc --noEmit`). Sin dependencias falla con `sh: tsc: command not found`;
   solución: `cd frontend && npm ci`. Antes usaba `npx tsc`, que descargaba el
   paquete equivocado (`tsc@2.0.4`) y daba un mensaje engañoso.
2. **`test_arcade` usaba `/bin/true`** como emulador falso (no existe en macOS).
   Ahora resuelve el binario con `shutil.which("true")` — portable sin perder el
   sentido del test.

Verificación: `./scripts/check.sh` → ruff limpio, **201 tests**, tsc limpio.

### Instalación en un clone nuevo

```bash
cd backend && uv sync --group dev     # crea backend/.venv
cd frontend && npm ci                 # crea node_modules (necesario para el gate)
./scripts/check.sh                    # debe quedar verde
```

## Comandos

```bash
./scripts/check.sh                 # gate: ruff + pytest + tsc + version + Rust
./scripts/check-rust.sh            # fmt + clippy + tests + límites de capas
./scripts/check-version.sh         # VERSION vs manifests
./run-dev.sh                       # backend :8765 + Vite :1420 (HMR)
./run-prod.sh start                # backend :8767 + bundle estático
cd rust && cargo run -p catodo-server      # backend Rust (default)
cd backend && uv run python -m catodo     # backend Python (fallback dev)
cd frontend && npm run electron:build:linux
cd rust && CATODO_RS_PORT=8769 cargo run -p catodo-server   # backend Rust (M1)
```

## Puertos (no romper)

| modo | backend | frontend | entrada |
|---|---|---|---|
| dev | `:8765` | Vite `:1420` | `./run-dev.sh` |
| prod | `:8767` | bundle en `backend/static/` | `./run-prod.sh`, AppImage |
| rust (M1) | `:8769` | — | `cd rust && cargo run -p catodo-server` |
| app macOS | puerto libre | bundle embebido | cask `catodo` |

Los modos pueden convivir: dev **no toca** el daemon de prod. La heurística de
reciclado compara el start time del proceso contra el mtime de `rust/crates/catodo-server/src/main.rs`.

## Mapa de módulos

| path | hace | no hace |
|---|---|---|
| `backend/catodo/api.py` | rutas REST + WebSocket | no implementa canales |
| `backend/catodo/channel.py` | contrato `Channel` (ABC + Protocols de capacidades) | no conoce HTTP |
| `backend/catodo/channels/` | canales nativos (`spotify.py`) | no sirve archivos |
| `backend/catodo/manager.py` | registro/orden de canales, ciclo de vida | no dibuja UI |
| `backend/catodo/plugin_system.py` | plugins declarativos (`manifest.json`) | no ejecuta código de terceros |
| `backend/catodo/store.py` | persistencia de estado de usuario | no expone HTTP |
| `backend/catodo/{media,lyrics,cast,arcade,boxart}.py` | servicios por dominio | no conocen React |
| `frontend/src/` | UI: canales, temas, WebGL, cast | sin lógica de negocio de canales |
| `frontend/electron/` | shell kiosko (ventana frameless, webview) | sin lógica de canales |
| `frontend/electron/backend.cjs` | resolución de backend dev/fallback y utilidades del sidecar | no implementa canales |
| `rust/` | backend Rust: domain, platform, server; release/dev/prod default | Python queda como fallback de desarrollo |
| `packaging/` | cask de Homebrew y spec de PyInstaller | no se ejecuta en runtime |
| `.github/workflows/` | CI, release-please y release | no define comportamiento de canales |
| `openspec/` | **fuente de verdad** de specs y changes | no es documentación de arquitectura |

## Invariantes que no se rompen

1. **Un canal es una implementación de `Channel`**, con `id`, `type`
   (`media`/`web`/`app`/`dashboard`/`launcher`) y capacidades declaradas por
   Protocols (`SupportsEpisodes`, `SupportsStream`, `SupportsBoxart`,
   `SupportsHistory`). Si agregás comportamiento opcional, es un Protocol nuevo.
2. **El frontend es UI**: no implementa canales ni habla con Spotify/YouTube por
   su cuenta; consume la API.
3. **Datos de usuario en `~/.local/share/catodo/`** (config, wallpapers, estado).
   Nada de escribir en el árbol del repo en runtime.
4. **Dev y prod no comparten puerto ni proceso.** Un cambio que unifique ambos
   rompe el flujo de trabajo real.
5. **Los plugins son declarativos**: `manifest.json` con `id`, `type`, `url`,
   `user_agent`, `partition`, `order`. Sin código ejecutable de terceros.
6. **El backend sirve el frontend compilado** desde `backend/static/`; el
   frontend en dev corre aparte con HMR.

## Cómo verificar sin ojos humanos

```bash
./scripts/check.sh                       # lint + tests + typecheck + version + Rust
./scripts/check-rust.sh                  # fmt + clippy + tests + capas
./scripts/check-version.sh               # VERSION vs manifests
cd backend && uv run pytest -q backend/tests/test_api.py
node scripts/verify-home-layout.mjs      # layouts de home
node scripts/extract-icon-data.mjs       # iconos
```

Para UI no hay captura headless: la verificación visual es `./run-dev.sh` en el
navegador o Electron. Documentar cualquier atajo nuevo acá.

## Deuda y drift conocidos

| tema | estado | qué hacer |
|---|---|---|
| Python 3.14 resuelto por uv | `openspec/config.yaml` declara 3.12 | fijar `requires-python` en `pyproject.toml` si importa |
| specs en `openspec/`, no en `docs/specs/` | decisión, no deuda | `docs/` envuelve; no duplicar |
| `ROADMAP.md` de raíz inexistente | el backlog real son los changes de openspec | `docs/ROADMAP.md` mapea a openspec |
| tap Homebrew | `Casks/catodo.rb` en `quicio/homebrew-tap` (Candil sigue intacto); `v0.1.0` publicado y `brew install --cask quicio/tap/catodo` verificado | Homebrew 5+ requiere `brew trust quicio/tap`; no usa token |
| runners macOS en CI | `macos-14` no existe para la org; se usa `macos-15`, que funciona pero se encola por capacidad | no volver a `macos-14` |
| tests arcade/boxart | flakearon en CI macOS (pasan local y en la corrida previa) | si reincide, aislar el `_scan`/watcher del timing del runner |
| release-please | habilitado: la org ya permite que Actions cree PRs, y el PR de release se abre solo | el release que crea no dispara `release.yml` (eventos con `GITHUB_TOKEN` no encadenan workflows): correr `gh workflow run release.yml -f tag=vX.Y.Z` |
| publish con `--clobber` | si el job falla a mitad, los assets ya borrados quedan faltando (pasó en `v0.1.1`: el workflow del tag todavía subía `release/*` y moría en `backend-rust/`) | el tag `v0.1.1` conserva esa versión vieja; no re-disparar releases viejos. Desde el fix sólo se suben archivos |
| salida del kiosko | la ventana es `kiosk: true` + fullscreen y `win.setMenu(null)` deja la app sin ⌘Q; agregado ⌘⇧Q con confirmación + botón en Ajustes → General | no romper esos dos caminos al tocar el menú o el teclado |
| tray client | `add-system-tray-client` tiene las tareas al 100% pero `clients/tray/` (Tauri) no se compila ni se distribuye | integrarlo al pipeline o archivar el change como descartado |
| specs de apariencia | `theme-system` (modelo v1) se retiró al archivar `theme-personalization`; la capability vigente es `appearance` | no recrear `theme-system` |
| `pygobject` en CI | pasó a extra `mpris` del backend Python; `uv sync` ya no lo compila en Ubuntu 22.04 | el fallback Linux usa `uv sync --extra mpris` |
| Linux release autocontenido | `install.sh` + deps del sistema | llega en M4 con el backend Rust |
| app macOS sin notarizar | cask incluye caveat de Gatekeeper | notarización en M2/M5 |
| Widevine empaquetado | ECS 45 con CDM en runtime; verificado en `Catodo.app` (`com.widevine.alpha` + CDM 4.10.3112.0) | falta reproducir Movistar/HBO Max con cuenta real y probar el AppImage en Linux |
| firma VMP | ECS trae VMP de desarrollo | si un proveedor la rechaza o se necesitan licencias persistentes, firmar con EVS |

## Qué NO hacer

- **No duplicar specs**: openspec es la fuente de verdad (ADR-0004). Un archivo
  nuevo en `docs/specs/` que contradiga `openspec/specs/` es deuda inmediata.
- **No unificar los puertos dev/prod** (ADR-0002): es lo que permite tener el
  daemon estable corriendo mientras se desarrolla.
- **No meter lógica de canales en el frontend**: rompe el contrato `Channel` y
  hace imposible agregar un canal sin tocar React.
- **No agregar `node_modules` ni `backend/static` al repo**. Ya están ignorados.
- **No "arreglar" el gate bajando el typecheck**: el problema es `node_modules`,
  no el chequeo.
- **No asumir rutas de Linux en tests nuevos**: si un test necesita un binario del
  sistema, se resuelve con `shutil.which(...)` (caso `test_arcade`).
- **No volver a poner `productName: "Cátodo"`** (con acento): el ejecutable con
  nombre no-ASCII crashea V8/Electron en macOS 26. Usar `Catodo.app` y
  `CFBundleDisplayName: "Cátodo"`.

## Definición de terminado (por tarea)

- [ ] `./scripts/check.sh` sin fallas nuevas (hoy 2 fallas conocidas por entorno).
- [ ] Si tocó Rust: `./scripts/check-rust.sh` verde y límites de capas OK.
- [ ] Si tocó versión/release: `./scripts/check-version.sh` verde.
- [ ] Si tocó UI: verificado con `./run-dev.sh`.
- [ ] Si tocó un canal: contrato `Channel` respetado y capability declarada.
- [ ] Spec de openspec actualizada en el mismo commit (`openspec/specs/<cap>/spec.md`).
- [ ] Commit atómico en imperativo.
