## Why

`npm run build` del frontend falla con 18 errores de TS en archivos `App.tsx`, `Home.tsx` y `AppearanceSettings.tsx`. La causa raíz es **case-mismatch en imports** sobre APFS case-insensitive:

- Existe `frontend/src/components/Home.tsx` (capital) Y el directorio `frontend/src/components/home/` (lowercase)
- En macOS APFS (case-insensitive pero case-preserving), `./components/Home` y `./components/home` resuelven al mismo filesystem entry — TypeScript con `forceConsistentCasingInFileNames: true` (default en TS 5+) rechaza la ambigüedad con TS1149.
- Los demás errores (TS2614 `no exported member`, TS2322 type-mismatch, TS7006 implicit-any) son síntomas downstream: el resolver de TS no puede fijar el módulo destino y colapsa tipos a `any`.

Inicialmente parecía que `home.tsx` era un huérfano en disco (untracked pero presente) que bloqueaba el barrel `home/index.ts`. Confirmado: `git ls-files` muestra solo `Home.tsx` y `home/` — no existe `home.tsx` en el repo. Era un artefacto del working directory (probablemente de un rename `Home.tsx → home/` incompleto en macOS), ya purgado.

El fix real es hacer los imports **explícitos en resolución** (sin ambigüedad case):

```ts
// App.tsx antes                                     App.tsx después
import Home from "./components/Home";                import Home from "./components/Home.tsx";
import { getLayout } from "./components/home";       import { getLayout } from "./components/home/index";
```

`allowImportingTsExtensions: true` ya está habilitado en `tsconfig.json`, así que la extensión `.tsx` es válida. `./components/home/index` resuelve sin ambigüedad al barrel que sí exporta todo.

## What Changes

- **`frontend/src/App.tsx`** (2 líneas): `./components/Home` → `./components/Home.tsx`; `./components/home` → `./components/home/index`.
- **`frontend/src/components/Home.tsx`** (1 línea): `./home` → `./home/index`.
- **`frontend/src/components/AppearanceSettings.tsx`** (1 línea): `./home` → `./home/index`.

Sin cambios de comportamiento ni de API pública. La build pasa de 18 errores a 0 en 4.10s.

## Impact

- 3 archivos `.tsx`, 4 líneas diff total.
- Sin cambios en tsconfig.json (las opciones `strict: true` y `allowImportingTsExtensions: true` ya estaban activas).
- Sin cambios en runtime ni en el bundle de Vite.