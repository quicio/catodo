## Why

El canal Arcade muestra carátulas, pero si el usuario tiene ROMs sueltas sin imágenes (como `~/ROMs/snes`) la grilla queda llena de placeholders. Descargar carátulas automáticamente desde Libretro Thumbnails (gratis, sin API key) convierte un launcher plano en una recreativa real sin trabajo manual.

## What Changes

- **Descarga automática de carátulas**: al escanear el canal Arcade, por cada juego sin carátula se intenta descargar la boxart desde `https://thumbnails.libretro.com/<Sistema>/Named_Boxarts/<Juego>.png`.
- **Mapeo de sistemas**: mapa de nombres de carpeta (snes, nes, genesis, gba, …) → nombre oficial RetroArch; si no está mapeado se intenta con el nombre de la carpeta o se saltea.
- **Guardado como sidecar**: la imagen se guarda como `<ROM>.png` al lado de la ROM, así la vuelve a detectar el scanner y persiste.
- **Best-effort + rate limiting**: los intentos fallidos no se repiten en cada escaneo (cache en memoria) y las descargas se serializan con delay para no martillar el servidor. El juego sin carátula sigue mostrando placeholder.
- **Comando manual de retry**: `fetch_boxart` para un juego puntual y `fetch_boxarts` para forzar el lote de faltantes.
- **Eventos**: `boxart_fetched` / `boxarts_synced` para que el launcher actualice la grilla en vivo.

## Capabilities

### New Capabilities
- `arcade-boxart`: descarga automática de carátulas para el canal Arcade desde Libretro Thumbnails, con mapeo de sistemas, guardado sidecar y re-intento controlado.

### Modified Capabilities
- Ninguna (el canal Arcade existente no cambia su comportamiento; solo se le suma la descarga).

## Impact

- **Backend**: módulo `catodo/boxart.py` con el fetch (stdlib `urllib`, sin dependencias nuevas), mapeo de sistemas, generación de nombres candidatos y cache de fallos. `ArcadeChannel` lo invoca tras el escaneo (task de fondo serializado) y publica eventos.
- **API**: comando `fetch_boxart` (y `fetch_boxarts`) en el canal; sin endpoints nuevos.
- **Config**: sin claves nuevas (la fuente es fija). Opcional: `arcade_boxart_enabled` (default true) por si se quiere desactivar.
- **Otros**: tests backend con fetch mockeado, README.

## Non-goals

- No es un scraper de metadatos (solo boxarts).
- No descarga de ROMs ni otro contenido.
- No soporte de ScreenScraper/API keys en esta iteración.
- No garantiza match exacto de nombres (depende de la convención no-intro de Libretro); es best-effort.
