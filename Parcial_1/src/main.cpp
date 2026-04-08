#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>
#include "config.h"

#define DHTPIN 33
#define DHTTYPE DHT22
#define PIN_MQ135 35

const char *NOMBRE_ZONA = "Cocina-Principal";
const char *DEVICE_ID = "ESP32-Cocina-01";
const unsigned long PUBLISH_INTERVAL_DEFAULT_MS = 5000;

const char *ssid = WIFI_SSID;
const char *password = WIFI_PASSWORD;
const char *mqtt_server = MQTT_SERVER;
const int mqtt_port = MQTT_PORT;
const char *mqtt_user = MQTT_USER;
const char *mqtt_pass = MQTT_PASS;
const char *topico_datos = TOPICO_DATOS;
const char *topico_comandos = TOPICO_COMANDOS;

DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastPublishMs = 0;
unsigned long publishIntervalMs = PUBLISH_INTERVAL_DEFAULT_MS;

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  if (strcmp(topic, topico_comandos) != 0)
  {
    return;
  }

  if (length >= 256)
  {
    Serial.println("Comando demasiado largo, ignorado");
    return;
  }

  char msg[256];
  memcpy(msg, payload, length);
  msg[length] = '\0';

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err)
  {
    Serial.print("Comando JSON invalido: ");
    Serial.println(err.c_str());
    return;
  }

  const char *target = doc["device_id"] | "ALL";
  if (strcmp(target, "ALL") != 0 && strcmp(target, DEVICE_ID) != 0)
  {
    return;
  }

  int intervaloSeg = doc["intervalo_seg"] | 0;
  if (intervaloSeg < 1)
  {
    Serial.println("Comando sin intervalo valido, ignorado");
    return;
  }

  if (intervaloSeg > 60)
  {
    intervaloSeg = 60;
  }

  publishIntervalMs = (unsigned long)intervaloSeg * 1000UL;

  Serial.print("Intervalo actualizado por comando MQTT: ");
  Serial.print(intervaloSeg);
  Serial.println("s");
}

void setup_wifi()
{
  Serial.print("\nConectando a WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado");

  // Sincroniza hora local para timestamp legible.
  configTime(-5 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Sincronizando hora NTP");

  struct tm timeinfo;
  while (!getLocalTime(&timeinfo))
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nHora sincronizada");
}

void reconnect()
{
  while (!client.connected())
  {
    Serial.print("Conectando a Maqiatto...");
    String clientId = String(DEVICE_ID) + "-" + String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass))
    {
      Serial.println(" conectado al broker MQTT");
      client.subscribe(topico_comandos, 1);
      Serial.print("Suscrito a comandos en: ");
      Serial.println(topico_comandos);
    }
    else
    {
      Serial.print(" fallo, rc=");
      Serial.print(client.state());
      delay(5000);
    }
  }
}

void publishSensorData()
{
  float temperatura = dht.readTemperature();
  int valorMQ135 = analogRead(PIN_MQ135);

  if (isnan(temperatura))
  {
    Serial.println("Lectura invalida de DHT22");
    return;
  }

  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["zona"] = NOMBRE_ZONA;
  doc["temperatura_C"] = temperatura;
  doc["mq135_aire"] = valorMQ135;

  time_t now = time(nullptr);
  struct tm *timeinfo = localtime(&now);
  char timeString[32];
  strftime(timeString, sizeof(timeString), "%Y-%m-%d %H:%M:%S", timeinfo);
  doc["timestamp"] = timeString;

  char jsonBuffer[512];
  size_t len = serializeJsonPretty(doc, jsonBuffer, sizeof(jsonBuffer));
  if (len == 0)
  {
    Serial.println("Error serializando JSON (buffer insuficiente)");
    return;
  }

  Serial.print("Publicando sensores -> ");
  Serial.println(jsonBuffer);
  client.publish(topico_datos, jsonBuffer, len);
}

void setup()
{
  Serial.begin(115200);
  Serial.println("Iniciando emisor de sensores IoT...");

  dht.begin();
  setup_wifi();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);
}

void loop()
{
  if (!client.connected())
  {
    reconnect();
  }
  client.loop();

  unsigned long nowMs = millis();
  if (nowMs - lastPublishMs >= publishIntervalMs)
  {
    lastPublishMs = nowMs;
    publishSensorData();
  }

  delay(100);
}