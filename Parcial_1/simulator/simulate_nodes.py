import os
import sys
import json
import time
import random
import signal
import socket
import threading
from datetime import datetime
from typing import Optional

import paho.mqtt.client as mqtt
from paho.mqtt.enums import CallbackAPIVersion


# --- config from environment ---
MQTT_SERVER = os.environ.get("MQTT_SERVER", "maqiatto.com")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER", "")
MQTT_PASS = os.environ.get("MQTT_PASS", "")
TOPICO_DATOS = os.environ.get("TOPICO_DATOS", "usuario/alertas")
TOPICO_COMANDOS = os.environ.get("TOPICO_COMANDOS", "usuario/comandos")
SIM_QOS = int(os.environ.get("SIM_QOS", "1"))

SIM_DEVICE_ID = os.environ.get("SIM_DEVICE_ID", f"SIM-{socket.gethostname() or 'NODO'}")
SIM_ZONA = os.environ.get("SIM_ZONA", "Cocina-Simulada-02")

SIM_TEMP_MIN = float(os.environ.get("SIM_TEMP_MIN", "20"))
SIM_TEMP_MAX = float(os.environ.get("SIM_TEMP_MAX", "35"))
SIM_MQ135_MIN = int(os.environ.get("SIM_MQ135_MIN", "100"))
SIM_MQ135_MAX = int(os.environ.get("SIM_MQ135_MAX", "3500"))

SIM_MISSING_PROB = float(os.environ.get("SIM_MISSING_PROB", "0.005"))
SIM_OUTLIER_PROB = float(os.environ.get("SIM_OUTLIER_PROB", "0.005"))
SIM_DUP_PROB = float(os.environ.get("SIM_DUP_PROB", "0.02"))
SIM_GAP_PROB = float(os.environ.get("SIM_GAP_PROB", "0.01"))
SIM_GAP_SECONDS = float(os.environ.get("SIM_GAP_SECONDS", "35"))

UMBRAL_TEMP = float(os.environ.get("UMBRAL_TEMP", "28.0"))
UMBRAL_GAS = int(os.environ.get("UMBRAL_GAS", "3600"))


# --- actuator logic (mirrors ESP32 procesar estados) ---
def calcular_estado(temperatura: float, gas: int) -> dict:
    temperatura_alta = temperatura >= UMBRAL_TEMP
    gas_alto = gas >= UMBRAL_GAS

    if temperatura_alta:
        if gas_alto:
            return {
                "estado": "EMERGENCIA",
                "detalle": "Temperatura y gas altos",
                "motivo": "Activacion por temperatura y gas altos",
                "actuadores": {
                    "led": "ROJO",
                    "extractor": "ENCENDIDO",
                    "sirena": "ENCENDIDA",
                    "valvula_gas": "CERRADA"
                }
            }
        else:
            return {
                "estado": "ALERTA",
                "detalle": "Temperatura alta",
                "motivo": "Activacion por temperatura fuera de rango",
                "actuadores": {
                    "led": "AMARILLO",
                    "extractor": "ENCENDIDO",
                    "sirena": "APAGADA",
                    "valvula_gas": "ABIERTA"
                }
            }

    if gas_alto:
        return {
            "estado": "ALERTA",
            "detalle": "Gas alto",
            "motivo": "Activacion por nivel de gas alto",
            "actuadores": {
                "led": "AMARILLO",
                "extractor": "ENCENDIDO",
                "sirena": "APAGADA",
                "valvula_gas": "ABIERTA"
            }
        }

    return {
        "estado": "NORMAL",
        "detalle": "Parametros dentro de rango",
        "motivo": "Sin eventos",
        "actuadores": {
            "led": "VERDE",
            "extractor": "APAGADO",
            "sirena": "APAGADA",
            "valvula_gas": "ABIERTA"
        }
    }


# --- globals (from env, fallback to 10/6/3s) ---
NORMAL_INTERVAL_MS = int(os.environ.get("INTERVALO_NORMAL_SEG", "10")) * 1000
ALERTA_INTERVAL_MS = int(os.environ.get("INTERVALO_ALERTA_SEG", "6")) * 1000
EMERGENCIA_INTERVAL_MS = int(os.environ.get("INTERVALO_EMERGENCIA_SEG", "3")) * 1000
intervalo_envio_ms = NORMAL_INTERVAL_MS
last_payload: Optional[dict] = None
running = True
lock = threading.Lock()
ultimo_estado: Optional[str] = None


