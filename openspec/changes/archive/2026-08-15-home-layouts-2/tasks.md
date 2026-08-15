## 1. Backend: home_layout_id en runtime config

- [x] 1.1 Añadir `"home_layout_id": lambda: "default"` a `KEYS` en `backend/catodo/runtime_config.py`
- [x] 1.2 Sanitización: en `_effective("home_layout_id", cfg)` devolver `"default"` si el valor no es string no vacío
- [x] 1.3 Tests en `backend/tests/test_config.py`: persistencia (round-trip), default, sanitización (string vacío / no-string cae a default)

## 2. Frontend: 5 layouts preset + registry

- [x] 2.1 En `frontend/src/components/home/layouts.ts` añadir 5 layouts preset (`minimal-layout`, `cinema-layout`, `focus-layout`, `clean-layout`, `wallpaper-only-layout`) más `LAYOUTS: Record<string, HomeLayout>` y helper `getLayout(id): HomeLayout` con fallback a `DEFAULT_LAYOUT`
- [x] 2.2 Verificar con el script `scripts/verify-home-layout.mjs` (extendido) que los 6 layouts tienen al menos wallpaper + clock, los overlays correctos, y ≥2 son distintos

## 3. Frontend: App.tsx pasa layout

- [x] 3.1 En `frontend/src/App.tsx`, después del `api.config()` boot, leer `cfg.home_layout_id` y pasar `getLayout(home_layout_id)` al `<Home>`
- [x] 3.2 En el handler WS `config_changed`, si la key es `home_layout_id`, actualizar el state y re-pasar el layout correspondiente al `<Home>` (React re-monta con el nuevo layout)
- [x] 3.3 Añadir `home_layout_id?: string` a `RuntimeConfig` en `frontend/src/api/client.ts`

## 4. Frontend: selector de Layout en AppearanceSettings

- [x] 4.1 En `frontend/src/components/AppearanceSettings.tsx`, agregar una sección "LAYOUT" entre TEMAS y PERSONALIZACIÓN
- [x] 4.2 El segmented muestra 6 opciones (Default / Minimal / Cinema / Focus / Clean / Wallpaper) con labels legibles
- [x] 4.3 Cambiar el segmented persiste via `POST /api/config {home_layout_id: ...}` (mismo flujo que los demás overrides)

## 5. Verificación

- [x] 5.1 `cd backend && uv run pytest tests/ -q` — 98 + nuevos tests pasan
- [x] 5.2 `cd frontend && npx tsc --noEmit` — sin errores
- [x] 5.3 `cd frontend && npm run build` — bundle OK
- [x] 5.4 Extender `scripts/verify-home-layout.mjs` para validar los 6 layouts (todos tienen wallpaper+clock, overlays correctos, ≥2 distintos)
- [x] 5.5 Smoke visual con chromium: levantar backend+vite, capturar screenshots de los 6 layouts (Spotify Dark), confirmar visualmente que cada uno se ve distinto
- [x] 5.6 Backend tests incluyen: persistencia del nuevo key, default si unset, sanitización de id desconocido
