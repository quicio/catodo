---
id: handoff
status: vigente
version: 2.0.0
updated: 2026-11-14
---

# Handoff — Cátodo

## Qué es

Shell multimedia para Linux inspirado en TVs CRT: convierte un monitor en una
"smart TV" controlada por HTTP. Backend Rust (axum) que sirve API + frontend
estático; frontend React; shell Electron en kiosko fullscreen. Cada app es un
**canal** (Spotify, YouTube, Anime, TV, Crunchyroll).

En esta máquina (macOS arm64) se desarrolla el target Linux (`systemd/`,
`install.sh`, AppImage). No queda backend Python.

## Estado medido (2026-11-14)

| métrica | valor | comando |
|---|---|---|
| tests Rust | **54 pasan, 0 fallan** | `cd rust && cargo test --workspace` |
| quality gate completo | **verde** | `./scripts/check.sh` |
| typecheck frontend | limpio | `npm run typecheck` |
| workspace Rust | 3 crates, 35 archivos `.rs`, 10.106 líneas | `find rust/crates -name '*.rs' \| xargs cat \| wc -l` |
| frontend | 44 archivos `.ts/.tsx`, 8.888 líneas | `find frontend/src …` |
| specs | 34 capacidades en `openspec/specs/` | `ls openspec/specs` |
| changes activos | 6 en `openspec/changes/` | `ls openspec/changes \| grep -v archive` |
| versión | `0.12.0` | `cat VERSION` |
| rama | `main`, al día con `origin/main` | `git log --oneline` |

### Backend Rust y retiro de Python

- `VERSION` único, `/api/version`, `catodo-server --version` y
  `scripts/check-version.sh` sin Python.
- App macOS única con el backend Rust embebido (`release/backend-rust`);
  Electron lo lanza como sidecar y lo apaga al salir.
- `run-dev.sh` y `run-prod.sh` usan sólo Rust. Se eliminó la rama
  `CATODO_DEV_BACKEND=python` y el paquete `backend/catodo/`.
- Gate/CI sin `uv`, `ruff`, `pytest` ni job `backend`. CI corre `cargo audit` y
  `npm audit --omit=dev`; MQTT usa TCP plano y `rumqttc` sin features TLS para
  evitar el rustls viejo que arrastraba `rumqttc 0.24`.
- Instalador sin Python/uv/PyGObject ni `plugin-venv`; compila
  `cargo build --release -p catodo-server`.
- PyInstaller y `packaging/macos/` retirados; el release usa
  `scripts/package-rust-backend.sh`.
- Remote seguro: pairing de un solo uso, token de dispositivo, auth para
  LAN/túnel y kiosko loopback exento.
- Configuración sensible **local-only** (ADR-0012): emuladores de arcade, rutas,
  bibliotecas, túnel, MQTT y tokens no se pueden cambiar desde el remote. La
  falta de `ConnectInfo` se trata como request externa (fail-closed). Los ids de
  plugin se validan como slug antes de tocar el filesystem.
- Canales: `plugins-repo/` es catálogo; sólo YouTube es bundled. TV,
  Crunchyroll, Max y proveedores se instalan on-demand desde Ajustes → Canales o
  `/api/plugins/catalog`. Instalar registra el canal sin reiniciar, desinstalar
  lo quita y el orden se puede overridear por plugin. La URL de cada canal web
  se ajusta con `channel_<id>_url` (local-only). El arranque registra sólo
  plugins instalados y habilitados.
- Canales de emisión: `libraries` define canales de medios con nombre, carpeta,
  modo `series`/`videos`, icono, color y orden (CRUD en Ajustes → Emisión,
  local-only). No hay Anime builtin; `anime_dir`/`anime_progress` quedan
  inertes. La barra y Home usan los metadatos de cada canal.
- Los remotos se listan sin token y se revocan desde Ajustes
  (`GET/DELETE /api/pair/devices`, local-only). Los tokens vencen a los 30 días
  por defecto (`pair_token_ttl_days`; `0` = sin vencimiento) y los vencidos se
  rechazan y depuran.
- Cores libretro pineados por SHA-256 (ADR-0010) para `apple/osx/arm64` y
  `linux/x86_64`.
