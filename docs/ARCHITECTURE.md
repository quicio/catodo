---
id: architecture
status: vigente
version: 1.0.0
updated: 2026-11-10
---

# Arquitectura — Cátodo

## Flujo

```
Electron (kiosko, frameless)
   │  carga http://127.0.0.1:8767 (prod) o :1420 (dev, Vite)
   ▼
Frontend React ──HTTP/WS──► Backend FastAPI (:8765 dev / :8767 prod)
                                 │
                                 ├── manager.py       registro y orden de canales
                                 ├── channels/        canales nativos (spotify)
                                 ├── plugin_system.py canales declarativos (web)
                                 ├── store.py         estado de usuario
                                 └── servicios        media, lyrics, cast, arcade, boxart, mqtt
                                 │
                                 ▼
                      ~/.local/share/catodo/   config, wallpapers, estado
```

El backend sirve además el frontend compilado como estáticos (`backend/static/`),
así que en prod hay **un solo proceso** atendiendo UI y API.

## Capas (backend)

| capa | módulos | regla |
|---|---|---|
| dominio | `domain/`, `channel.py`, `config.py` | sin FastAPI ni IO de sistema |
| aplicación | `manager.py`, `store.py`, `modes.py`, `runtime_config.py` | orquesta dominio; no habla HTTP |
| infraestructura | `channels/`, `media.py`, `lyrics.py`, `cast.py`, `arcade.py`, `mqtt_bridge.py`, `platform.py`, `datadir.py` | adaptadores concretos (MPRIS, webview, SQLite, systemd) |
| interfaz | `api.py`, `libraries_api.py`, `plugins_api.py`, `__main__.py` | HTTP/WS y arranque |

## Contrato de canal

`backend/catodo/channel.py` define:

```python
ChannelType = Literal["media", "web", "app", "dashboard", "launcher"]

class Channel(ABC):
    id: str; name: str; icon: str = ""
    type: ChannelType = "web"
    capabilities: frozenset[str] = frozenset()
    order: int | None = None
    @abstractmethod
    async def open(self) -> None: ...
```

Capacidades opcionales vía `Protocol` con `@runtime_checkable`:
`SupportsEpisodes`, `SupportsStream`, `SupportsBoxart`, `SupportsHistory`.
El consumidor pregunta `isinstance(ch, SupportsEpisodes)`, no el `type`.

Consecuencia práctica: **agregar un canal nativo** = nueva clase en `channels/`,
registrada en `manager.py`, con sus capabilities; **agregar un canal web** = sólo
un `manifest.json` en `plugins-repo/` (ADR-0001).

## Canales declarativos (plugins)

`plugins-repo/<id>/manifest.json`:

```json
{ "id": "youtube", "name": "YouTube", "version": "1.0.2", "type": "web",
  "icon": "play", "color": "#ff0033", "url": "https://www.youtube.com/tv",
  "search_url": "https://www.youtube.com/tv#/search?query={query}",
  "user_agent": "android-tv", "partition": "persist:youtube",
  "order": 1, "config_key": "youtube_url" }
```

`plugin_system.py` los descubre y valida; `plugins_api.py` los expone; el backend
los materializa en el frontend como canales web con webview y `partition`
persistente. **No se ejecuta código de terceros.**

## Frontend

- React + Vite; `App.tsx` compone canales, temas y barra de canales.
- `webgl/` para los efectos CRT/VHS/4K; `cast/` para proyección; `components/` y
  `theme.ts` para el sistema de temas v2.
- Regla: la UI **no** implementa canales ni habla con servicios externos; pide
  todo al backend.

## Modos de ejecución

| modo | backend | UI | notas |
|---|---|---|---|
| dev | `:8765` | Vite `:1420` con HMR | `./run-dev.sh` recicla el backend si `themes.py` es más nuevo que el proceso |
| prod | `:8767` | estáticos en `backend/static/` | `./run-prod.sh`, AppImage, `systemd/` |

DRM: el canal TV necesita Widevine → Electron castLabs en dev
(`scripts/install_castlab.sh`); el AppImage usa Electron stock y no lo tiene
(ADR-0003).

## Puntos de extensión

1. **Canal nativo**: implementar `Channel` (+ Protocol si aporta capacidad) en
   `channels/`; registrar en `manager.py`; ruta en `api.py` si necesita endpoints.
2. **Canal web**: `plugins-repo/<id>/manifest.json` + entrada en
   `plugins-repo/index.json` + tema/icono si aplica.
3. **Tema**: capacidad `theme-system` de openspec — presets y personalizaciones
   en `themes.py` + `theme.ts`.
4. **Layout de home**: capacidad `home-layouts` — registry de slots declarativo.

## Errores

Los canales degradan: si Spotify/MPRIS no responde, el canal informa estado y el
resto sigue funcionando. El backend no debe caerse por un canal o un plugin roto;
`plugin_system.py` valida manifiestos y descarta los inválidos con log.

## Rendimiento

Diseñado para correr 24/7 en un solo equipo: kiosko fullscreen, backend único,
frontend estático, webviews con partición persistente. No hay presupuesto medido
todavía; si se agrega, va acá con el comando que lo produce.

## Deuda deliberada

- Port a macOS en curso (commits `port to mac silicon`, `spotify on macOS`): el
  target sigue siendo Linux, macOS es entorno de desarrollo.
- `test_arcade` depende de un binario emulador del sistema (rompe en macOS).
- El typecheck del frontend depende de `node_modules` presente y de un `npx tsc`
  que no tiene script propio.
