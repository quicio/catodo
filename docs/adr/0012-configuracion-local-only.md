# 0012 — Configuración sensible local-only

- Estado: aceptada
- Fecha: 2026-11-14

## Contexto

El pairing da a cada remote un token de dispositivo que autentica todo `/api/*`.
Ese token alcanzaba también para cambiar configuración pensada para el kiosko:
rutas de bibliotecas, comandos de emuladores de arcade, credenciales de túnel y
MQTT, y la lista de dispositivos emparejados.

Dos consecuencias graves:

- `arcade_default_emulator` / `arcade_emulators` se ejecutan como proceso; un
  remote (o un token filtrado) podía lograr ejecución de comandos en la TV.
- `anime_dir` / `libraries[].path` permitían apuntar a `/` o `$HOME` y servir
  cualquier video local por `/api/channels/{id}/stream`.

## Decisión

- El middleware de auth clasifica cada request como local (loopback) o externa.
  Si falta `ConnectInfo`, se trata como externa (fail-closed).
- Las claves de configuración sensibles (`arcade_emulators`, rutas, `libraries`,
  `plugin_repo`, túnel, MQTT, `pair_token`, `paired_devices`, URLs de canales)
  son **local-only**: un request externo autenticado recibe 403.
- Las mutaciones de bibliotecas (`POST/DELETE /api/libraries`) y el control del
  túnel (`POST /api/tunnel/start|stop`) también son local-only.
- El remote conserva las preferencias seguras (tema, layout, `ui_scale`, idle,
  volumen, navegación y comandos de canales).
- Los ids de plugin se validan como slug `[a-z0-9-]+` antes de tocar el
  filesystem.

## Consecuencias

- Un remote emparejado ya no puede escalar a ejecución de comandos ni exfiltrar
  archivos fuera de las bibliotecas configuradas en la TV.
- Algunas pantallas de administración del remote dejan de funcionar; la
  configuración sensible se hace en el kiosko. Si en el futuro hace falta
  administrar desde el remote, se agrega un token con scope explícito, no se
  relaja este límite.
- El kiosko en loopback no cambia: sigue sin token y con todas las opciones.

## Alternativas descartadas

- Confiar en el remote porque está emparejado: un token filtrado o un teléfono
  comprometido pasaría a ser RCE.
- Restringir sólo las rutas de bibliotecas: no cubre la ejecución de emuladores.
- Validar el template del emulador con una allowlist: frágil y no cubre el resto
  de la configuración sensible.
