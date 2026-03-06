#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>
#include "config.h"

#define DHTPIN 33       // Pin del DHT22 (actual: 33, alternativa DHT11: 26)
#define DHTTYPE DHT22   // Tipo de sensor DHT (actual: DHT22)
#define PIN_MQ135 35    // Pin analógico MQ-135 (actual: 35, alternativa: 34)
#define LED_VERDE 25    // LED Estado Normal (actual: 25)
#define LED_AMARILLO 26 // LED Estado Alerta / Extractor (actual: 26)
#define LED_ROJO 27     // LED Estado Emergencia / Alarma (actual: 27)

// --- UMBRALES DE SENSORES ---
const float UMBRAL_TEMP = 30.0; // Temperatura de alerta en °C (actual: 35.0)
const int UMBRAL_GAS = 3000;    // Gas/humo en valor analógico (actual: 3000, antes: 1500)

// --- INTERVALOS DE TIEMPO (en ciclos de 100ms) ---
const int CICLOS_NORMAL = 600;    // Estado Normal: 60 segundos (actual: 600 = 60s)
const int CICLOS_ALERTA = 100;    // Estado Alerta: 10 segundos (actual: 100 = 10s)
const int CICLOS_EMERGENCIA = 20; // Estado Emergencia: 2 segundos (actual: 20 = 2s)

const char *NOMBRE_ZONA = "Cocina-Principal"; // Nombre de la zona monitoreada (actual: "Cocina-Principal")

// ==========================================

// 1. Configuración de Wi-Fi y MQTT (Desde tu config.h)
const char *ssid = WIFI_SSID;
const char *password = WIFI_PASSWORD;
const char *mqtt_server = MQTT_SERVER;
const int mqtt_port = MQTT_PORT;
const char *mqtt_user = MQTT_USER;
const char *mqtt_pass = MQTT_PASS;
const char *topico_datos = TOPICO_DATOS;
const char *topico_comandos = TOPICO_COMANDOS;

// Inicializar
DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient client(espClient);

bool sistemaActivo = false;

// Callback para recibir comandos ("PAUSA" o "INICIAR")
void callback(char *topic, byte *payload, unsigned int length)
{
  String mensaje = "";
  for (int i = 0; i < length; i++)
  {
    mensaje += (char)payload[i];
  }

  Serial.print("📩 Orden recibida: ");
  Serial.println(mensaje);

  StaticJsonDocument<128> doc;
  DeserializationError error = deserializeJson(doc, mensaje);
  if (error)
  {
    Serial.println("Error al parsear el JSON del comando");
    return;
  }
  String comando = doc["msg"] | "";

  if (comando == "PAUSA")
  {
    sistemaActivo = false;
    Serial.println("SISTEMA PAUSADO. Apagando actuadores.");
    digitalWrite(LED_VERDE, LOW);
    digitalWrite(LED_AMARILLO, LOW);
    digitalWrite(LED_ROJO, LOW);
  }
  else if (comando == "INICIAR")
  {
    sistemaActivo = true;
    Serial.println("SISTEMA INICIADO. Reanudando monitoreo...");
  }
  else
  {
    Serial.print("Comando desconocido: ");
    Serial.println(comando);
  }
}

void setup_wifi()
{
  Serial.print("\nConectando a Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n¡WiFi conectado!");

  // Sincronizar hora via NTP (UTC-5 Colombia)
  configTime(-5 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Sincronizando hora NTP");
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo))
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n¡Hora sincronizada!");
}

void reconnect()
{
  while (!client.connected())
  {
    Serial.print("Conectando a Maqiatto...");
    String clientId = "ESP32-Cocina-" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass))
    {
      Serial.println(" ¡Conectado al Bróker MQTT!");
      client.subscribe(topico_comandos);
    }
    else
    {
      Serial.print(" Falló, rc=");
      Serial.print(client.state());
      delay(5000);
    }
  }
}

