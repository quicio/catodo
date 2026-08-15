## 1. Backend: claves de theme en runtime config

- [x] 1.1 Agregar a `runtime_config.py` las claves `theme` (default `spotify-dark`), `themes` (default `[]`), `theme_crt_enabled` (default `True`).
- [x] 1.2 Definir en backend el esquema de theme (id, name, colorScheme, crt, tokens) y los themes predefinidos (mínimo 3), con validación/filtrado de custom themes al cargar.
- [x] 1.3 Hacer que `GET /api/config` incluya `theme`, `themes` (built-in + custom) y `theme_crt_enabled`, y que `POST /api/config` los acepte.
- [x] 1.4 Verificar: `curl /api/config` muestra las claves nuevas; POST `theme` persiste y re-emite `config_changed`.

## 2. Frontend: motor de tokens y aplicación

- [x] 2.1 Crear módulo de themes en frontend (tipos + themes predefinidos reflejando el backend) y aplicar tokens CSS en `document.documentElement` al boot desde `/api/config`.
- [x] 2.2 Escuchar `config_changed` para `theme`/`themes`/`theme_crt_enabled` y re-aplicar sin recargar.
- [x] 2.3 Definir las CSS custom properties en `styles.css` (`:root`/`[data-theme]`) con la paleta completa y `color-scheme`.
- [x] 2.4 Hacer que `CrtShell` controle scanlines/vignette según `theme_crt_enabled` (con fallback al `crt` del theme).

## 3. Reemplazo de colores hardcodeados por componentes

- [x] 3.1 Reemplazar literales en `styles.css` por `var(--...)`.
- [x] 3.2 Reemplazar en `Home.tsx` (COLORS por canal + botones/estados).
- [x] 3.3 Reemplazar en `NowPlaying.tsx` (accent, textos, barras).
- [x] 3.4 Reemplazar en `MediaChannel.tsx` y `Anime4KCanvas.tsx`.
- [x] 3.5 Reemplazar en `ChannelBar`, `CrtShell` y demás componentes con literales.

## 4. Selector de theme en la UI

- [x] 4.1 Agregar selector de themes en `Home` (dropdown/popover con la lista `themes` + activo).
- [x] 4.2 Persistir la selección vía `POST /api/config {theme}` y reflejar el cambio en vivo.

## 5. Validación

- [x] 5.1 `npm run build` (tsc + vite) sin errores y `scripts/check.sh` completo.
- [x] 5.2 Probar: cambiar theme desde la UI, reiniciar backend y confirmar que persiste; theme custom por JSON; CRT on/off.
- [x] 5.3 Verificar que el theme por defecto reproduce la apariencia actual (sin regresión visual).
