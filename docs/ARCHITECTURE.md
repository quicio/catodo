---
id: architecture
status: vigente
version: 2.0.0
updated: 2026-11-14
---

# Arquitectura — Cátodo

## Flujo

```
Electron (kiosko, frameless)
   │  carga http://127.0.0.1:8767 (prod) o :1420 (dev, Vite)
   ▼
Frontend React ──HTTP/WS──► Backend Rust / axum (:8765 dev / :8767 prod)
                                 │
                                 ├── manager.rs     registro y orden de canales
                                 ├── channels.rs    trait Channel + canales web
                                 ├── plugins.rs     canales declarativos (manifest.json)
                                 ├── store.rs       estado de usuario
                                 └── servicios      media, lyrics, cast, arcade, iptv, mqtt…
                                 │
                                 ▼
                      ~/.local/share/catodo/   config, wallpapers, estado
```

El backend sirve además el frontend compilado como estáticos (`backend/static/`),
así que en prod hay **un solo proceso** atendiendo UI y API. No hay runtime
Python: dev, prod y release usan el mismo binario Rust.

## Capas (workspace Rust)

| crate | módulos | regla |
|---|---|---|
| `catodo-domain` | tipos puros (`Health`, `VersionInfo`, `ChannelInfo`, `AppState`) | sin HTTP, runtime async ni IO de sistema |
| `catodo-platform` | `data_dir`, `plugins_repo`, adapters OS (AppleScript, D-Bus/MPRIS, mezclador, entrada) | sin axum ni `catodo-server` |
| `catodo-server` | `api`, `manager`, `channels`, `plugins`, `store`, servicios | compone dominio + plataforma y expone HTTP/WS |

`./scripts/check-rust.sh` verifica con `cargo metadata` que `catodo-domain` no
dependa de `axum`, `tokio`, `hyper` ni de los otros crates, y que
`catodo-platform` no dependa de `axum`, `hyper` ni `catodo-server`.

## Contrato de canal

`rust/crates/catodo-server/src/channels.rs` define:

```rust
#[async_trait]
pub trait Channel: Send + Sync {
    fn info(&self) -> ChannelInfo;
    async fn open(&self) -> anyhow::Result<()>;
    async fn close(&self) -> anyhow::Result<()>;
    async fn state(&self) -> anyhow::Result<Value>;
    async fn command(&self, command: &str, args: Map<String, Value>) -> anyhow::Result<()>;

    // Capacidades opcionales: el default es "no soportado".
    async fn episodes(&self) -> Vec<Value> { Vec::new() }
    async fn current_stream(&self) -> Option<PathBuf> { None }
    async fn live_stream(&self) -> Option<LiveStream> { None }
    async fn audio_stream(&self) -> Option<LiveStream> { None }
    async fn live_frames(&self) -> Option<watch::Receiver<Option<Arc<LiveFrame>>>> { None }
    async fn audio_source(&self) -> Option<Arc<dyn AudioSource>> { None }
    async fn boxart(&self, _rel: &str) -> Option<PathBuf> { None }
    async fn history_state(&self) -> Value { json!({}) }
}
```

`ChannelInfo` (en `catodo-domain`) lleva `id`, `name`, `type`, `capabilities`
(`Vec<String>`), `order`, `color`, `partition`, `user_agent`, `search_url` y
`media_keys`. El consumidor consulta capacidades/métodos opcionales; no ramifica
por `if channel.type == ...`.

Consecuencia práctica: **agregar un canal nativo** = nueva implementación de
`Channel` en `channels.rs` o en un módulo de servicio (`media`, `iptv`,
`spotify`, `arcade`), registrada por `build_default_channels`; **agregar un canal
web** = sólo un `manifest.json` en `plugins-repo/` (ADR-0001).

## Canales declarativos (plugins)

`plugins-repo/<id>/manifest.json`:

```json
{ "id": "youtube", "name": "YouTube", "version": "1.0.2", "type": "web",
  "icon": "play", "color": "#ff0033", "url": "https://www.youtube.com/tv",
  "search_url": "https://www.youtube.com/tv#/search?query={query}",
  "user_agent": "android-tv", "partition": "persist:youtube",
  "order": 1, "config_key": "youtube_url" }
```

`plugins.rs` descubre y valida los manifests, y los expone por API; el backend
los materializa en el frontend como canales web con webview y `partition`
persistente. **No se ejecuta código de terceros**: no hay `dependencies` ni venv
de plugins (ADR-0011).

## Frontend

- React + Vite; `App.tsx` compone canales, temas y el menú vertical de canales (Tab).
- `webgl/` para los efectos CRT/VHS/4K; `cast/` para proyección; `components/` y
  `theme.ts` para el sistema de temas v2.
- Regla: la UI **no** implementa canales ni habla con servicios externos; pide
  todo al backend.

## Modos de ejecución

| modo | backend | UI | notas |
|---|---|---|---|
| dev | `:8765` o siguiente libre | Vite `:1420` o siguiente libre con HMR | `./run-dev.sh` elige puertos libres y reusa backend/Vite sanos por checkout |
| prod | `:8767` | estáticos en `backend/static/` | `./run-prod.sh`, AppImage, `systemd/` |
| app macOS | puerto libre | bundle embebido | `Catodo.app` lanza el binario Rust como sidecar |

DRM: el canal TV necesita Widevine → todo el shell corre sobre Electron
castLabs (ECS) y el CDM se instala en runtime vía la `components` API
(ADR-0003, ADR-0007).

## Seguridad y límites de confianza

- **Loopback (kiosko)**: sin token; acceso completo a configuración y
  administración.
- **LAN/túnel (remote)**: token de dispositivo emitido por pairing de un solo
  uso. Puede reproducir, navegar canales, cambiar volumen/tema/layout/idle y
  comandos de canales.
- **Local-only (ADR-0012)**: rutas de bibliotecas, comandos de emuladores de
  arcade, `plugin_repo`, túnel, MQTT, URLs de canales y estado de pairing. Un
  request externo autenticado recibe 403.
- Si una request no trae `ConnectInfo`, se clasifica como externa
  (fail-closed).
- Los plugins se validan como slug `[a-z0-9-]+` antes de resolver paths.
- Los dispositivos emparejados se listan sin exponer el token y se pueden
  revocar desde el kiosko (`GET/DELETE /api/pair/devices`, local-only).

## Puntos de extensión

1. **Canal nativo**: implementar `Channel` en `channels.rs` o en su módulo de
   servicio; registrarlo en `build_default_channels`; ruta en `api.rs` si
   necesita endpoints.
2. **Canal web**: `plugins-repo/<id>/manifest.json` + entrada en
   `plugins-repo/index.json` + tema/icono si aplica.
3. **Tema**: presets y personalizaciones en `themes.json` + `theme.ts`.
4. **Layout de home**: capacidad `home-layouts` — registry de slots declarativo.

## Errores

Los canales degradan: si Spotify/MPRIS no responde, el canal informa estado y el
resto sigue funcionando. El backend no debe caerse por un canal o un plugin roto;
`plugins.rs` valida manifiestos y descarta los inválidos con log.

## Rendimiento

Diseñado para correr 24/7 en un solo equipo: kiosko fullscreen, backend único,
frontend estático, webviews con partición persistente. Video de arcade viaja
como frames RGB565 por WebSocket y audio como PCM (ADR-0009); H.264 queda como
fallback.

## Deuda deliberada

- Validar `install-local.sh`, systemd y el AppImage en un Linux limpio.
- El typecheck del frontend depende de `node_modules` presente.
- El tray client (`clients/tray/`) no se empaqueta ni distribuye.
