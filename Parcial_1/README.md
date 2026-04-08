# Sistema IoT ESP32 + Node-RED + MySQL

Proyecto de monitoreo IoT con arquitectura separada por responsabilidades:

1. ESP32 publica mediciones crudas por MQTT.
2. Node-RED calcula estado de riesgo y lógica de actuadores.
3. MySQL persiste en 3 tablas: mediciones crudas, estado calculado y evento de actuadores.

## Componentes del sistema

- Firmware ESP32: `src/main.cpp`
- Flujo Node-RED: `flows.json`
- Base de datos inicial: `docker/mysql/init.sql`
- Orquestación Docker: `docker-compose.yml`

## Requisitos

1. Docker Desktop
2. VS Code con PlatformIO
3. ESP32 con sensor DHT22 y MQ135
4. Cuenta MQTT en Maqiatto

## Configuración inicial

### 1) Variables de entorno de contenedores

Crear archivo local:

```powershell
Copy-Item .env.example .env
```

Editar `.env` con tus valores reales:

- `MYSQL_ROOT_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MQTT_USER`
- `MQTT_PASS`

### 2) Credenciales del firmware

Crear `include/config.h` desde la plantilla:

```powershell
Copy-Item include/config.example.h include/config.h
```

Editar `include/config.h` con:

- WiFi (`WIFI_SSID`, `WIFI_PASSWORD`)
- MQTT (`MQTT_USER`, `MQTT_PASS`)
- Tópicos (`TOPICO_DATOS`, `TOPICO_COMANDOS`)

## Levantar el sistema

Desde la raíz del proyecto:

```powershell
docker compose down -v
docker compose up -d --build
```

Esto deja el sistema en estado limpio y recrea esquema base en MySQL.

Servicios:

1. Node-RED: http://localhost:1880
2. Adminer: http://localhost:8080
3. MySQL: localhost:3306

Verificar estado:

```powershell
docker compose ps
```

## Flujo Node-RED

- La carga de `flows.json` es manual.
- Pasos en Node-RED:

1. Abre http://localhost:1880
2. Menu (arriba derecha) -> Import
3. Selecciona `flows.json`
4. Presiona Import
5. Presiona Deploy

## Compilar y cargar firmware (PlatformIO)

Desde VS Code, usar PlatformIO:

1. Build: PlatformIO -> Build
2. Upload: PlatformIO -> Upload
3. Monitor: PlatformIO -> Monitor

Tambien puedes usar Command Palette en VS Code:

1. `PlatformIO: Build`
2. `PlatformIO: Upload`
3. `PlatformIO: Serial Monitor`

## Datos de prueba (20 por cocina)

Se incluyo el script:

- `docker/mysql/seed_datos_prueba.sql`

Que hace:

1. Limpia datos actuales.
2. Reinicia auto_increment.
3. Inserta 20 registros por cada cocina (`Cocina-01`, `Cocina-02`, `Cocina-03`) para un total de 60 registros, y genera estados/eventos de forma consistente.

Uso:

1. Copiar script al contenedor MySQL:

```powershell
docker compose cp docker/mysql/seed_datos_prueba.sql mysql:/tmp/seed_datos_prueba.sql
```

2. Ejecutar script:

```powershell
docker compose exec mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /tmp/seed_datos_prueba.sql'
```

Importante (Windows PowerShell):

- Usa exactamente el comando anterior con comillas simples externas.
- No uses la variante con `-e "SOURCE ..."` porque rompe el escape de comillas en PowerShell.

Nota recomendada para carga controlada:

- Si el ESP32 y Node-RED estan insertando en tiempo real, detiene temporalmente Node-RED para evitar mezcla con los datos de ejemplo.

## Modelo de datos actual

### Tabla `mediciones_brutas`

- Datos crudos recibidos del ESP32.

### Tabla `estados_medicion`

- Estado calculado por Node-RED para cada medición (`NORMAL`, `ALERTA`, `EMERGENCIA`, `INVALIDO`).

### Tabla `eventos_actuadores`

- Decisión de actuadores y motivo, asociada a la medición.
- Usa una sola columna de estado (`estado_riesgo`) para el estado del evento en el momento.
- Incluye `historial_reciente` con formato de 3 estados anteriores + estado actual.

## Consultas rápidas de validación

```sql
SELECT id, device_id, zona, temperatura_c, mq135_aire, timestamp_origen, created_at
FROM mediciones_brutas
ORDER BY id DESC
LIMIT 20;
```

