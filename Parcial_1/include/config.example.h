#ifndef CONFIG_H
#define CONFIG_H

// ─── Credenciales WiFi ───────
#define WIFI_SSID "TuSSID"
#define WIFI_PASSWORD "TuPassword"

// ─── MQTT ────────────────────
#define MQTT_SERVER "maqiatto.com"
#define MQTT_PORT 1883
#define MQTT_USER "tu_correo@ejemplo.com"
#define MQTT_PASS "tu_clave_mqtt"
#define TOPICO_DATOS "tu_correo@ejemplo.com/alertas"
#define TOPICO_COMANDOS "tu_correo@ejemplo.com/comandos"

// ─── Umbrales (deben coincidir con .env) ───
#define UMBRAL_TEMP 28.0
#define UMBRAL_GAS 3600

// ─── Intervalos por estado (ms) ────────────
#define INTERVALO_NORMAL_MS 10000
#define INTERVALO_ALERTA_MS 6000
#define INTERVALO_EMERGENCIA_MS 3000

// ─── Identidad del nodo ────────────────────
#define DEVICE_ID "ESP32-Cocina-01"
#define NOMBRE_ZONA "Cocina-Principal"

#endif // CONFIG_H