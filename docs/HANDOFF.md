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
| tests backend | **191 pasan, 2 fallan** (193) en 52.6 s | `./scripts/check.sh` → `pytest` |
| quality gate completo | falla, 69.6 s | `./scripts/check.sh` |
| typecheck frontend | **no corre** (ver abajo) | `npx tsc --noEmit` |
| backend | 53 archivos `.py`, 7.595 líneas | `find backend/catodo -name '*.py' \| xargs cat \| wc -l` |
| frontend | 39 archivos `.ts/.tsx`, 6.944 líneas | `find frontend/src …` |
| tests backend | 30 archivos en `backend/tests/` | `ls backend/tests` |
| specs | **21 capacidades** (32 `.md`) en `openspec/specs/` | `ls openspec/specs` |
| changes activos | 7 en `openspec/changes/` | `ls openspec/changes \| grep -v archive` |
| git | rama `main`, HEAD `697f9cf` | `git log -1` |

### Por qué el gate está en rojo (y no es el código)

1. **`test_arcade` (2 tests)**: usan `/bin/true` como emulador falso. En macOS no
   existe → `FileNotFoundError`. Es un test Linux-only, no un bug del launcher.
2. **typecheck frontend**: `scripts/check.sh` corre `npx tsc --noEmit`, pero
   `frontend/node_modules` **no existe** en este clone y `frontend/package.json`
   **no tiene script `typecheck`**. Sin `node_modules`, `npx` descarga el paquete
   equivocado (`tsc@2.0.4`, deprecado) y falla con un mensaje engañoso.

Para tener el gate verde en macOS:

```bash
cd frontend && npm ci        # devuelve node_modules y el tsc real
# y para arcade: correr esos dos tests en Linux, o parametrizar el binario falso
```

## Comandos

```bash
./scripts/check.sh                 # gate: ruff + pytest + tsc (69 s)
./run-dev.sh                       # backend :8765 + Vite :1420 (HMR)
./run-prod.sh start                # backend :8767 + bundle estático
cd backend && uv run python -m catodo
cd frontend && npm run electron:build:linux
```

## Puertos (no romper)

| modo | backend | frontend | entrada |
|---|---|---|---|
| dev | `:8765` | Vite `:1420` | `./run-dev.sh` |
| prod | `:8767` | bundle en `backend/static/` | `./run-prod.sh`, AppImage |

Los dos pueden convivir: dev **no toca** el daemon de prod. La heurística de
reciclado compara el start time del proceso contra el mtime de `themes.py`.

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
./scripts/check.sh                       # lint + tests + typecheck (el gate)
cd backend && uv run pytest -q backend/tests/test_api.py
node scripts/verify-home-layout.mjs      # layouts de home
node scripts/extract-icon-data.mjs       # iconos
```

Para UI no hay captura headless: la verificación visual es `./run-dev.sh` en el
navegador o Electron. Documentar cualquier atajo nuevo acá.

## Deuda y drift conocidos

| tema | estado | qué hacer |
|---|---|---|
| `test_arcade` con `/bin/true` | Linux-only, falla en macOS | parametrizar el binario o marcar skip por plataforma |
| `check.sh` usa `npx tsc` | requiere `node_modules` previo y no hay script `typecheck` | `npm ci` en CI/instalación; agregar script `typecheck` al `package.json` |
| Python 3.14 resuelto por uv | `openspec/config.yaml` declara 3.12 | fijar `requires-python` en `pyproject.toml` si importa |
| specs en `openspec/`, no en `docs/specs/` | decisión, no deuda | `docs/` envuelve; no duplicar |
| `ROADMAP.md` de raíz inexistente | el backlog real son los 7 changes de openspec | `docs/ROADMAP.md` mapea a openspec |

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
- **No asumir Linux-only en tests nuevos**: si un test necesita un binario del
  sistema, se parametriza o se marca por plataforma (caso `test_arcade`).

## Definición de terminado (por tarea)

- [ ] `./scripts/check.sh` sin fallas nuevas (hoy 2 fallas conocidas por entorno).
- [ ] Si tocó UI: verificado con `./run-dev.sh`.
- [ ] Si tocó un canal: contrato `Channel` respetado y capability declarada.
- [ ] Spec de openspec actualizada en el mismo commit (`openspec/specs/<cap>/spec.md`).
- [ ] Commit atómico en imperativo.
