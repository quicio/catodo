## MODIFIED Requirements

### Requirement: Canal de proyección
Cátodo SHALL exponer un canal `screen-cast` que muestre en pantalla completa el stream WebRTC entrante.

#### Scenario: Sesión activa
- **WHEN** existe una sesión de proyección activa y el canal `screen-cast` está abierto
- **THEN** se muestra el video entrante a pantalla completa con el audio del stream

#### Scenario: Sin sesión activa
- **WHEN** el canal `screen-cast` se abre sin sesión activa
- **THEN** se muestra un estado "Esperando proyección…" con instrucciones para iniciar desde `/cast`

### Requirement: Página de origen de proyección
El backend SHALL servir una página `/cast` que cualquier dispositivo de la red puede abrir para iniciar la proyección.

#### Scenario: Compartir pantalla
- **WHEN** un navegador abre `/cast` y acepta compartir su pantalla (`getDisplayMedia`)
- **THEN** el stream se transmite a Cátodo y la sesión aparece como activa

#### Scenario: Navegador sin soporte
- **WHEN** `/cast` se abre en un navegador que no soporta captura de pantalla
- **THEN** se muestra un mensaje claro indicando que el dispositivo no puede proyectar

#### Scenario: Cast sobre el dominio público
- **WHEN** un navegador abre `https://<public_domain>/cast` mientras el túnel está activo
- **THEN** `getDisplayMedia` está disponible sin pedir al usuario que acepte un certificado (el túnel provee HTTPS válido).

### Requirement: Señalización WebRTC
Cátodo SHALL proporcionar señalización WebRTC (offer/answer/ICE) para establecer el peer-to-peer entre el dispositivo origen y el canal.

#### Scenario: Handshake exitoso
- **WHEN** el origen envía una oferta y completa el intercambio ICE
- **THEN** el stream comienza a mostrarse en el canal `screen-cast`

#### Scenario: Handshake fallido
- **WHEN** el intercambio SDP/ICE no se completa en un tiempo límite
- **THEN** la sesión se marca como fallida y se puede reintentar

### Requirement: Ciclo de vida de sesión
Cátodo SHALL gestionar las sesiones de proyección con una única sesión activa a la vez.

#### Scenario: Iniciar sesión
- **WHEN** un origen inicia una proyección
- **THEN** se crea una sesión con un token único y se notifica por WebSocket el evento `cast_session_started`

#### Scenario: Finalizar sesión
- **WHEN** el origen corta la proyección o el canal lo solicita
- **THEN** la sesión se destruye, el stream se detiene y se notifica `cast_session_ended`

#### Scenario: Segunda proyección concurrente
- **WHEN** un segundo origen intenta iniciar mientras hay una sesión activa
- **THEN** la sesión existente se reemplaza o se rechaza con un error explícito (decisión de diseño documentada)

### Requirement: Control desde el remote
El remote SHALL permitir ver el estado de la proyección y finalizarla.

#### Scenario: Estado visible
- **WHEN** hay una sesión activa
- **THEN** el remote muestra el indicador "Proyectando" y el origen (host/etiqueta)

#### Scenario: Finalizar desde el remote
- **WHEN** el usuario pulsa "Detener proyección" en el remote
- **THEN** la sesión activa se finaliza y el canal vuelve al estado de espera

### Requirement: Descubrimiento en LAN
La página `/cast` SHALL detectar Cátodo en la red para pre-completar el destino.

#### Scenario: Cátodo visible en la red
- **WHEN** `/cast` carga y hay un Cátodo alcanzable en la red
- **THEN** el destino se pre-selecciona automáticamente (con opción de cambiarlo)

#### Scenario: Sin Cátodo visible
- **WHEN** no se detecta Cátodo
- **THEN** la página muestra un campo para ingresar la IP manualmente

### Requirement: Estado de proyección persistente y observable
El backend SHALL exponer el estado de la sesión de proyección vía API y eventos.

#### Scenario: Consulta de estado
- **WHEN** se consulta `GET /api/cast`
- **THEN** responde con la sesión activa (si existe), su token y el origen

#### Scenario: Eventos en vivo
- **WHEN** una sesión cambia de estado
- **THEN** se publica el evento correspondiente en el broker WebSocket (`cast_session_started` / `cast_session_ended`)

### Requirement: HTTPS sin certificado self-signed
Cátodo SHALL permitir que `/cast` opere con HTTPS válido sin necesidad de generar ni distribuir un certificado self-signed local. El puerto `:8766` con cert local y el script `scripts/make_cert.sh` dejan de ser necesarios cuando el túnel público está activo.

#### Scenario: Cast sobre HTTPS válido
- **WHEN** el túnel público está activo
- **THEN** `/cast` se sirve desde `https://<public_domain>/cast` con cert válido; el navegador no muestra el warning de cert self-signed.

#### Scenario: Cast sobre LAN con cert local sigue funcionando
- **WHEN** el usuario abre `https://<lan_ip>:8766/cast` y aceptó el cert self-signed previamente
- **THEN** el cast funciona igual que antes (LAN sigue siendo un path válido).

#### Scenario: Tunnel caído degrada con mensaje claro
- **WHEN** el usuario abre `https://<public_domain>/cast` pero el túnel está caído
- **THEN** el navegador muestra un error de conexión claro (no un warning de cert).
