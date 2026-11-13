# Changelog

## [0.4.5](https://github.com/quicio/catodo/compare/v0.4.4...v0.4.5) (2026-11-13)


### Bug Fixes

* **iptv:** no mostrar 'sin datos' si el canal ya reproduce ([3d21df2](https://github.com/quicio/catodo/commit/3d21df2ab2bdc71e371484437d176b26091fce4e))

## [0.4.4](https://github.com/quicio/catodo/compare/v0.4.3...v0.4.4) (2026-11-13)


### Bug Fixes

* **iptv:** recodificar audio a AAC para que el fMP4 no salga vacío ([e04d748](https://github.com/quicio/catodo/commit/e04d74800ae736b796301369bc44f50f1c6c64d7))

## [0.4.3](https://github.com/quicio/catodo/compare/v0.4.2...v0.4.3) (2026-11-13)


### Bug Fixes

* **iptv:** encontrar ffmpeg fuera del PATH de Finder ([f4c2704](https://github.com/quicio/catodo/commit/f4c2704feddb567dbb2023695f638c2fbcfb750e))

## [0.4.2](https://github.com/quicio/catodo/compare/v0.4.1...v0.4.2) (2026-11-13)


### Bug Fixes

* **iptv:** explicar canales caídos y radios en vez de negro ([f0fe14b](https://github.com/quicio/catodo/commit/f0fe14bb182b8c9fbaf9a757573b02a6b60ec97c))

## [0.4.1](https://github.com/quicio/catodo/compare/v0.4.0...v0.4.1) (2026-11-13)


### Bug Fixes

* **iptv:** servir fMP4 fragmentado para que Chromium reproduzca ([e9c217d](https://github.com/quicio/catodo/commit/e9c217d691648e5d2d0b5c6baeba1d705fe065c9))

## [0.4.0](https://github.com/quicio/catodo/compare/v0.3.0...v0.4.0) (2026-11-13)


### Features

* **iptv:** canal IPTV con proxy ffmpeg y zapping ([d6f3c8f](https://github.com/quicio/catodo/commit/d6f3c8f7380f1284f06736f96291db484ed440e9))
* **iptv:** reportar errores de stream y cubrirlos con tests ([654793a](https://github.com/quicio/catodo/commit/654793ab6bef2b2bf5956a973547b1f6b4489352))

## [0.3.0](https://github.com/quicio/catodo/compare/v0.2.1...v0.3.0) (2026-11-13)


### Features

* **ui:** salir del kiosko con Cmd+Shift+Q y botón en Ajustes ([39c26a2](https://github.com/quicio/catodo/commit/39c26a27b9bb3357619b41da7585d497df25a38c))

## [0.2.1](https://github.com/quicio/catodo/compare/v0.2.0...v0.2.1) (2026-11-13)


### Bug Fixes

* **drm:** no bloquear la primera ventana mientras baja el CDM ([98b4eff](https://github.com/quicio/catodo/commit/98b4eff696b8aff6c954381ae2cca6f9645987bb))

## [0.2.0](https://github.com/quicio/catodo/compare/v0.1.1...v0.2.0) (2026-11-13)


### Features

* **drm:** empaquetar Widevine con Electron ECS 45 ([8811659](https://github.com/quicio/catodo/commit/8811659b2fd661866dc6914536c3bd2f0084e5a5))


### Bug Fixes

* **ci:** verificar el uv.lock commiteado y correr el sync en PRs de release ([ec693da](https://github.com/quicio/catodo/commit/ec693daacaf6724d3520b383c372fcdfc90b5cfd))
* **release:** subir solo archivos, no el bundle backend-rust ([c372ed6](https://github.com/quicio/catodo/commit/c372ed63b460288f520aa6d527549426112703d5))
* **version:** sincronizar uv.lock en el PR de release y verificarlo ([2ccf10b](https://github.com/quicio/catodo/commit/2ccf10bd8141aec6b84d0785a6b708cc7c86da6c))

## [0.1.1](https://github.com/quicio/catodo/compare/v0.1.0...v0.1.1) (2026-11-11)


### Bug Fixes

* **ci:** check-version no depende del cwd que impone uv ([36a020d](https://github.com/quicio/catodo/commit/36a020dd7d5c2ad86d8e27f9368741658c1f2daf))

## Changelog

Todos los cambios relevantes de Cátodo se documentan acá. El archivo lo mantiene
[release-please](https://github.com/googleapis/release-please) a partir de los
Conventional Commits.
