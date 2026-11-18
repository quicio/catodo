# Spec Delta — anime-channel

## REMOVED Requirements

### Requirement: Library scan

**Reason**: el escaneo deja de estar atado al canal Anime y pasa al motor genérico de canales de emisión.

**Migration**: crear una biblioteca de emisión con `kind: series` y la carpeta de Anime; ver `emission-channels`.

### Requirement: Current episode selection

**Reason**: la selección de episodio es parte del motor genérico de medios.

**Migration**: usar los comandos `set_episode`/`next`/`prev` del canal de emisión correspondiente.

### Requirement: Playing flag

**Reason**: el flag de reproducción es común a todos los canales de emisión.

**Migration**: el canal de emisión expone `playing` en su estado.

### Requirement: Cached library scan

**Reason**: el TTL de escaneo es parte del motor genérico de medios.

**Migration**: se conserva el mismo comportamiento en cada canal de emisión.

### Requirement: Range-enabled streaming

**Reason**: el streaming con `Range` lo implementa el canal de medios genérico, no un canal Anime especial.

**Migration**: el endpoint de stream del canal de emisión mantiene 206/416.

### Requirement: Episode selection via command only

**Reason**: la regla de selección por comando es del motor genérico.

**Migration**: el canal de emisión mantiene el mismo contrato.

### Requirement: Episode events

**Reason**: los eventos `episode_changed` ahora los publica cualquier canal de emisión.

**Migration**: los clientes siguen escuchando `episode_changed` con el `channel_id` correspondiente.

### Requirement: Progress reporting and seek-on-load

**Reason**: el progreso pasa a guardarse por biblioteca, no por el id fijo `anime`.

**Migration**: cada canal de emisión guarda su propio progreso; los videos existentes se reanudan al abrir el canal.

### Requirement: Resume in the player

**Reason**: la reanudación es parte del player genérico de medios.

**Migration**: el mismo reproductor se usa para cualquier canal de emisión.
