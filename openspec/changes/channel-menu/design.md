# Design

## Context

Ver `proposal.md`. La barra vive en `App.tsx` con `barVisible` y un listener
global de mouse/teclado/touch que la revela durante 8s. Está fija abajo con
`z-index: 9999`; el player de Arcade la oculta con una clase, pero el resto de
canales no. El OSD del número ya existe en `CrtShell`.

## Goals / Non-Goals

**Goals**

- Menú vertical invocado sólo con Tab, legible y navegable.
- Cero auto-reveal y cero conflicto con controles inferiores.
- Mouse, teclado y gamepad.
- Mantener el OSD y los hotkeys numéricos.

**Non-Goals**

- Buscador, favoritos o políticas por canal.
- Nuevo diseño del OSD.

## Decisions

### 1. Drawer lateral, no barra inferior

Panel a la izquierda, ancho `min(340px, 90vw)`, alto máximo `80vh`, con backdrop
tenue. Se elige esa ubicación porque los controles de webviews y players suelen
estar abajo; un drawer sólo aparece cuando se invoca.

### 2. Tab como único disparador

`Tab` abre/cierra (con `preventDefault`). No hay listeners de `mousemove` para la
barra. Mientras el menú está abierto, `↑/↓` mueven la selección, `Enter` abre,
`Esc` cierra y el resto de hotkeys se ignora. Al cerrar, el input vuelve al canal.

### 3. Estado en App

`menuOpen` y `menuIndex` viven en App junto a los refs de canales/estado. El menú
es un componente presentacional (`ChannelMenu`) que recibe `open`, `index`,
`onHover`, `onPick`, `onClose`. Así el mismo estado sirve para teclado y mouse.

### 4. Gamepad sin capa extra

Con el menú abierto sus botones son focusables; la navegación global del mando
mueve el foco y A hace click. Cerrado no se renderiza, así que no puede robar
foco.

### 5. Sin offsets de barra

Se retira `--channel-bar-height` y los paddings/offsets de `IptvChannel` y
`NowPlaying` que reservaban ese espacio.

## Risks / Trade-offs

- **Tab compite con el foco nativo de formularios** → el guard de inputs ya
  existente sigue vigente; en el kiosko no hay formularios abiertos.
- **El drawer tapa contenido mientras está abierto** → es una acción explícita y
  se cierra al elegir/escapar; no persiste.
- **Mando con foco en botones del menú** → al cerrar se desmontan; el foco vuelve
  al documento y la navegación global sigue.

## Migration Plan

1. Reemplazar `ChannelBar` por `ChannelMenu` en App.
2. Eliminar el listener de auto-reveal y `barVisible`.
3. Ajustar IPTV/NowPlaying y limpiar CSS.
4. Rollback: volver a montar `ChannelBar` y restaurar el listener; no hay datos.
