# Spec Delta — runtime-config

## ADDED Requirements

### Requirement: Claves de URL por canal

El runtime config SHALL aceptar y exponer claves con el patrón `channel_<id>_url`, donde `<id>` es un slug de canal, para apuntar canales web a una URL regional o de proveedor.

#### Scenario: GET incluye canales web instalados

- **WHEN** se consulta `GET /api/config` con canales web instalados
- **THEN** la respuesta incluye `channel_<id>_url` por cada canal web, con la URL efectiva (override o default del manifest)

#### Scenario: POST persiste y notifica

- **WHEN** `POST /api/config` recibe `{"channel_<id>_url": "https://..."}` válido
- **THEN** la clave se persiste, se devuelve el config efectivo y se publica `config_changed` con esa clave

#### Scenario: Esquema inválido

- **WHEN** el valor no es una URL absoluta `http` o `https`
- **THEN** responde 400 y no modifica la clave

#### Scenario: Clave fuera del patrón se ignora

- **WHEN** `POST /api/config` recibe una clave `channel_...` cuyo id no es un slug válido
- **THEN** la clave se ignora como desconocida y el resto del body se procesa normalmente

#### Scenario: URL de canal es local-only

- **WHEN** un origen externo (remote/LAN) intenta escribir una clave `channel_<id>_url`
- **THEN** responde 403 y la URL no cambia

#### Scenario: Reinicio conserva la URL

- **WHEN** el backend reinicia después de persistir una URL de canal
- **THEN** `GET /api/config` y el estado del canal siguen reportando esa URL
