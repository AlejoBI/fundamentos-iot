#include <Arduino.h>
#include <DHT.h>
#include <ArduinoJson.h>

// Definir pines
#define DHTPIN 33      // Pin del DHT22
#define DHTTYPE DHT22 // Tipo de sensor DHT
#define PIN_MQ135 34  // Pin analógico MQ-135
#define PIN_MQ7 35    // Pin analógico MQ-7

// Inicializar el sensor DHT
DHT dht(DHTPIN, DHTTYPE);

void setup()
{
  // Iniciar comunicación serial a la velocidad configurada
  Serial.begin(115200);
  Serial.println("Iniciando Sistema de Monitoreo...");

  // Iniciar sensor de temperatura
  dht.begin();

  // Darle un par de segundos a los sensores MQ para calentar un poco
  delay(2000);
}

void loop()
{
  // 1. Leer Sensores
  float temperatura = dht.readTemperature();
  float humedad = dht.readHumidity();
  int valorMQ135 = analogRead(PIN_MQ135); // Lee de 0 a 4095 en la ESP32
  int valorMQ7 = analogRead(PIN_MQ7);

  // Validar que el DHT no de error
  if (isnan(temperatura) || isnan(humedad))
  {
    Serial.println("¡Error leyendo el sensor DHT22!");
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

  // 3. Imprimir el JSON en el Monitor Serial
  serializeJsonPretty(doc, Serial);
  Serial.println(); // Salto de línea para separar lecturas

  // Esperar 3 segundos antes de la siguiente lectura
  delay(3000);
}