void setup()
{
  Serial.begin(115200);

  // Configurar LEDs como salidas
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_AMARILLO, OUTPUT);
  pinMode(LED_ROJO, OUTPUT);

  // Apagar LEDs al iniciar
  digitalWrite(LED_VERDE, LOW);
  digitalWrite(LED_AMARILLO, LOW);
  digitalWrite(LED_ROJO, LOW);

  Serial.println("Iniciando Sistema IoT...");
  Serial.println("Sistema PAUSADO. Envía {msg:INICIAR} por MQTT para comenzar.");

  dht.begin();
  setup_wifi();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop()
{
  if (!client.connected())
  {
    reconnect();
  }
  client.loop();

  if (sistemaActivo)
  {
    float temperatura = dht.readTemperature();
    int valorMQ135 = analogRead(PIN_MQ135);

    if (isnan(temperatura))
    {
      Serial.println("Esperando al DHT22...");
      delay(2000);
      return;
    }

    // MÁQUINA DE ESTADOS Y LÓGICA DE ACTUADORES
    String estadoActual = "NORMAL";
    int ciclosEspera = CICLOS_NORMAL;

    // - Si temperatura alta Y gas -> EMERGENCIA
    // - Si solo temperatura alta -> ALERTA
    // - Si solo gas -> ALERTA
    if (temperatura >= UMBRAL_TEMP && valorMQ135 >= UMBRAL_GAS)
    {
      // Temperatura alta combinada con detección de gas -> EMERGENCIA
      estadoActual = "EMERGENCIA";
      ciclosEspera = CICLOS_EMERGENCIA;
      digitalWrite(LED_VERDE, LOW);
      digitalWrite(LED_AMARILLO, LOW);
      digitalWrite(LED_ROJO, HIGH); // Sirena encendida
    }
    else if (temperatura >= UMBRAL_TEMP || valorMQ135 >= UMBRAL_GAS)
    {
      // Solo temperatura alta -> ALERTA
      estadoActual = "ALERTA";
      ciclosEspera = CICLOS_ALERTA;
      digitalWrite(LED_VERDE, LOW);
      digitalWrite(LED_AMARILLO, HIGH); // Extractor encendido
      digitalWrite(LED_ROJO, LOW);
    }
    // Estado Normal
    else
    {
      digitalWrite(LED_VERDE, HIGH);
      digitalWrite(LED_AMARILLO, LOW);
      digitalWrite(LED_ROJO, LOW);
    }

    // EMPAQUETADO Y ENVÍO JSON
    StaticJsonDocument<256> doc;

    doc["zona"] = NOMBRE_ZONA;
    doc["estado_riesgo"] = estadoActual;
    doc["temperatura_C"] = temperatura;
    doc["mq135_aire"] = valorMQ135;

    time_t now = time(nullptr);
    struct tm *timeinfo = localtime(&now);
    char timeString[32];
    strftime(timeString, sizeof(timeString), "%Y-%m-%d %H:%M:%S", timeinfo);
    doc["timestamp"] = timeString;

    char jsonBuffer[256];
    serializeJsonPretty(doc, jsonBuffer);

    Serial.print("[");
    Serial.print(estadoActual);
    Serial.print("] Enviando a la nube -> ");
    Serial.println(jsonBuffer);

    client.publish(topico_datos, jsonBuffer);

    // Espera según la gravedad del evento (Normal=60s, Alerta=10s, Emergencia=2s)
    for (int i = 0; i < ciclosEspera; i++)
    {
      client.loop(); // Sigue escuchando comandos mientras espera
      delay(100);
      if (!sistemaActivo)
        break; // Si el sistema se pausa durante la espera, salir del ciclo para no retrasar la respuesta a la orden de pausa
    }
  }
  else
  {
    // Si el sistema está pausado, solo mantener conexión MQTT viva
    delay(100);
  }
}