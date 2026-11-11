# Homebrew tap — Cátodo

Cátodo usa el tap existente [`quicio/homebrew-tap`](https://github.com/quicio/homebrew-tap),
el mismo que distribuye Candil. No hace falta crear otro repo ni configurar
tokens.

## Estructura del tap

```
Casks/catodo.rb     # app kiosko (version :latest, apunta al release más nuevo)
Casks/candil.rb     # otra app del mismo tap, no se toca
README.md
```

La fuente de verdad del cask es `packaging/homebrew/Casks/catodo.rb`. Para
publicarlo: copiarlo a `Casks/catodo.rb` del tap y commitear.

## Instalación

```bash
brew install --cask quicio/tap/catodo
```

Requiere macOS en Apple Silicon (`arm64`): `depends_on arch: :arm64` evita que
Homebrew instale un binario incompatible en Intel.

El cask usa `version :latest` y `sha256 :no_check`, igual que Candil: apunta a
`releases/latest/download/Catodo-mac-arm64.zip` y no necesita actualizarse en
cada release. El workflow de release publica ese alias de nombre estable además
del artefacto versionado `Catodo-<version>-mac-arm64.zip`. El backend viaja
dentro de `Catodo.app/Contents/Resources/backend/` y Electron lo lanza como
sidecar; no hay formula ni `brew services`.

## Actualización y desinstalación

```bash
brew upgrade --cask catodo
brew uninstall --cask catodo        # conserva ~/.local/share/catodo/
brew uninstall --cask catodo --zap  # borra también los datos de usuario
```

El cask se agrega una sola vez al tap. Como apunta a `latest/download`, cada
release nuevo queda disponible sin tocar el tap ni usar secretos.
