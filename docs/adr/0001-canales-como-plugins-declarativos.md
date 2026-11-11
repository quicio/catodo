---
id: adr-0001
status: aceptada
version: 1.0.0
updated: 2026-11-10
---

# ADR-0001 — Canales nativos por contrato; canales web por manifiesto

## Contexto

Cátodo es un shell de canales: cada app (Spotify, YouTube, Anime, TV,
Crunchyroll) ocupa la pantalla. Los canales no son iguales: Spotify es control
remoto de una app de escritorio (MPRIS), YouTube y TV son webviews con user agent
de Android TV, Anime es un reproductor local con biblioteca.

Agregar un canal no puede implicar tocar tres capas ni el frontend, y cargar
código de terceros en un kiosko 24/7 es un riesgo que no se quiere correr.

## Decisión

Dos caminos, según lo que el canal necesite:

1. **Canal nativo** = clase que implementa `Channel`
   (`backend/catodo/channel.py`): `id`, `name`, `type`
   (`media`/`web`/`app`/`dashboard`/`launcher`), `order`, `capabilities` y
   `open()`. Las capacidades opcionales se declaran con `Protocol`
   `@runtime_checkable` (`SupportsEpisodes`, `SupportsStream`, `SupportsBoxart`,
   `SupportsHistory`); el consumidor pregunta por la capacidad, no por el tipo.
2. **Canal web** = sólo `plugins-repo/<id>/manifest.json` (id, type, url,
   user_agent, partition, order, config_key) más su entrada en `index.json`.
   `plugin_system.py` valida y descarta manifiestos inválidos.

Sin código ejecutable de terceros en ninguno de los dos casos.

## Consecuencias

Buenas:

- Un canal web nuevo es datos, no código: se agrega sin recompilar ni tocar React.
- Los canales nativos son aislados: si uno falla, el backend sigue y el resto de
  los canales funciona.
- Las capacidades evitan `if type == "media"` esparcido por el código.

Malas:

- Todo canal web está limitado a lo que el manifiesto puede expresar (url, UA,
  partición, orden, icono). Un canal web con lógica propia necesita ser nativo.
- La UI tiene que tolerar canales sin capacidades (sin episodios, sin boxart).

## Alternativas descartadas

- **Un solo camino, todo nativo**: cada canal web exigiría una clase Python y un
  deploy; agregar YouTube Kids costaría código.
- **Plugins ejecutables** (JS/Python de terceros): flexibilidad total, pero
  ejecuta código ajeno dentro de un kiosko que corre solo 24/7.
- **Canales hardcodeados en el frontend**: imposible de mantener con 5 canales y
  rompe la regla de que la UI no implementa canales.
