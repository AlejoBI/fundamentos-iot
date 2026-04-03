# IoT + Node-RED + MySQL (Guia Completa)

Este proyecto implementa el flujo completo:
1. ESP32 lee sensores y publica por MQTT (Maqiatto)
2. Node-RED recibe, calcula estado de riesgo y guarda en MySQL
3. Node-RED permite consultas SELECT por estado
4. Resultados se visualizan en formato tabla en el panel Debug

## 1) Requisitos

Necesitas instalado:
1. Docker Desktop
2. PlatformIO (en VS Code) para compilar/subir al ESP32
3. ESP32 conectado por USB
4. Conexion a internet (para Maqiatto)

## 2) Levantar servicios

Desde la raiz del proyecto ejecuta:

1. Crea tu archivo local de variables:

```powershell
Copy-Item .env.example .env
```

2. Edita `.env` con tus credenciales reales.
3. Luego levanta servicios:

```powershell
docker compose up -d --build
```

Servicios disponibles:
1. Node-RED: http://localhost:1880
2. Adminer: http://localhost:8080
3. MySQL: localhost:3306

Para verificar que todo esta arriba:

```powershell
docker compose ps
```

## 3) Cargar el flujo en Node-RED

Forma de trabajo del proyecto: `flows.json` se carga manualmente en Node-RED.

Carga manual del flujo:
1. Abre Node-RED en http://localhost:1880
2. Menu (arriba derecha) -> Import
3. Selecciona `flows.json` de este repo
4. Presiona Import
5. Presiona Deploy

Si quieres reiniciar entorno limpio:

```powershell
docker compose down -v
docker compose up -d --build
```

## 4) Preparar ESP32

1. Revisa credenciales en `include/config.h`
2. Compila el firmware desde VS Code con PlatformIO:

- Opcion A (UI): barra de PlatformIO -> `Build`
- Opcion B (Command Palette): `PlatformIO: Build`

3. Sube el firmware al ESP32:

- Opcion A (UI): barra de PlatformIO -> `Upload`
- Opcion B (Command Palette): `PlatformIO: Upload`

4. Abre monitor serial para verificar publicaciones:

- Opcion A (UI): barra de PlatformIO -> `Monitor`
- Opcion B (Command Palette): `PlatformIO: Serial Monitor`

5. Alternativa por terminal (si `platformio` esta disponible en PATH):

```powershell
platformio run
platformio run --target upload
platformio device monitor
```

Nota: el firmware ya publica JSON en formato pretty para que se vea legible en MQTT/debug.

## 5) Prueba funcional paso a paso

### Prueba A: Ingestion de datos (ESP32 -> Node-RED -> MySQL)
1. En Node-RED abre el panel Debug (icono de insecto)
2. Espera mensajes en `debug estado procesado`
3. Verifica que `debug mysql insert` indique inserciones (affectedRows)

Resultado esperado:
1. Hay mensajes de sensores
2. El estado cambia entre NORMAL/ALERTA/EMERGENCIA
3. MySQL recibe registros nuevos

### Prueba B: Consultas SELECT desde Node-RED
En el flujo tienes estos inject:
1. `SELECT ultimas 20`
2. `SELECT EMERGENCIA`
3. `SELECT ALERTA`
4. `SELECT NORMAL`

Accion:
1. Haz click en cualquiera de los inject anteriores
2. Mira el nodo `debug select tabla`

Resultado esperado:
1. Se muestra una tabla de texto con columnas
2. Si no hay datos para ese filtro, aparece `Sin resultados`

## 6) Verificacion directa en base de datos (Adminer)

Entra a http://localhost:8080 con:
1. System: MySQL
2. Server: mysql
3. Username: valor de `MYSQL_USER` en `.env`
4. Password: valor de `MYSQL_PASSWORD` en `.env`
5. Database: valor de `MYSQL_DATABASE` en `.env`

Consulta sugerida:

```sql
SELECT id, device_id, zona, temperatura_c, mq135_aire, estado_riesgo, timestamp_origen, created_at
FROM mediciones
ORDER BY id DESC
LIMIT 20;
```

## 7) Comandos utiles

Levantar:

```powershell
docker compose up -d --build
```

Ver estado:

```powershell
docker compose ps
```

Ver logs Node-RED:

```powershell
docker compose logs -f nodered
```

Apagar:

```powershell
docker compose down
```

Apagar y borrar datos persistidos:

```powershell
docker compose down -v
```
