## 1. Backend — módulo de descarga

- [x] 1.1 Crear `catodo/boxart.py`: fetch de Libretro Thumbnails con `urllib` (`https://thumbnails.libretro.com/{Sistema}/Named_Boxarts/{Nombre}.png`), timeout y `quote` de segmentos.
- [x] 1.2 Mapa `SYSTEM_NAMES` (snes, nes, genesis, gb/gbc/gba, n64, psx, mame, …) y `resolve_system()` con fallback al nombre de carpeta.
- [x] 1.3 Generador de nombres candidatos (stem, sin región, y con `(USA)/(Europe)/(Japan)/(World)`) con cache de fallos.
- [x] 1.4 Guardado sidecar atómico (`tmp` + `os.replace`) junto a la ROM.

## 2. Backend — integración en ArcadeChannel

- [x] 2.1 Tras el escaneo con faltantes, disparar una task de fondo única y serializada (~300ms entre descargas) que procesa el lote.
- [x] 2.2 Al éxito: actualizar `game["boxart"]` en `self._systems`, publicar `boxart_fetched`; al terminar el lote publicar `boxarts_synced`.
- [x] 2.3 Cache de fallos en memoria (no re-intentar en el ciclo) + `boxart_failed` en fallos puntuales.
- [x] 2.4 Comandos `fetch_boxart` (retry puntual limpiando cache) y `fetch_boxarts` (forzar lote).

## 3. Tests backend

- [x] 3.1 Tests de `resolve_system` y nombres candidatos (stem, con/sin región).
- [x] 3.2 Test del fetch mockeado (200 → guarda sidecar y actualiza state; 404 → fallo cacheado y placeholder).
- [x] 3.3 Test del comando `fetch_boxart` puntual y del lote con evento `boxarts_synced`.

## 4. Verificación

- [x] 4.1 E2E: abrir el canal Arcade con ROMs sin carátula → aparecen sidecars descargados y la grilla los muestra; repetir escaneo no re-descarga fallos.
- [x] 4.2 README: documentar la descarga automática de carátulas y el retry manual.
