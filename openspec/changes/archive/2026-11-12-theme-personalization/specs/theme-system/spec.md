## REMOVED Requirements

### Requirement: Tokens de color

**Reason**: El modelo v2 reemplaza la paleta plana por seis dimensiones (`colors`, `typography`, `shape`, `density`, `effects`, `icons`) resueltas a tokens CSS. La capability pasa a `appearance`.

**Migration**: Ver `appearance`, requirement "Modelo de tema multidimensional". Los tokens siguen existiendo como custom properties; se agregan tipografía, forma, densidad e iconos.

### Requirement: Themes predefinidos

**Reason**: El mínimo de 3 themes predefinidos queda reemplazado por los 10 themes del modelo v2, con dimensiones completas.

**Migration**: Ver `appearance`, requirement "Diez temas predefinidos".

### Requirement: Themes custom por JSON

**Reason**: Los themes custom siguen existiendo pero ahora heredan de un theme base y se validan; el requirement vive en `appearance`.

**Migration**: Ver `appearance`, requirements "Temas personalizados con herencia" y "Validación de temas".

### Requirement: Persistencia del theme activo

**Reason**: La persistencia se mantiene igual (`theme` en runtime config) pero el requirement se reescribe junto con la aplicación en vivo.

**Migration**: Ver `appearance`, requirement "Persistencia y aplicación en vivo".

### Requirement: Efectos CRT configurables

**Reason**: Los efectos pasan a ser una dimensión del theme con precedencia explícita entre theme y overrides.

**Migration**: Ver `appearance`, requirement "Precedencia de efectos".

### Requirement: Modo claro/oscuro por theme

**Reason**: `color-scheme` pasa a ser parte de la dimensión `colors` del theme, sin requirement propio.

**Migration**: Ver `appearance`, requirement "Modelo de tema multidimensional".
