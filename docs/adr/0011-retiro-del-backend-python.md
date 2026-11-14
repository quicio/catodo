# 0011 — Retiro del backend Python

- Estado: aceptada
- Fecha: 2026-11-14
- Supersede: la parte de convivencia de [0006](0006-rust-workspace-coexistence.md)

## Contexto

El workspace Rust alcanzó paridad funcional y es el backend de dev, prod y
release. Mantener el backend FastAPI como fallback duplicaba el contrato HTTP,
dos suites de tests, dos mecanismos de packaging y una dependencia de Python/uv
en el gate, el instalador y la CI. La deuda ya no compraba seguridad: el camino
que se probaba en release era el Rust.

## Decisión

- Se elimina `backend/catodo/`, `backend/tests/`, `backend/pyproject.toml` y
  `backend/uv.lock`.
- `run-dev.sh`, `run-prod.sh`, `install.sh` y el gate usan sólo el binario Rust.
- Se retiran `ruff`, `pytest`, `uv`, PyInstaller y `plugin-venv` de CI,
  instalación y packaging.
- Los helpers de desarrollo que estaban en Python (versión, chequeo de capas,
  generación de `noise.png`, pin de cores, parseo de releases y descarga de
  wallpapers) se reescriben en Node o bash.
- Se conserva `backend/static/` (frontend compilado, remote PWA y cast) y
  `backend/systemd/` (unit de usuario).
- Los plugins siguen siendo declarativos: sin código de terceros ni instalación
  de dependencias pip. La gestión es por API.

## Consecuencias

- Un solo runtime, una sola suite de tests (Rust) y un solo camino de release.
- El gate requiere Node (ya necesario para el frontend) y Rust; no Python.
- Se pierde el CLI `catodo plugin …` y el provisioning de dependencias pip de
  plugins; ambos se reemplazan por la API y por canales web sin código.
- Cualquier comportamiento que sólo existiera en Python debe portarse o
  declararse fuera de alcance; no se acepta un fallback silencioso.

## Alternativas descartadas

- Mantener Python como oráculo indefinidamente: duplica mantenimiento y vuelve
  a introducir las dependencias que el port buscaba eliminar.
- Borrar Python sin reescribir los helpers: dejaría el gate y el build
  dependiendo de un intérprete que ya no se distribuye.
- Implementar un CLI de plugins en Rust en este cambio: es alcance separado; la
  API ya cubre listar, instalar, habilitar y deshabilitar.
