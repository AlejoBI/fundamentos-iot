import os
import sys
import json
import time
import random
import signal
import socket
import threading
from datetime import datetime, timezone
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

SIM_MISSING_PROB = float(os.environ.get("SIM_MISSING_PROB", "0.05"))
SIM_OUTLIER_PROB = float(os.environ.get("SIM_OUTLIER_PROB", "0.04"))
SIM_DUP_PROB = float(os.environ.get("SIM_DUP_PROB", "0.02"))
SIM_GAP_PROB = float(os.environ.get("SIM_GAP_PROB", "0.01"))
SIM_GAP_SECONDS = float(os.environ.get("SIM_GAP_SECONDS", "35"))


# --- globals ---
intervalo_envio_ms = 5000  # default 5s (matches ESP32 PUBLISH_INTERVAL_DEFAULT_MS)
last_payload: Optional[dict] = None
running = True
lock = threading.Lock()


def build_payload() -> dict:
    global last_payload

    if random.random() < SIM_DUP_PROB and last_payload is not None:
        return dict(last_payload)

    temp = round(random.uniform(SIM_TEMP_MIN, SIM_TEMP_MAX), 2)
    gas = random.randint(SIM_MQ135_MIN, SIM_MQ135_MAX)

    # alert simulation: high gas when temp >= 28 or random chance (matches firmware UMBRAL_TEMP=28)
    if temp >= 28.0 or random.random() < 0.2:
        gas = random.randint(2500, 4095)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

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

    # handle intervalo_seg (matches firmware command format)
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
    global running, intervalo_envio_ms

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
        payload_json = json.dumps(payload)
        client.publish(TOPICO_DATOS, payload_json, qos=SIM_QOS)

        ts = payload.get("timestamp", "?")
        temp = payload.get("temperatura_C", "N/A")
        gas = payload.get("mq135_aire", "N/A")
        print(f"[sim] -> {TOPICO_DATOS} temp={temp} gas={gas} @ {ts}")

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
