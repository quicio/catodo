# Design

## Context

Ver `proposal.md`. El motor `MediaChannel` ya escanea carpetas, agrupa series/temporadas o videos, reproduce con `Range`, guarda progreso y publica `episode_changed`. Hoy se instancia desde:
- un `anime` hardcodeado (`anime_dir` + `anime_progress`),
- entradas `libraries` agregadas por `/api/libraries` (sin edición ni UI).

`build_default_channels` registra los built-ins, los plugins instalados y los canales de medios. `plugins-repo/index.json` marca como bundled TV, Crunchyroll, Max y YouTube.

## Goals / Non-Goals

**Goals**

- Un solo motor de emisión, N canales configurables.
- Cero hardcodeo de Anime/TV en el arranque.
- CRUD y edición en caliente desde Ajustes, con rutas local-only.
- Set mínimo de canales/proveedores en instalación nueva.
- Compatibilidad con `libraries` existentes (`movies` → `videos`).

**Non-Goals**

- Scraping de metadata o renombrado automático.
- Playlists/categorías dentro de un canal.
- Auto-crear un canal Anime al migrar.
- Cambiar el player, los efectos o el DRM.

## Decisions

### 1. `libraries` es la única fuente de canales de emisión

Se elimina la creación implícita de `anime` y el caso especial `anime_progress`. `build_media_channels` sólo recorre la configuración `libraries`. Cada entrada produce un `MediaChannel`.

- **Por qué**: es el motor que ya existe; elimina ramas especiales y permite N canales.
- **Alternativa descartada**: mantener Anime fijo y agregar librerías extra; no cumple el desacople pedido.

### 2. Esquema de biblioteca

```json
{
  "id": "saint-seiya",
  "name": "Saint Seiya",
  "path": "/media/Saint Seiya",
  "kind": "series",
  "icon": "clapperboard",
  "color": "#ffcc00",
  "order": 20
}
```

- `kind`: `series` (carpeta/serie/temporada/archivo) o `videos` (plano). `movies` legacy se normaliza a `videos`.
- `id`: slug inmutable generado desde `name` si no se provee; único.
- `icon`/`color`/`order` son opcionales con fallback (`clapperboard`, color del tema, orden siguiente).
- El `ChannelInfo` del canal usa estos valores; `MediaChannel` deja de tener icono fijo.

### 3. API de bibliotecas con edición

- `GET /api/libraries`: lista las entradas configuradas.
- `POST /api/libraries`: valida nombre/ruta/kind, genera id si falta y registra el canal.
- `PATCH /api/libraries/{id}`: actualiza nombre/ruta/kind/icon/color/order, re-registra el canal y publica `libraries_changed`.
- `DELETE /api/libraries/{id}`: borra, desregistra y publica; si era el actual, el manager queda sin canal y los clientes vuelven al Home.
- Todas local-only (rechazar origen externo), como hoy.

- **Por qué**: la UI necesita editar sin borrar/recrear y conservar el id (progreso).
- **Alternativa descartada**: borrar+crear para editar; pierde progreso y puede dejar el canal actual colgado.

### 4. Arranque y defaults

- `build_media_channels` sólo crea canales desde `libraries`; `anime_dir` no crea nada.
- Built-ins: Spotify, Arcade, IPTV, Screen Cast. YouTube es plugin bundled; TV/Crunchyroll/Max/proveedores quedan `bundled: false`.
- `seed_bundled` sigue sembrando sólo `bundled: true`; una instalación existente conserva lo que ya tiene.

### 5. UI: Emisión dentro de Ajustes → Canales

- Sección "CANALES DE EMISIÓN": lista con nombre, ruta, modo, orden y acciones.
- Formulario de alta/edición: nombre, ruta, modo Series/Videos, icono (lista de iconos válidos), color y orden.
- Estado vacío con CTA para crear el primero y una nota de que Anime ya no es implícito.
- `libraries_changed` refresca la lista/channels sin recargar.
- Home y barra consumen `ChannelInfo.icon/color`; `ChannelGrid` deja de mapear sólo por id y usa fallback.

### 6. Progreso y compatibilidad

- Clave por canal: `media_progress_<id>` para todos.
- `anime_progress` queda en disco pero no se lee; no se borra.
- `libraries` existentes se normalizan (`movies`→`videos`, icon/color/order por defecto).
- No se borran plugins instalados previamente.

## Risks / Trade-offs

- **Usuarios con Anime actual pierden el canal hasta crear la biblioteca** → estado vacío claro en Ajustes y nota de migración; `anime_dir` sigue visible como referencia.
- **Editar el canal actual** → la UI de Ajustes vive en Home, pero la API puede hacerlo; el manager desregistra/registra y publica el cambio.
- **IDs duplicados** → validar slug y responder 409.
- **Escaneos costosos con muchas bibliotecas** → TTL de 60s y refresh manual ya existentes; el escaneo corre en blocking pool.
- **Rutas inseguras** → siguen local-only; el backend no expone archivos fuera del path configurado.
- **Iconos inválidos** → lista cerrada en la UI y fallback en render.

## Migration Plan

1. Desplegar con `libraries` existentes: se normalizan y aparecen como canales de emisión.
2. Anime deja de aparecer; el operador crea una biblioteca "Anime" apuntando a `~/Anime` si la quiere.
3. `anime_dir`/`anime_progress` quedan inertes; no se borra nada.
4. Plugins bundled previamente instalados siguen funcionando; TV/Crunchyroll/Max nuevos son opt-in.
5. Rollback: revertir el change; las entradas `libraries` siguen siendo válidas para el código anterior.

## Open Questions

Ninguna que bloquee el diseño. La lista exacta de iconos disponibles se toma del registry del frontend.
