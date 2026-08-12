## 1. Backend

- [x] 1.1 Clave `resume_last_channel` (default `true`) en `runtime_config.KEYS`.

## 2. Frontend

- [x] 2.1 En `App.tsx`, al recibir el primer `state_snapshot`: si `resume_last_channel` está habilitado y `last_channel_id` existe en `available_channels`, abrir ese canal.
- [x] 2.2 Verificar que el arranque en Home se mantiene cuando está deshabilitado o el canal no existe.

## 3. Verificación

- [x] 3.1 E2E: dejar un canal activo → reiniciar → arranca en ese canal; desactivar config → arranca en Home.
- [x] 3.2 README: documentar `resume_last_channel`.