- Video crudo RGB565 + audio PCM por WebSocket, con H.264 como fallback
  (ADR-0009).

Los releases hasta `v0.12.0` están publicados con artefactos macOS (versionado +
alias estable `Catodo-mac-arm64.zip`), Linux (AppImage, deb, rpm,
`pkg.tar.zst`, source tarball) y `SHA256SUMS`. `brew install --cask
quicio/tap/catodo` se verificó en macOS arm64. Los artefactos incluyen Electron
ECS con Widevine (ADR-0007). Con `RELEASE_PAT`, release-please crea el Release
como usuario y `release: published` dispara `release.yml` sin aprobación manual
de workflows.

Pendiente de validación externa (no bloquea el código): probar
`install.sh`/AppImage en un Linux limpio.

## Instalación en un clone nuevo

```bash
cd frontend && npm ci                 # crea node_modules (necesario para el gate)
./scripts/check.sh                    # debe quedar verde
```

## Comandos

```bash
./scripts/check.sh                 # gate: tsc + version + Rust
./scripts/check-rust.sh            # fmt + clippy + tests + límites de capas
./scripts/check-version.sh         # VERSION vs manifests (Node)
./run-dev.sh                       # backend :8765 + Vite :1420 (HMR)
./run-prod.sh start                # backend :8767 + bundle estático
cd rust && cargo run -p catodo-server      # backend Rust (default)
cd frontend && npm run electron:build:linux
cd rust && CATODO_RS_PORT=8769 cargo run -p catodo-server   # puerto alternativo
```

## Puertos (no romper)

| modo | backend | frontend | entrada |
|---|---|---|---|
| dev | `:8765` | Vite `:1420` | `./run-dev.sh` |
| prod | `:8767` | bundle en `backend/static/` | `./run-prod.sh`, AppImage |
| alternativo | `:8769` | — | `cd rust && cargo run -p catodo-server` |
| app macOS | puerto libre | bundle embebido | cask `catodo` |

Los modos pueden convivir: dev **no toca** el daemon de prod. La heurística de
reciclado compara el start time del proceso contra el mtime de
`rust/crates/catodo-server/src/main.rs`.

## Mapa de módulos

| path | hace | no hace |
|---|---|---|
| `rust/crates/catodo-domain/` | tipos puros y contrato de datos | no conoce HTTP ni IO |
| `rust/crates/catodo-platform/` | data dir, plugins repo y adapters OS | no conoce axum |
| `rust/crates/catodo-server/src/api.rs` | rutas REST + WebSocket + auth | no implementa canales |
| `rust/crates/catodo-server/src/channels.rs` | trait `Channel` y canales web | no sirve archivos estáticos |
| `rust/crates/catodo-server/src/manager.rs` | registro/orden de canales, ciclo de vida | no dibuja UI |
| `rust/crates/catodo-server/src/plugins.rs` | plugins declarativos (`manifest.json`) | no ejecuta código de terceros |
| `rust/crates/catodo-server/src/store.rs` | persistencia de estado de usuario | no expone HTTP |
| `rust/crates/catodo-server/src/{media,lyrics,cast,arcade,iptv,mqtt}.rs` | servicios por dominio | no conocen React |
| `backend/static/` | frontend compilado + remote PWA + cast | no contiene lógica de canales |
| `backend/systemd/` | unit de usuario para prod Linux | no se ejecuta en dev |
| `frontend/src/` | UI: canales, temas, WebGL, cast | sin lógica de negocio de canales |
| `frontend/electron/` | shell kiosko y resolución del sidecar | sin lógica de canales |
| `scripts/` | gate, packaging, verificación y dev | no implementa runtime |
| `.github/workflows/` | CI, release-please y release | no define comportamiento de canales |
| `openspec/` | **fuente de verdad** de specs y changes | no es documentación de arquitectura |

## Invariantes que no se rompen

1. **Un canal es una implementación del trait `Channel`**, con `id`, `type`
   (`media`/`web`/`app`/`dashboard`/`launcher`) y capacidades declaradas en
   `ChannelInfo` o por métodos opcionales del trait. Si agregás comportamiento
   opcional, es un método nuevo con default.
2. **El frontend es UI**: no implementa canales ni habla con Spotify/YouTube por
   su cuenta; consume la API.
