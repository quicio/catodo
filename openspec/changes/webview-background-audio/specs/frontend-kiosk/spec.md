# Spec Delta — frontend-kiosk

## ADDED Requirements

### Requirement: Webview en segundo plano silenciado

Un canal web que deja de estar activo SHALL quedar muteado y con su media
pausado, incluso si el player vive en iframes, para no mezclar audio con el
canal actual.

#### Scenario: Cambiar desde un canal web

- **WHEN** el usuario cambia de un canal web a otro canal
- **THEN** el webview anterior se mutea y su video/audio se pausa

#### Scenario: Volver al canal web

- **WHEN** el usuario vuelve al canal web
- **THEN** el webview se desmutea pero permanece pausado hasta que el usuario lo reproduzca

#### Scenario: Autoplay tardío

- **WHEN** un webview inactivo termina de cargar y el player intenta autoplay
- **THEN** sigue muteado y se vuelve a pausar

#### Scenario: Ir al Home

- **WHEN** el usuario vuelve al Home
- **THEN** todos los webviews quedan muteados y pausados
