---
id: adr-0002
status: aceptada
version: 1.0.0
updated: 2026-11-10
---

# ADR-0002 — Dos puertos: `:8765` dev y `:8767` prod

## Contexto

Cátodo está pensado para correr siempre: el equipo es la TV. Pero también se
desarrolla sobre la misma máquina (o contra ella). Si dev y prod comparten puerto,
abrir el entorno de desarrollo mata el daemon estable — y con él la TV.

## Decisión

Separar por puerto y por proceso:

| modo | backend | frontend | entrada |
|---|---|---|---|
| dev | `:8765` | Vite `:1420` (HMR) | `./run-dev.sh` |
| prod | `:8767` | bundle estático en `backend/static/` | `./run-prod.sh`, AppImage |

`./run-dev.sh` reinicia su propio backend si detecta que el código cambió: compara
el **start time del proceso** contra el **mtime de `themes.py`**. Si el código es
más nuevo, mata y vuelve a levantar **sólo** el de `:8765`.

## Consecuencias

Buenas:

- El daemon de prod sigue sirviendo la TV mientras se desarrolla.
- Los dos backends pueden correr a la vez sin conflicto de estado en memoria.

Malas:

- Dos fuentes de verdad mientras dura el desarrollo: un bug puede reproducirse en
  uno y no en el otro (distinto puerto, distinto bundle).
- La heurística por mtime de un archivo es un proxy: un cambio en otro módulo no
  fuerza el reinicio (falso negativo silencioso).
- Hay dos URLs para recordar, y el frontend debe apuntar a la correcta según modo.

## Alternativas descartadas

- **Un solo puerto**: simple, pero cada reinicio de dev corta la sesión de la TV.
- **Proxy inverso que conmuta**: agrega un proceso y un punto de falla para un
  problema que un puerto resuelve.
- **Sólo dev** (bundlear siempre): pierde el modo "kiosko estable" que es el
  producto.

## Revisar si

La heurística por mtime empieza a fallar en la práctica (cambios que no reinician
el backend): pasar a un watcher de directorio en lugar de mirar un archivo.