3. **Datos de usuario en `~/.local/share/catodo/`** (config, wallpapers, estado).
   Nada de escribir en el árbol del repo en runtime.
4. **Dev y prod no comparten puerto ni proceso.** Un cambio que unifique ambos
   rompe el flujo de trabajo real.
5. **Los plugins son declarativos**: `manifest.json` con `id`, `type`, `url`,
   `user_agent`, `partition`, `order`. Sin código ejecutable de terceros ni
   dependencias pip.
6. **El backend sirve el frontend compilado** desde `backend/static/`; el
   frontend en dev corre aparte con HMR.
7. **Los cores libretro se validan por hash** antes de cargarse; si no hay pin o
   no coincide, se falla cerrado.
8. **La administración es local-only**: el remote emparejado reproduce, cambia
   tema/layout/volumen y navega canales, pero no toca rutas, emuladores,
   bibliotecas, túnel, MQTT ni tokens (ADR-0012).

## Cómo verificar sin ojos humanos

```bash
./scripts/check.sh                       # tsc + version + Rust
./scripts/check-rust.sh                  # fmt + clippy + tests + capas
./scripts/check-version.sh               # VERSION vs manifests
node scripts/verify-home-layout.mjs      # layouts de home
node scripts/extract-icon-data.mjs       # iconos
```

Para UI no hay captura headless: la verificación visual es `./run-dev.sh` en el
navegador o Electron. Documentar cualquier atajo nuevo acá.

## Deuda y drift conocidos

| tema | estado | qué hacer |
|---|---|---|
| specs en `openspec/`, no en `docs/specs/` | decisión, no deuda | `docs/` envuelve; no duplicar |
| `ROADMAP.md` de raíz inexistente | el backlog real son los changes de openspec | `docs/ROADMAP.md` mapea a openspec |
| tap Homebrew | `Casks/catodo.rb` en `quicio/homebrew-tap`; cask estático | Homebrew 5+ requiere `brew trust quicio/tap`; no usa token |
| runners macOS en CI | se usa `macos-15` | no volver a `macos-14` |
| release-please | habilitado con `RELEASE_PAT` | el Release lo crea un usuario y dispara `release.yml`; `release-auto.yml` queda como fallback sin PAT |
| publish con `--clobber` | si el job falla a mitad quedan assets faltando | desde el fix sólo se suben archivos |
| salida del kiosko | `⌘⇧Q` con confirmación + botón en Ajustes | no romper esos dos caminos |
| tray client | `clients/tray/` (Tauri) no se compila ni distribuye | integrarlo al pipeline o archivar el change |
| cores libretro | buildbot publica sólo `latest`; el pin es por contenido | si cambia el nightly, regenerar `cores.lock.json` y publicar release |
| plataformas de cores | sólo `apple/osx/arm64` y `linux/x86_64` | agregar al lock con `scripts/update-cores.sh <plataforma>` |
| Linux release autocontenido | `install.sh` + deps del sistema | validar en una máquina limpia |
| app macOS sin notarizar | cask incluye caveat de Gatekeeper | notarización pendiente |
| Widevine empaquetado | ECS 45 con CDM en runtime | falta probar más proveedores con cuenta real |
| firma VMP | ECS trae VMP de desarrollo | firmar con EVS si un proveedor lo exige |

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
- **No reintroducir Python/uv/pytest** en el backend (ADR-0011). El runtime, el
  gate y el packaging son Rust + Node.
- **No volver a poner `productName: "Cátodo"`** (con acento): el ejecutable con
  nombre no-ASCII crashea V8/Electron en macOS 26. Usar `Catodo.app` y
  `CFBundleDisplayName: "Cátodo"`.

## Definición de terminado (por tarea)

- [ ] `./scripts/check.sh` sin fallas nuevas.
- [ ] Si tocó Rust: `./scripts/check-rust.sh` verde y límites de capas OK.
- [ ] Si tocó versión/release: `./scripts/check-version.sh` verde.
- [ ] Si tocó UI: verificado con `./run-dev.sh`.
- [ ] Si tocó un canal: contrato `Channel` respetado y capability declarada.
- [ ] Spec de openspec actualizada en el mismo commit (`openspec/specs/<cap>/spec.md`).
- [ ] Commit atómico en imperativo.
