#include <Arduino.h>

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include "config.h"

// 1. Configuración de Wi-Fi
const char *ssid = WIFI_SSID;
const char *password = WIFI_PASSWORD;

// 2. Configuración del Bróker MQTT (Maqiatto)
const char *mqtt_server = MQTT_SERVER;
const int mqtt_port = MQTT_PORT;
const char *mqtt_user = MQTT_USER;
const char *mqtt_pass = MQTT_PASS;
const char *topico_datos = TOPICO_DATOS;
const char *topico_comandos = TOPICO_COMANDOS;

// Definir pines
#define DHTPIN 33     // Pin del DHT22
#define DHTTYPE DHT22 // Tipo de sensor DHT
#define PIN_MQ135 34  // Pin analógico MQ-135
#define PIN_MQ7 35    // Pin analógico MQ-7

// Inicializar el sensor DHT
DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient client(espClient);

bool sistemaActivo = false; // El sistema inicia PAUSADO

// Esta función se activa SOLA cada vez que llega un mensaje desde MQTTX
void callback(char *topic, byte *payload, unsigned int length)
{
  String mensaje = "";
  for (int i = 0; i < length; i++)
  {
    mensaje += (char)payload[i];
  }

  Serial.print("📩 Orden recibida: ");
  Serial.println(mensaje);

  // Parsear el JSON recibido
  StaticJsonDocument<128> doc;
  DeserializationError error = deserializeJson(doc, mensaje);
  if (error)
  {
    Serial.println("❌ Error al parsear el JSON del comando");
    return;
  }
  String comando = doc["msg"] | "";

  // Lógica de control
  if (comando == "PAUSA")
  {
    if (!sistemaActivo)
    {
      Serial.println("El sistema ya estaba PAUSADO.");
    }
    else
    {
      sistemaActivo = false;
      Serial.println("SISTEMA PAUSADO. Deteniendo envío de datos a la nube.");
    }
  }
  else if (comando == "INICIAR")
  {
    if (sistemaActivo)
    {
      Serial.println("El sistema ya estaba INICIADO.");
    }
    else
    {
      sistemaActivo = true;
      Serial.println("SISTEMA INICIADO. Reanudando transmisión...");
    }
  }
  else
  {
    Serial.print("Comando desconocido: ");
    Serial.println(comando);
  }
}

void setup_wifi()
{
  delay(10);
  Serial.println();
  Serial.print("Conectando a Wi-Fi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n¡WiFi conectado!");
  Serial.print("Dirección IP: ");
  Serial.println(WiFi.localIP());
}

void reconnect()
{
  while (!client.connected())
  {
    Serial.print("Intentando conexión a Maqiatto...");
    String clientId = "ESP32-Cocina-" + String(random(0xffff), HEX);

    // Conectar al broker usando usuario y clave
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass))
    {
      Serial.println(" ¡Conectado al Bróker MQTT!");

      client.subscribe(topico_comandos);
      Serial.println("Escuchando órdenes en el tópico de comandos...");
    }
    else
    {
      Serial.print(" Falló, error rc=");
      Serial.print(client.state());
      Serial.println(" reintentando en 5 segundos...");
      delay(5000);
    }
  }
}

void setup()
{
  Serial.begin(115200);
  Serial.println("Iniciando Sistema IoT...");
  Serial.println("El sistema está PAUSADO por defecto. Envía el comando {\"msg\":\"INICIAR\"} para comenzar la transmisión de datos.");

  dht.begin();
  setup_wifi();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  delay(2000); // Pequeña pausa antes de intentar conectar al broker
}

void loop()
{
  if (!client.connected())
  {
    reconnect();
  }
  client.loop(); // Mantiene la conexión MQTT y procesa mensajes entrantes

  if (sistemaActivo)
  {
    // 1. Leer Sensores
    float temperatura = dht.readTemperature();
    float humedad = dht.readHumidity();
    int valorMQ135 = analogRead(PIN_MQ135);
    int valorMQ7 = analogRead(PIN_MQ7);

    // Ignorar lecturas si el DHT falla para no enviar basura a la nube
    if (isnan(temperatura) || isnan(humedad))
    {
      Serial.println("Esperando al DHT22...");
      delay(2000);
      return;
    }

    // 2. Crear el Objeto JSON
    StaticJsonDocument<256> doc;
    doc["zona"] = "Cocina-Principal";
    doc["temperatura_C"] = temperatura;
    doc["humedad_pct"] = humedad;
    doc["mq135_aire"] = valorMQ135;
    doc["mq7_co"] = valorMQ7;

    // 3. Serializar (Convertir JSON a Texto)
    char jsonBuffer[256];
    serializeJsonPretty(doc, jsonBuffer);

    // 4. Publicar en MQTT
    Serial.print("Enviando a la nube -> ");
    Serial.println(jsonBuffer);

    client.publish(topico_datos, jsonBuffer);
  }

  // Esperar 5 segundos (usamos un delay corto repetido para no bloquear la función de escucha)
  for (int i = 0; i < 50; i++)
  {
    client.loop();
    delay(100);
  }
}