def build_payload() -> dict:
    global last_payload

    if random.random() < SIM_DUP_PROB and last_payload is not None:
        return dict(last_payload)

    temp = round(random.uniform(SIM_TEMP_MIN, SIM_TEMP_MAX), 2)
    gas = random.randint(SIM_MQ135_MIN, SIM_MQ135_MAX)

    if temp >= UMBRAL_TEMP or random.random() < 0.2:
        gas = random.randint(2500, 4095)

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    payload: dict = {
        "device_id": SIM_DEVICE_ID,
        "zona": SIM_ZONA,
        "temperatura_C": temp,
        "mq135_aire": gas,
        "timestamp": ts,
    }

    if random.random() < SIM_MISSING_PROB:
        keys_to_drop = ["temperatura_C", "mq135_aire"]
        drop_key = random.choice(keys_to_drop)
        payload.pop(drop_key, None)

    if random.random() < SIM_OUTLIER_PROB:
        payload["temperatura_C"] = 120.0
        payload["mq135_aire"] = 9999

    last_payload = dict(payload)
    return payload


def anotar_payload(payload: dict) -> dict:
    temp = payload.get("temperatura_C")
    gas = payload.get("mq135_aire")
    if temp is not None and gas is not None:
        try:
            si = calcular_estado(float(temp), int(gas))
        except (ValueError, TypeError):
            return payload
        payload["estado_riesgo"] = si["estado"]
        payload["detalle_estado"] = si["detalle"]
        payload["motivo_actuadores"] = si["motivo"]
        payload["actuadores"] = si["actuadores"]
    return payload


def resumir_actuadores(act: dict) -> str:
    if not act:
        return "N/A"
    return f"LED={act.get('led','?')} Extractor={act.get('extractor','?')} Sirena={act.get('sirena','?')} Valvula={act.get('valvula_gas','?')}"


# --- MQTT callbacks ---
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[sim] connected to {MQTT_SERVER}:{MQTT_PORT}")
        client.subscribe(TOPICO_COMANDOS, qos=SIM_QOS)
    else:
        print(f"[sim] connection failed rc={rc}")


def on_message(client, userdata, msg):
    global intervalo_envio_ms
    try:
        payload_str = msg.payload.decode("utf-8").strip()
        cmd = json.loads(payload_str)
    except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
        return

    target = cmd.get("device_id")
    if target and target != SIM_DEVICE_ID:
        return

    intervaloSeg = cmd.get("intervalo_seg")
    if intervaloSeg is not None:
        val = max(1, min(60, int(intervaloSeg)))
        with lock:
            intervalo_envio_ms = val * 1000
        print(f"[sim] intervalo actualizado: {val}s")

    estado = cmd.get("estado")
    if estado:
        print(f"[sim] comando estado={estado}")


def on_disconnect(client, userdata, rc):
    print(f"[sim] disconnected rc={rc}")


# --- main loop ---
def main():
    global running, intervalo_envio_ms, ultimo_estado

    client_id = f"sim-{SIM_DEVICE_ID}-{int(time.time())}"

    client = mqtt.Client(CallbackAPIVersion.VERSION1, client_id)
    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    if MQTT_USER:
        client.username_pw_set(MQTT_USER, MQTT_PASS)

    try:
        client.connect(MQTT_SERVER, MQTT_PORT, keepalive=60)
    except Exception as e:
        print(f"[sim] connection error: {e}", file=sys.stderr)
        sys.exit(1)

    client.loop_start()

    signal.signal(signal.SIGTERM, lambda *_: setattr(sys.modules[__name__], "running", False))

    print(f"[sim] starting device={SIM_DEVICE_ID} zona={SIM_ZONA}")
    print(f"[sim] publish to {TOPICO_DATOS} every {intervalo_envio_ms}ms")
    print(f"[sim] subscribe to {TOPICO_COMANDOS}")

    while running:
        with lock:
            interval = intervalo_envio_ms

        payload = build_payload()
        payload = anotar_payload(payload)
        ultimo_estado = payload.get("estado_riesgo")

        # Adjust interval by risk state
        if ultimo_estado == "EMERGENCIA":
            with lock:
                intervalo_envio_ms = EMERGENCIA_INTERVAL_MS
        elif ultimo_estado == "ALERTA":
            with lock:
                intervalo_envio_ms = ALERTA_INTERVAL_MS
        else:
            with lock:
                intervalo_envio_ms = NORMAL_INTERVAL_MS

        payload_json = json.dumps(payload)
        client.publish(TOPICO_DATOS, payload_json, qos=SIM_QOS)

        ts = payload.get("timestamp", "?")
        temp = payload.get("temperatura_C", "N/A")
        gas = payload.get("mq135_aire", "N/A")
        estado = payload.get("estado_riesgo", "?")
        act_str = resumir_actuadores(payload.get("actuadores"))

        print(f"[sim] -> {TOPICO_DATOS} temp={temp} gas={gas} estado={estado} | {act_str} @ {ts}")

        if random.random() < SIM_GAP_PROB:
            extra = SIM_GAP_SECONDS
            print(f"[sim] gap of {extra}s")
            for _ in range(int(extra)):
                if not running:
                    break
                time.sleep(1)
            continue

        sleep_sec = max(0.1, interval / 1000.0)
        steps = max(1, int(sleep_sec))
        for _ in range(steps):
            if not running:
                break
            time.sleep(1.0)

    client.loop_stop()
    client.disconnect()
    print("[sim] stopped")


if __name__ == "__main__":
    main()
