---
id: adr-0003
status: aceptada
version: 1.0.0
updated: 2026-11-10
---

# ADR-0003 — Widevine sólo con Electron castLabs en desarrollo

## Contexto

El canal TV (Movistar y similares) transmite con DRM Widevine. El Electron de
distribución no incluye el módulo CDM; el build de castLabs sí. Empaquetar
castLabs es posible pero ata la distribución a un proveedor y complica el
empaquetado multiplataforma.

## Decisión

- **Dev**: `scripts/install_castlab.sh` instala Electron castLabs y `run-dev.sh`
  lo usa automáticamente.
- **Distribución** (AppImage/.deb): Electron stock, **sin** Widevine.
- La limitación se documenta en el README, no se esconde: para TV hay que usar el
  launcher de dev o correr el binario castLabs a mano.

## Consecuencias

Buenas:

- El paquete distribuido es el estándar, sin dependencias propietarias.
- El desarrollo del canal TV es posible hoy, sin bloquear el resto.

Malas:

- El AppImage no reproduce canales con DRM: es una diferencia real entre "lo que
  probás" y "lo que distribuís".
- Mantener dos binarios de Electron (stock y castLabs) agrega pasos y confusión
  sobre cuál está corriendo.

## Alternativas descartadas

- **Distribuir castLabs**: resuelve DRM, pero agrega un runtime de terceros al
  paquete y una dependencia de proveedor para todo el producto.
- **Renunciar al canal TV**: menos superficie legal y técnica, pero elimina un
  canal del producto.
- **Otro motor con CDM** (Chromium con Widevine empaquetado): mismo problema de
  licencia y más trabajo de integración.

## Revisar si

castLabs cambia su licencia o Electron stock incorpora CDM; o si se define que el
canal TV no forma parte del artefacto distribuible.