```sql
SELECT id, medicion_id, estado_riesgo, detalle_estado, tiempo_espera_seg, created_at
FROM estados_medicion
ORDER BY id DESC
LIMIT 20;
```

```sql
SELECT id, medicion_id, device_id, estado_riesgo, motivo_activacion, historial_reciente, led_estado, extractor_estado, sirena_estado, valvula_gas_estado, created_at
FROM eventos_actuadores
ORDER BY id DESC
LIMIT 20;
```

## Consultas de botones Node-RED (para DBeaver)

Estas son las mismas consultas que disparan los botones `Inject` del flujo en Node-RED, listas para ejecutar directamente en DBeaver.

### 1) Botón: SELECT ultimas 20

Muestra las ultimas 20 mediciones con su estado calculado.

```sql
SELECT
	m.id,
	m.device_id,
	m.zona,
	m.temperatura_c,
	m.mq135_aire,
	e.estado_riesgo,
	e.detalle_estado,
	e.tiempo_espera_seg,
	m.timestamp_origen,
	m.created_at
FROM mediciones_brutas m
INNER JOIN estados_medicion e ON e.medicion_id = m.id
ORDER BY m.id DESC
LIMIT 20;
```

### 2) Botón: SELECT NORMAL

Filtra las ultimas 20 mediciones cuyo estado es `NORMAL`.

```sql
SELECT
	m.id,
	m.device_id,
	m.zona,
	m.temperatura_c,
	m.mq135_aire,
	e.estado_riesgo,
	e.detalle_estado,
	e.tiempo_espera_seg,
	m.timestamp_origen,
	m.created_at
FROM mediciones_brutas m
INNER JOIN estados_medicion e ON e.medicion_id = m.id
WHERE e.estado_riesgo = 'NORMAL'
ORDER BY m.id DESC
LIMIT 20;
```

### 3) Botón: SELECT ALERTA

Filtra las ultimas 20 mediciones cuyo estado es `ALERTA`.

```sql
SELECT
	m.id,
	m.device_id,
	m.zona,
	m.temperatura_c,
	m.mq135_aire,
	e.estado_riesgo,
	e.detalle_estado,
	e.tiempo_espera_seg,
	m.timestamp_origen,
	m.created_at
FROM mediciones_brutas m
INNER JOIN estados_medicion e ON e.medicion_id = m.id
WHERE e.estado_riesgo = 'ALERTA'
ORDER BY m.id DESC
LIMIT 20;
```

### 4) Botón: SELECT EMERGENCIA

Filtra las ultimas 20 mediciones cuyo estado es `EMERGENCIA`.

```sql
SELECT
	m.id,
	m.device_id,
	m.zona,
	m.temperatura_c,
	m.mq135_aire,
	e.estado_riesgo,
	e.detalle_estado,
	e.tiempo_espera_seg,
	m.timestamp_origen,
	m.created_at
FROM mediciones_brutas m
INNER JOIN estados_medicion e ON e.medicion_id = m.id
WHERE e.estado_riesgo = 'EMERGENCIA'
ORDER BY m.id DESC
LIMIT 20;
```

### 5) Botón: RESUMEN ALERTAS

Resume cantidad de registros por severidad de alerta y fecha de ultima medicion para `ALERTA` y `EMERGENCIA`.

```sql
SELECT
	estado_riesgo,
	COUNT(*) AS total,
	MAX(created_at) AS ultima_medicion
FROM estados_medicion
WHERE estado_riesgo IN ('ALERTA', 'EMERGENCIA')
GROUP BY estado_riesgo
ORDER BY total DESC;
```

### 6) Botón: SELECT BRUTAS (ULTIMAS 20)

Muestra solo datos crudos recibidos desde el dispositivo.

```sql
SELECT
	id,
	device_id,
	zona,
	temperatura_c,
	mq135_aire,
	timestamp_origen,
	created_at
FROM mediciones_brutas
ORDER BY id DESC
LIMIT 20;
```

### 7) Botón: SELECT ACTUADORES (ULTIMOS 20)

Muestra decisiones de actuadores con estado del evento, motivo e historial.

```sql
SELECT
	id,
	medicion_id,
	device_id,
	estado_riesgo,
	motivo_activacion,
	historial_reciente,
	led_estado,
	extractor_estado,
	sirena_estado,
	valvula_gas_estado,
	created_at
FROM eventos_actuadores
ORDER BY id DESC
LIMIT 20;
```

## Apagar servicios

```powershell
docker compose down
```
