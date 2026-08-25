## 1. Imports explícitos en resolución

- [x] 1.1 `frontend/src/App.tsx` línea 6: `./components/Home` → `./components/Home.tsx`.
- [x] 1.2 `frontend/src/App.tsx` línea 7: `./components/home` → `./components/home/index`.
- [x] 1.3 `frontend/src/components/Home.tsx` línea 10: `./home` → `./home/index`.
- [x] 1.4 `frontend/src/components/AppearanceSettings.tsx` línea 16: `./home` → `./home/index`.
- [x] 1.5 Verificar `cd frontend && npm run build` → 0 errores de TS, build OK.