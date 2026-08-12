## Context

El canal `ArcadeChannel` (`catodo/arcade.py`) escanea `arcade_dir` con TTL y expone `boxart(rel)` para el endpoint `/api/channels/arcade/boxart`. Los juegos sin carátula devuelven `boxart: None` y el launcher muestra un placeholder. Ahora se agrega la descarga automática de boxarts desde Libretro Thumbnails.

## Goals / Non-Goals

**Goals:**
- Descargar carátulas automáticamente al escanear y guardarlas como sidecar (`<ROM>.png`).
- Mapeo de nombres de carpeta → nombre oficial RetroArch.
- No repetir fallos ni saturar la fuente (serializado + cache de fallos).

**Non-Goals:**
- Scraper de metadatos, ScreenScraper, descarga de ROMs, match exacto garantizado.

## Decisions

### 1. Módulo `catodo/boxart.py` con fetch por stdlib
Se usa `urllib.request` (sin dependencias nuevas). URL: `https://thumbnails.libretro.com/{System}/{Type}/{Name}.png` con `Type = Named_Boxarts`. Timeout corto (~10s), redirects automáticos. El nombre se arma con `urllib.parse.quote` para los segmentos.

### 2. Nombres candidatos (best-effort)
La convención no-intro de Libretro suele incluir región (`Super Mario World (USA).png`) mientras que las ROMs del usuario pueden no tenerla. Se prueban, en orden:
1. El stem de la ROM tal cual.
2. El stem sin tags finales de región `(...)`/`[...]`.
3. `base (USA)`, `base (Europe)`, `base (Japan)`, `base (World)`.
Se corta en el primer `200`; se cachean los que fallaron para no re-probarlos en cada escaneo.

### 3. Mapeo de sistemas
Dict `SYSTEM_NAMES` en `boxart.py` con los sistemas comunes (snes, nes, genesis/megadrive, gb/gbc/gba, n64, psx, mame, …) → nombre oficial. `resolve_system(folder)` devuelve el nombre mapeado o el folder tal cual (fallback). Si la descarga del sistema falla para todos sus juegos, no se vuelve a intentar ese sistema en el ciclo.

### 4. Descarga automática en background (serializada)
`ArcadeChannel.refresh()` queda igual de rápido (sin red). Después de un escaneo que detecte faltantes, se dispara una task de fondo **única** (`_boxart_task`, un solo `asyncio.Task`) que procesa las faltantes de a una con ~300ms de delay y un `asyncio.Lock` por canal. Al terminar publica `boxarts_synced`. Esto evita martillar el servidor y que `state()` cada 60s re-lance todo.

### 5. Guardado sidecar + reflejo inmediato
La imagen se guarda con `with_suffix(".png")` al lado de la ROM (escritura a `tmp` + `os.replace` para no dejar archivos a medias). Al éxito, se actualiza `game["boxart"]` en `self._systems` para que la grilla lo muestre sin esperar el próximo scan. Se publica `boxart_fetched {game}`.

### 6. Cache de fallos
`dict[game_rel -> timestamp]` en memoria en `ArcadeChannel`; no re-intentar dentro de un tiempo (ej. 10 min). El retry manual (`fetch_boxart`) borra la entrada del cache y fuerza el intento. Se publica `boxart_failed {game}` en fallos puntuales para diagnóstico.

### 7. Comandos
- `fetch_boxart` con `game=<rel>` → intento puntual (limpia cache y fuerza).
- `fetch_boxarts` → procesa todo el lote de faltantes (ignora cache).
Ambos procesan en la task de fondo serializada.

## Risks / Trade-offs

- **Match imperfecto de nombres** → no se encuentra la carátula aunque exista; se deja el placeholder y el usuario puede retry manual. Aceptado (best-effort).
- **Rate limiting del servidor** → serializado con delay y cache de fallos; en un set grande la primera sync tarda (es one-time).
- **Escritura en la carpeta de ROMs** → el usuario eligió sidecar; se escribe solo `.png` al lado, con `os.replace` atómico.
