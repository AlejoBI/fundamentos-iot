#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>
#include "config.h"

// 1. Configuración de Wi-Fi y MQTT (Desde tu config.h)
const char *ssid = WIFI_SSID;
const char *password = WIFI_PASSWORD;
const char *mqtt_server = MQTT_SERVER;
const int mqtt_port = MQTT_PORT;
const char *mqtt_user = MQTT_USER;
const char *mqtt_pass = MQTT_PASS;
const char *topico_datos = TOPICO_DATOS;
const char *topico_comandos = TOPICO_COMANDOS;

// 2. Definir pines de Sensores
#define DHTPIN 33     // Pin del DHT22
#define DHTTYPE DHT22 // Tipo de sensor DHT
#define PIN_MQ135 34  // Pin analógico MQ-135
#define PIN_MQ7 35    // Pin analógico MQ-7

// 3. Definir pines de LEDs (Actuadores / Semáforo)
#define LED_VERDE 25    // Estado Normal
#define LED_AMARILLO 26 // Estado Alerta (Simula Extractor)
#define LED_ROJO 27     // Estado Emergencia (Simula Alarma)

// Umbrales (Ajustados para lectura analógica 0-4095)
const float UMBRAL_TEMP_ALERTA = 35.0;     // Sensor DHT22 temperatura en °C
const float UMBRAL_TEMP_EMERGENCIA = 50.0; // Sensor DHT22 humedad en %
const int UMBRAL_MQ135_ALERTA = 1500;      // Equivalente a gas/humo denso Sensor MQ-135
const int UMBRAL_MQ7_EMERGENCIA = 2000;    // Equivalente a CO tóxico (>50ppm) Sensor MQ-7

// Inicializar
DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient client(espClient);

bool sistemaActivo = false; // Inicia pausado hasta recibir comando

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
    Serial.println("❌ Error al parsear el JSON del comando");
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
  Serial.println("Sistema PAUSADO. Envía {\"msg\":\"INICIAR\"} por MQTT para comenzar.");

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
    int valorMQ7 = analogRead(PIN_MQ7);

    if (isnan(temperatura))
    {
      Serial.println("Esperando al DHT22...");
      delay(2000);
      return;
    }

    // ==========================================
    // MÁQUINA DE ESTADOS Y LÓGICA DE ACTUADORES
    // ==========================================
    String estadoActual = "NORMAL";
    int ciclosEspera = 600; // 60 segundos por defecto (600 iteraciones de 100ms)

    // Evaluar Emergencia (Prioridad Máxima)
    if (temperatura >= UMBRAL_TEMP_EMERGENCIA || valorMQ7 >= UMBRAL_MQ7_EMERGENCIA)
    {
      estadoActual = "EMERGENCIA";
      ciclosEspera = 20; // 2 segundos
      digitalWrite(LED_VERDE, LOW);
      digitalWrite(LED_AMARILLO, LOW);
      digitalWrite(LED_ROJO, HIGH); // Sirena encendida
    }
    // Evaluar Alerta
    else if (temperatura >= UMBRAL_TEMP_ALERTA || valorMQ135 >= UMBRAL_MQ135_ALERTA)
    {
      estadoActual = "ALERTA";
      ciclosEspera = 100; // 10 segundos
      digitalWrite(LED_VERDE, LOW);
      digitalWrite(LED_AMARILLO, HIGH); // Extractor encendido
      digitalWrite(LED_ROJO, LOW);
    }
    // Estado Normal
    else
    {
      digitalWrite(LED_VERDE, HIGH); // Todo ok
      digitalWrite(LED_AMARILLO, LOW);
      digitalWrite(LED_ROJO, LOW);
    }

    // ==========================================
    // EMPAQUETADO Y ENVÍO JSON
    // ==========================================
    StaticJsonDocument<256> doc;

    doc["zona"] = "Cocina-Principal";
    doc["estado_riesgo"] = estadoActual; // Agregamos el estado al JSON
    doc["temperatura_C"] = temperatura;
    doc["mq135_aire"] = valorMQ135;
    doc["mq7_co"] = valorMQ7;
    // Timestamp formateado
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

    // ==========================================
    // TEMPORIZADOR DINÁMICO (No bloqueante)
    // ==========================================
    // Espera según la gravedad del evento (Normal=60s, Alerta=10s, Emergencia=2s)
    for (int i = 0; i < ciclosEspera; i++)
    {
      client.loop(); // Sigue escuchando comandos mientras espera
      delay(100);
      if (!sistemaActivo)
        break; // Si lo pausan en medio del delay, salir.
    }
  }
  else
  {
    // Si el sistema está pausado, solo mantener conexión MQTT viva
    delay(100);
  }
}