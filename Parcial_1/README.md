# BlackKitchens — Sistema de Monitoreo IoT para Cocinas a Puertas Cerradas

**BlackKitchens** es un sistema de monitoreo ambiental diseñado para cocinas de puertas cerradas (*black kitchens*), donde la ausencia de ventilación natural puede generar acumulación peligrosa de gases y temperaturas elevadas. El sistema integra hardware embedded (ESP32), procesamiento en el borde con Node-RED, almacenamiento en MySQL y visualización en tiempo real a través de un dashboard web.

---

## Tabla de contenidos

1. [Arquitectura general de la solución](#1-arquitectura-general-de-la-solución)
2. [Variables monitoreadas y sensores utilizados](#2-variables-monitoreadas-y-sensores-utilizados)
3. [Protocolos de comunicación implementados](#3-protocolos-de-comunicación-implementados)
4. [Procesamiento, estados, alertas y actuaciones](#4-procesamiento-estados-alertas-y-actuaciones)
5. [Estrategia de almacenamiento](#5-estrategia-de-almacenamiento)
6. [Proceso de limpieza y análisis de datos](#6-proceso-de-limpieza-y-análisis-de-datos)
7. [Visualización desarrollada](#7-visualización-desarrollada)
8. [Stack tecnológico](#8-stack-tecnológico)
9. [Despliegue y configuración](#9-despliegue-y-configuración)

---

## 1. Arquitectura general de la solución

El sistema sigue un modelo de **separación de responsabilidades** en cuatro capas:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CAPA DE ADQUISICIÓN                                 │
│  ┌──────────────────┐   ┌──────────────────┐                                │
│  │  ESP32 (Cocina-01)│   │  Simulador Python │  MQTT                         │
│  │  DHT22 + MQ135    │──▶│  (SIM-Cocina)     │──▶  maqiatto.com:1883        │
│  │  LEDs indicadores │   │  Docker container │     tópico /alertas          │
│  └──────────────────┘   └──────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼ MQTT
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CAPA DE PROCESAMIENTO                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Node-RED 4.0                                │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │    │
│  │  │ Validación y  │  │  Cálculo de  │  │  Limpieza    │              │    │
│  │  │ Normalización │──▶│  Estados y   │──▶│  de datos    │              │    │
│  │  │ de payloads   │  │  Actuadores  │  │  (batch 100) │              │    │
│  │  └──────────────┘  └──────┬───────┘  └──────────────┘              │    │
│  │                           ▼                                        │    │
│  │                    ┌──────────────┐                                │    │
│  │                    │  Análisis    │                                │    │
│  │                    │  Mensual     │                                │    │
│  │                    └──────────────┘                                │    │
│  │  ┌───────────────────────────────────────────────────────────┐    │    │
│  │  │  REST API (GET/POST) + WebSocket (ws/latest cada 2s)       │    │    │
│  │  └───────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴──────────────┐
                    │ HTTP (proxy)             │ WebSocket
                    ▼                          ▼
┌──────────────────────┐  ┌───────────────────────────────────┐
│  Express API (3001)  │  │  Dashboard Web                    │
│  Proxy estático +    │  │  HTML + CSS + Chart.js            │
│  CORS handler        │  │  Gauges, gráficos, tablas         │
└──────────────────────┘  └───────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         CAPA DE ALMACENAMIENTO                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     MySQL 8.0 (iot_db)                               │   │
│  │  mediciones_brutas → mediciones_limpias → analisis_mediciones        │   │
│  │  estados_medicion  → eventos_actuadores → incidencias                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flujo de datos

1. **Adquisición:** El ESP32 (y el simulador Python) leen temperatura y gas, y publican JSON por MQTT al broker `maqiatto.com` en el tópico `/alertas`.
2. **Procesamiento:** Node-RED recibe los mensajes, valida, normaliza, calcula estado de riesgo y decisión de actuadores, y envía comandos de vuelta al ESP32 por MQTT.
3. **Almacenamiento:** Los datos crudos, estados, eventos, incidencias y resultados de análisis se persisten en MySQL.
4. **Visualización:** Una API REST + WebSocket sirve datos al dashboard web, que se actualiza en tiempo real (cada 2 s).

---

## 2. Variables monitoreadas y sensores utilizados

### Sensores físicos (ESP32)

| Sensor | Variable | Tipo | Pin | Rango | Precisión |
|--------|----------|------|-----|-------|-----------|
| DHT22 | Temperatura ambiente (°C) | Digital (OneWire) | GPIO 33 | −20 a 80 °C | ±0.5 °C |
| MQ-135 | Calidad del aire / gas (ADC) | Analógico | GPIO 35 (ADC1_CH6) | 0–4095 | — |

### Actuadores físicos

| Actuador | Función | Pin |
|----------|---------|-----|
| LED Verde (GPIO 25) | Indica estado NORMAL | GPIO 25 |
| LED Amarillo (GPIO 26) | Indica estado ALERTA | GPIO 26 |
| LED Rojo (GPIO 27) | Indica estado EMERGENCIA | GPIO 27 |

### Variables derivadas

| Variable | Origen | Unidad |
|----------|--------|--------|
| `device_id` | Configuración del nodo | String (Cocina-01, SIM-Cocina, etc.) |
| `zona` | Configuración del nodo | String (ej. "Cocina Principal") |
| `timestamp` | NTP (ESP32) o generado | ISO 8601 / epoch |

---

## 3. Protocolos de comunicación implementados

### Capa de red y transporte

| Protocolo | Función |
|-----------|---------|
| **IEEE 802.11 (WiFi)** | Conexión inalámbrica del ESP32 a la red local (SSID configurable) |
| **TCP/IP** | Transporte confiable para todas las comunicaciones IP |
| **DNS** | Resolución del nombre `maqiatto.com` y `pool.ntp.org` |

### Sincronización temporal

| Protocolo | Servidor | Zona horaria |
|-----------|----------|-------------|
| **NTP** | `pool.ntp.org` | UTC−5 (America/Bogota) |

### Mensajería MQTT

| Parámetro | Valor |
|-----------|-------|
| Broker | `maqiatto.com:1883` |
| Versión | MQTT v3.1.1 |
| Tópico de datos | `<usuario>/alertas` |
| Tópico de comandos | `<usuario>/comandos` |
| Payload | JSON plano |

**Formato del payload MQTT (publicación):**

```json
{
  "device_id": "Cocina-01",
  "zona": "Cocina Principal",
  "temperatura_C": 25.3,
  "mq135_aire": 1200,
  "timestamp": 1717000000
}
```

**Formato del payload MQTT (comando recibido):**

```json
{
  "command": "SET_INTERVAL",
  "value": 6
}
```

### API REST (HTTP)

Endpoints expuestos por Node-RED (a través del proxy Express):

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/nodes` | Último estado por dispositivo |
| `GET` | `/api/nodes/:id/latest` | Última lectura de un dispositivo |
| `GET` | `/api/nodes/:id/series` | Serie temporal de un dispositivo |
| `GET` | `/api/nodes/:id/incidencias` | Incidencias de un dispositivo |
| `POST` | `/api/nodes/:id/state` | Enviar comando de estado |
| `POST` | `/api/clean` | Ejecutar limpieza por lotes |
| `POST` | `/api/analysis/monthly` | Generar análisis mensual |
| `GET` | `/api/analysis/summary` | Resumen agregado |
| `GET` | `/api/analysis/brutas` | Mediciones brutas |
| `GET` | `/api/analysis/limpias` | Mediciones limpias |
| `GET` | `/api/analysis/incidencias` | Incidencias |
| `GET` | `/api/analysis/eventos` | Eventos de actuadores |
| `GET` | `/api/analysis/analisis` | Registros de análisis mensual |
| `GET` | `/api/stream/latest` | Último estado por dispositivo + actuadores |

### WebSocket en tiempo real

- Endpoint: `/ws/latest`
- Frecuencia: 2 segundos
- Contenido: último estado de todos los dispositivos con información de actuadores

---

## 4. Procesamiento, estados, alertas y actuaciones

### 4.1 Pipeline de procesamiento en Node-RED

Cada mensaje MQTT entrante atraviesa las siguientes etapas dentro del flujo **"Flujo 1"**:

1. **Recepción MQTT** — Nodo `MQTT Input` suscrito al tópico `/alertas`
2. **Parseo JSON** — Deserialización del payload
3. **Validación y normalización**:
   - Unificación de nombres de campo (`temperatura_C`, `temp`, `temperature` → `temperatura_C`)
   - Normalización de timestamps (epoch, ISO 8601, etc.)
   - Validación de rangos físicos
   - Saturación (*clamping*) de valores extremos
   - Mapeo ADC → PPM para MQ-135
4. **Cálculo de estado de riesgo**:
   - Comparación contra umbrales (`UMBRAL_TEMP = 28.0 °C`, `UMBRAL_GAS = 3600`)
   - Asignación de estado: `NORMAL`, `ALERTA`, `EMERGENCIA`, `INVALIDO`
5. **Decisión de actuadores**:
   - Determinación del estado de cada actuador según matriz de decisión
   - Cálculo del intervalo dinámico de publicación
   - Publicación de comando MQTT de retorno al dispositivo
6. **Inserción en MySQL** — Almacenamiento en 4 tablas

### 4.2 Matriz de decisión de estados y actuadores

| Temperatura | Gas (MQ-135) | Estado | LED | Extractor | Sirena | Válvula de gas | Intervalo ESP32 |
|-------------|-------------|--------|-----|-----------|--------|---------------|----------------|
| < 28 °C | < 3600 | NORMAL | Verde | Apagado | Apagada | Abierta | 10 s |
| ≥ 28 °C | < 3600 | ALERTA | Amarillo | Encendido | Apagada | Abierta | 6 s |
| < 28 °C | ≥ 3600 | ALERTA | Amarillo | Encendido | Apagada | Abierta | 6 s |
| ≥ 28 °C | ≥ 3600 | EMERGENCIA | Rojo | Encendido | Encendida | Cerrada | 3 s |

### 4.3 Lógica de transición

Cuando el estado calculado difiere del estado anterior, Node-RED:
- Publica un comando MQTT hacia el ESP32 con el nuevo intervalo
- Registra un evento en `eventos_actuadores` con el motivo de activación y el historial de los últimos 3 estados

### 4.4 Detección de anomalías de comunicación

El dashboard web detecta **desconexión** de un nodo si no recibe datos en los últimos 60 segundos, marcándolo como `OFFLINE`.

---

## 5. Estrategia de almacenamiento

### 5.1 Motor de base de datos

- **Sistema:** MySQL 8.0
- **Base de datos:** `iot_db`
- **Esquema:** Inicializado automáticamente mediante `docker/mysql/init.sql`
- **Persistencia:** Volumen Docker `mysql_data` mapeado al contenedor

### 5.2 Tablas del sistema

#### `mediciones_brutas`
Datos crudos tal como llegan del dispositivo vía MQTT.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| `device_id` | VARCHAR(100) | Identificador del nodo |
| `zona` | VARCHAR(120) | Zona de monitoreo |
| `temperatura_c` | DECIMAL(6,2) | Temperatura en °C |
| `mq135_aire` | INT | Lectura analógica MQ-135 |
| `timestamp_origen` | DATETIME | Marca de tiempo original |
| `limpio` | TINYINT(1) | Flag de proceso de limpieza |
| `created_at` | TIMESTAMP | Fecha de inserción |

#### `mediciones_limpias`
Datos depurados después del proceso de limpieza.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| `medicion_id` | BIGINT UNSIGNED | FK → mediciones_brutas.id |
| `temperatura_c` | DECIMAL(6,2) | Temperatura limpiada |
| `mq135_aire` | INT | Gas limpiado |
| `created_at` | TIMESTAMP | Fecha de inserción |

#### `incidencias`
Registro de todas las anomalías detectadas durante la limpieza.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| `medicion_id` | BIGINT UNSIGNED | FK → mediciones_brutas.id |
| `device_id` | VARCHAR(100) | Dispositivo |
| `zona` | VARCHAR(120) | Zona |
| `tipo_incidencia` | ENUM | OK, OBSERVADO, ERROR, DUPLICADO, MULTIPLE, INCOMPLETO, TEMPORAL, FORMATO, ATIPICO |
| `detalle_incidencia` | VARCHAR(255) | Descripción de la anomalía |
| `valor_detectado` | JSON | Valor original problemático |
| `created_at` | TIMESTAMP | |

#### `estados_medicion`
Estado de riesgo calculado por cada medición.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| `medicion_id` | BIGINT UNSIGNED | FK → mediciones_brutas.id |
| `estado_riesgo` | ENUM | NORMAL, ALERTA, EMERGENCIA, INVALIDO |
| `detalle_estado` | VARCHAR(255) | Descripción del estado |
| `tiempo_espera_seg` | DECIMAL(8,2) | Intervalo dinámico calculado |
| `created_at` | TIMESTAMP | |

#### `eventos_actuadores`
Decisiones de actuación registradas.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| `medicion_id` | BIGINT UNSIGNED | FK → mediciones_brutas.id (SET NULL) |
| `device_id` | VARCHAR(100) | Dispositivo |
| `estado_riesgo` | ENUM | NORMAL, ALERTA, EMERGENCIA, INVALIDO |
| `motivo_activacion` | VARCHAR(255) | Causa de la actuación |
| `historial_reciente` | VARCHAR(255) | Últimos 3 estados concatenados |
| `led_estado` | ENUM | VERDE, AMARILLO, ROJO |
| `extractor_estado` | ENUM | ENCENDIDO, APAGADO |
| `sirena_estado` | ENUM | ENCENDIDA, APAGADA |
| `valvula_gas_estado` | ENUM | ABIERTA, CERRADA |
| `created_at` | TIMESTAMP | |

#### `analisis_mediciones`
Resultados del análisis estadístico mensual por dispositivo.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGINT UNSIGNED AUTO_INCREMENT | PK |
| `device_id` | VARCHAR(100) | Dispositivo |
| `zona` | VARCHAR(120) | Zona |
| `periodo_dias` | INT | 30 días |
| `total_registros` | INT | Conteo de registros analizados |
| `temp_promedio`, `temp_mediana`, `temp_moda`, ... | FLOAT | Estadísticas de temperatura |
| `temp_fuera_rango`, `temp_anomalias` | INT | Conteos de anomalías |
| `mq135_promedio`, `mq135_mediana`, `mq135_moda`, ... | FLOAT | Estadísticas de gas |
| `mq135_fuera_rango`, `mq135_anomalias` | INT | Conteos de anomalías |
| `corr_temp_mq135` | FLOAT | Correlación de Pearson temperatura-gas |
| `created_at` | TIMESTAMP | |

### 5.3 Vistas y procedimientos

- **`vw_mediciones_estado`** — JOIN entre `mediciones_brutas` y `estados_medicion`
- **`sp_limpiar_datos_iot()`** — Borrado completo de todas las tablas (reset)
- **`sp_limpiar_lote(batch_size INT)`** — Limpieza incremental mediante cursor con lógica de imputación

### 5.4 Diagrama entidad-relación

```
mediciones_brutas 1──N mediciones_limpias
       │
       1
       │
       N
       ├── estados_medicion
       ├── eventos_actuadores
       └── incidencias
```

---

## 6. Proceso de limpieza y análisis de datos

### 6.1 Generación de datos imperfectos (simulador)

El simulador Python (`simulator/simulate_nodes.py`) introduce intencionalmente anomalías para probar el pipeline de limpieza:

| Anomalía | Probabilidad | Efecto |
|----------|-------------|--------|
| Dato faltante | 0.5 % | Se omite un campo del payload |
| Valor atípico (*outlier*) | 0.5 % | Temperatura = 120 °C, gas = 9999 |
| Duplicado | 2 % | Reenvío del último payload enviado |
| Vacío de transmisión | 1 % | Pausa de 35 s sin enviar datos |

### 6.2 Proceso de limpieza (Node-RED + Stored Procedure)

El proceso ocurre en dos etapas complementarias:

#### Etapa 1 — Limpieza en Node-RED (flujo "Limpieza", batch de 100)

1. Selecciona registros de `mediciones_brutas` donde `limpio = 0`
2. Calcula estadísticas (mediana) del lote actual
3. Para cada registro:
   - Valida temperatura en rango [−20, 80] °C
   - Valida MQ-135 en rango [0, 4095]
   - Si algún valor es inválido: imputa con la mediana del lote y registra incidencia
4. Inserta datos limpios en `mediciones_limpias`
5. Marca `mediciones_brutas.limpio = 1`

#### Etapa 2 — Limpieza via Stored Procedure (`sp_limpiar_lote`)

Procedimiento almacenado en MySQL que realiza la misma lógica mediante cursor, permitiendo ejecución desde cualquier cliente SQL sin depender de Node-RED.

#### Tipos de incidencias registradas

| Tipo | Significado |
|------|-------------|
| `OK` | Dato válido |
| `OBSERVADO` | Dato válido pero inusual |
| `ERROR` | Valor fuera de rango físico |
| `DUPLICADO` | Registro duplicado |
| `MULTIPLE` | Múltiples problemas |
| `INCOMPLETO` | Campos faltantes |
| `TEMPORAL` | Problema de timestamp |
| `FORMATO` | Formato de campo incorrecto |
| `ATIPICO` | Valor atípico estadístico |

### 6.3 Análisis mensual

El flujo "Analisis" de Node-RED ejecuta el análisis de los últimos 30 días:

1. Consulta `mediciones_limpias` agrupando por `device_id`
2. Calcula para temperatura y gas:
   - **Media, mediana, moda** — Tendencia central
   - **Mínimo, máximo, rango** — Dispersión absoluta
   - **Desviación estándar, varianza** — Dispersión relativa
   - **Anomalías, valores fuera de rango** — Calidad del dato
3. Calcula **correlación de Pearson** entre temperatura y gas (`corr_temp_mq135`)
4. Persiste los resultados en `analisis_mediciones`

Esta métrica de correlación permite identificar si los aumentos de temperatura y gas ocurren simultáneamente, lo cual es fundamental en escenarios de black kitchen donde una fuga de gas podría ir acompañada de un incremento térmico.

---

## 7. Visualización desarrollada

### 7.1 Dashboard en tiempo real

El dashboard web (`api/public/`) se actualiza cada 2 segundos vía WebSocket y está construido con HTML, CSS vanilla y Chart.js 4.4.3.

#### Panel principal (vista general)

- **Indicador de conexión** — Estado del WebSocket en tiempo real
- **Lista de nodos** — Tarjetas con búsqueda, filtro por zona y filtro por estado de riesgo
- **Detección online/offline** — Ventana de 60 s sin datos → nodo marcado como desconectado

#### Panel de detalle de nodo (al seleccionar un nodo)

| Componente | Descripción |
|-----------|-------------|
| Indicadores de actuadores | 4 tarjetas: LED (color dinámico), Extractor, Sirena, Válvula de gas (con iconos y estados) |
| Gauge de temperatura | Barra vertical con gradiente de color (verde → amarillo → rojo, rango 0–50 °C) |
| Gauge de gas (MQ-135) | Barra vertical con gradiente de color (verde → amarillo → rojo, rango 0–4095) |
| Gráfico de temperatura (línea) | Últimos 50 puntos con sombreado y umbral marcado (28 °C) |
| Gráfico de gas (línea) | Últimos 50 puntos con sombreado y umbral marcado (3600) |
| Tabla de paquetes | Últimos 50 registros con timestamp, temperatura, gas, estado |
| Lista de incidencias | Incidencias registradas para el dispositivo |
| Comandos | Botones para enviar NORMAL / ALERTA / EMERGENCIA manualmente |

#### Página de análisis

- **Tarjetas de resumen:** total brutas, pendientes de limpieza, limpias, incidencias, análisis generados, eventos de actuadores
- **Gráfico de barras:** promedios de temperatura y gas por dispositivo
- **Gráfico de torta:** distribución de estados de riesgo
- **Gráfico de línea:** tendencia histórica (últimos 30 días)
- **Tablas de datos:** pendientes, incidencias, limpias, análisis mensual, eventos de actuadores (con paginación y scroll)
- **Botones de acción:** "Generar análisis mensual", "Limpiar lote (100)"

### 7.2 Estilo visual

- Tipografía: Space Grotesk (títulos) + IBM Plex Mono (datos)
- Diseño responsivo
- Paleta de colores: fondo oscuro con acentos de color según estado de riesgo
- Animaciones suaves en transiciones de datos

---

## 8. Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Microcontrolador** | ESP32 DOIT DEVKIT V1 | — |
| **Framework firmware** | Arduino + PlatformIO | — |
| **Librerías firmware** | ArduinoJson 6.21.3, PubSubClient 2.8, DHT sensor library 1.4.4, Adafruit Unified Sensor 1.1.9 | — |
| **Broker MQTT** | Maqiatto | — |
| **Procesador de flujos** | Node-RED | 4.0 |
| **Base de datos** | MySQL | 8.0 |
| **Proxy API** | Node.js + Express | 20 (Alpine) |
| **Dashboard** | HTML5 + CSS3 + Chart.js | 4.4.3 |
| **Simulador** | Python + paho-mqtt | 3.11 |
| **Orquestación** | Docker Compose | — |
| **IDE** | VS Code + PlatformIO | — |

---

## 9. Despliegue y configuración

### 9.1 Requisitos previos

- Docker Desktop
- VS Code con extensión PlatformIO
- ESP32 con sensores DHT22 y MQ-135 conectados
- Cuenta en [maqiatto.com](https://maqiatto.com) (broker MQTT)

### 9.2 Configuración inicial

```powershell
# 1. Variables de entorno para contenedores
Copy-Item .env.example .env
# Editar .env con credenciales MySQL, MQTT y umbrales

# 2. Credenciales del firmware ESP32
Copy-Item include/config.example.h include/config.h
# Editar config.h con WiFi, MQTT y tópicos
```

### 9.3 Levantar el sistema

```powershell
docker compose down -v
docker compose up -d --build
```

### 9.4 Servicios

| Servicio | URL | Puerto |
|----------|-----|--------|
| Node-RED | http://localhost:1880 | 1880 |
| Adminer | http://localhost:8080 | 8080 |
| API / Dashboard | http://localhost:3001 | 3001 |
| MySQL | localhost:3306 | 3306 |

### 9.5 Importar flujo Node-RED

1. Abrir http://localhost:1880
2. Menú → Import → seleccionar `flows2.json`
3. Click en "Import" → "Deploy"

### 9.6 Compilar y cargar firmware

En VS Code con PlatformIO:

```powershell
# Build
pio run

# Upload
pio run --target upload

# Serial monitor
pio device monitor
```

### 9.7 Datos de prueba

```powershell
docker compose cp docker/mysql/seed_datos_prueba.sql mysql:/tmp/seed.sql
docker compose exec mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /tmp/seed.sql'
```

### 9.8 Apagar servicios

```powershell
docker compose down
```

---

## Arquitectura de archivos del proyecto

```
Parcial_1/
├── .env / .env.example          # Variables de entorno
├── docker-compose.yml           # Orquestación de servicios
├── platformio.ini               # Configuración de compilación ESP32
├── flows.json / flows2.json     # Flujos Node-RED (v1 y v2)
│
├── src/main.cpp                 # Firmware ESP32
├── include/
│   ├── config.h                 # Credenciales (gitignored)
│   └── config.example.h         # Plantilla de configuración
│
├── api/
│   ├── server.js                # Proxy Express + estáticos
│   ├── package.json
│   └── public/
│       ├── index.html           # Dashboard web
│       ├── app.js               # Lógica frontend
│       └── styles.css           # Estilos
│
├── simulator/
│   ├── simulate_nodes.py        # Generador de datos simulados
│   ├── requirements.txt
│   └── Dockerfile
│
└── docker/
    ├── mysql/
    │   ├── init.sql             # Esquema de base de datos
    │   └── seed_datos_prueba.sql
    └── node-red/
        ├── Dockerfile
        └── bootstrap.sh
```

---

*Proyecto académico — Fundamentos de IoT*  
*Universidad Autónoma de Occidente*  
*Alejandro Bravo (alejandro.bravo_isa@uao.edu.co)*
