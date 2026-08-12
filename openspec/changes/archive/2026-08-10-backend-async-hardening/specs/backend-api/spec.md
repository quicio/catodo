## ADDED Requirements

### Requirement: Event-loop responsiveness

API handlers SHALL NOT perform blocking I/O on the event loop thread; filesystem walks and external HTTP are offloaded or awaited asynchronously.

#### Scenario: Health under load

- **WHEN** a library scan and wallpaper downloads are in progress
- **THEN** `GET /api/health` still responds within 100ms.

### Requirement: Range support on stream endpoint

`GET /api/channels/{id}/stream` SHALL support single-range `Range` requests (`206`, `Content-Range`, `Accept-Ranges: bytes`) and return `416` for unsatisfiable ranges.

#### Scenario: Partial content

- **WHEN** the request carries `Range: bytes=0-999`
- **THEN** the response is 206 with exactly 1000 bytes and a matching `Content-Range` header.
