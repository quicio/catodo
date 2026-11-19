# Proposal

## Why

La barra horizontal de canales se revela con cualquier movimiento de mouse,
tecla o touch y queda 8 segundos encima del canal con `z-index: 9999`. Al entrar
a un canal tapa controles de webviews, del player y del Arcade, y su interfaz de
pills transparentes es difícil de leer.

## What Changes

- Se elimina la barra horizontal auto-revelable.
- **Tab** abre/cierra un **menú vertical** lateral con todos los canales.
- El menú se cierra al elegir, con `Esc`, `Tab` o click fuera.
- Navegación con ↑/↓ + Enter, mouse o D-pad + A; el canal actual queda marcado.
- El OSD superior con el número de canal se mantiene.
- Se dejan de reservar espacios para la barra en IPTV/NowPlaying.

## Capabilities

### Modified Capabilities

- `frontend-kiosk`: se reemplaza la barra de canales por un menú vertical bajo
  demanda con Tab; el OSD de cambio de canal no cambia.

## Impact

- `frontend/src/App.tsx`: estado del menú, Tab y teclado.
- `frontend/src/components/ChannelBar.tsx` → `ChannelMenu.tsx`.
- `frontend/src/styles.css`: estilos del menú; se retira la barra.
- `IptvChannel.tsx` y `NowPlaying.tsx`: ya no reservan `--channel-bar-height`.
- README/spec de kiosko.

## Non-goals

- Buscador de canales.
- Cambiar el OSD del número, los hotkeys `1–6` ni el zapping.
- Políticas distintas por canal (queda para otro change).
