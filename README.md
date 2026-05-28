# BlackKitchens — Sistema de Monitoreo IoT para Cocinas a Puertas Cerradas

Sistema integral de monitoreo ambiental para **black kitchens** (cocinas de puertas cerradas), diseñado para detectar riesgos por acumulación de gases y temperaturas elevadas en entornos de cocina industrial sin ventilación natural.

## Arquitectura general

```
┌──────────────────┐     MQTT      ┌──────────────────────────────────────┐     SQL      ┌───────────┐
│  ESP32 (HW)      │──────────────▶│           Node-RED                   │─────────────▶│   MySQL   │
│  DHT22 + MQ135   │◀──────────────│  Validación · Estados · Actuadores   │              │  5 tabs   │
│  LEDs indicador   │  comandos     │  Limpieza · Análisis mensual        │              │  2 vistas  │
└──────────────────┘              │  REST API + WebSocket                │              │  2 procs   │
                                   └──────────┬───────────────────────────┘              └───────────┘
┌──────────────────┐     MQTT                 │ HTTP proxy
│  Simulador Python │──────────────▶          │
│  (Docker)         │                       ┌─▼────────────────┐
└──────────────────┘                       │  Express API     │
                                            │  (proxy :3001)   │
                                            └─┬────────────────┘
                                              │
                                          ┌───▼──────────────┐
                                          │  Dashboard Web   │
                                          │  (Chart.js + WS) │
                                          └──────────────────┘
```

## Variables monitoreadas y sensores

| Variable | Sensor | Rango | Precisión |
|----------|--------|-------|-----------|
| Temperatura ambiente | DHT22 | -20 a 80 °C | ±0.5 °C |
| Calidad del aire / gas | MQ-135 | 0–4095 ADC | Analógico |
| LEDs indicadores (V/A/R) | Salidas digitales | GPIO 25–27 | — |

## Protocolos de comunicación

- **IEEE 802.11 (WiFi)** — Conectividad inalámbrica del ESP32
- **TCP/IP** — Transporte base
- **DNS** — Resolución de broker MQTT
- **NTP** — Sincronización temporal (zona horaria America/Bogota)
- **MQTT v3.1.1** — Publicación de lecturas y recepción de comandos (broker: maqiatto.com)
- **HTTP REST** — API de consulta y operación
- **WebSocket** — Actualización en tiempo real del dashboard

## Procesamiento, estados, alertas y actuaciones

Node-RED procesa cada medición y determina el estado de riesgo comparando contra umbrales configurables (TP = 28 °C, GP = 3600 ADC):

| Temperatura | Gas | Estado | LED | Extractor | Sirena | Válvula gas | Intervalo |
|-------------|-----|--------|-----|-----------|--------|-------------|-----------|
| < TP | < GP | NORMAL | Verde | Apagado | Apagada | Abierta | 10 s |
| ≥ TP | < GP | ALERTA | Amarillo | Encendido | Apagada | Abierta | 6 s |
| < TP | ≥ GP | ALERTA | Amarillo | Encendido | Apagada | Abierta | 6 s |
| ≥ TP | ≥ GP | EMERGENCIA | Rojo | Encendido | Encendida | Cerrada | 3 s |

Las decisiones se envían de vuelta al ESP32 vía MQTT para ajustar su intervalo de publicación dinámicamente.

## Estrategia de almacenamiento

Base de datos MySQL 8.0 con 5 tablas normalizadas:

- **`mediciones_brutas`** — Datos crudos del sensor
- **`mediciones_limpias`** — Datos depurados e imputados
- **`estados_medicion`** — Estados de riesgo calculados
- **`eventos_actuadores`** — Decisiones de actuación
- **`incidencias`** — Registro de anomalías de calidad del dato
- **`analisis_mediciones`** — Resultados del análisis mensual

Además: vista `vw_mediciones_estado` y procedimientos almacenados `sp_limpiar_datos_iot`, `sp_limpiar_lote`.

## Proceso de limpieza y análisis de datos

**Limpieza:** Procesamiento por lotes (100 registros) que valúa rangos físicos (−20 a 80 °C, 0–4095 ADC), imputa valores inválidos con la mediana del lote, e registra incidencias por cada corrección (ERROR, ATIPICO, DUPLICADO, etc.).

**Análisis mensual:** Cálculo estadístico sobre los últimos 30 días por dispositivo: media, mediana, moda, mínimo, máximo, rango, desviación estándar, varianza, correlación temperatura-gas, detección de anomalías y valores fuera de rango.

## Visualización desarrollada

Dashboard web en tiempo real (HTML + Chart.js + WebSocket) con:

- Listado de nodos con filtros por zona y estado de riesgo
- Detalle por nodo: indicadores de actuadores, gauges de temperatura y gas, gráficos de línea (últimos 50 puntos), log de paquetes e incidencias
- Envío de comandos manuales (NORMAL / ALERTA / EMERGENCIA)
- Página de análisis con tarjetas de resumen, gráficos de barras, torta y tendencia histórica
- Detección de conexión (online/offline en ventana de 60 s)

---

### Stack tecnológico

| Componente | Tecnología |
|-----------|-----------|
| Firmware | ESP32 + Arduino Framework + PlatformIO |
| Procesamiento | Node-RED 4.0 |
| Base de datos | MySQL 8.0 |
| API / Proxy | Node.js + Express |
| Dashboard | HTML + CSS + Chart.js |
| Simulación | Python 3.11 + paho-mqtt |
| Orquestación | Docker Compose |

---

*Proyecto académico — Fundamentos de IoT, Universidad Autónoma de Occidente.*
