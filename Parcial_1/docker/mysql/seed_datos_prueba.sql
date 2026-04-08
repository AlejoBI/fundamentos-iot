USE iot_db;

CALL sp_limpiar_datos_iot();

ALTER TABLE eventos_actuadores AUTO_INCREMENT = 1;
ALTER TABLE estados_medicion AUTO_INCREMENT = 1;
ALTER TABLE mediciones_brutas AUTO_INCREMENT = 1;

INSERT INTO mediciones_brutas (device_id, zona, temperatura_c, mq135_aire, timestamp_origen)
WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 20
),
cocinas AS (
  SELECT 1 AS cocina
  UNION ALL SELECT 2
  UNION ALL SELECT 3
)
SELECT
  CONCAT('ESP32-Cocina-', LPAD(c.cocina, 2, '0')) AS device_id,
  CONCAT('Cocina-', LPAD(c.cocina, 2, '0')) AS zona,
  ROUND(23.5 + (((s.n * 13 + c.cocina * 7) % 12) * 0.8), 2) AS temperatura_c,
  1600 + ((s.n * 211 + c.cocina * 157) % 3300) AS mq135_aire,
  DATE_ADD('2026-04-08 10:00:00', INTERVAL ((c.cocina - 1) * 20 + (s.n - 1)) MINUTE) AS timestamp_origen
FROM cocinas c
CROSS JOIN seq s
ORDER BY c.cocina, s.n;

INSERT INTO estados_medicion (medicion_id, estado_riesgo, detalle_estado, tiempo_espera_seg)
SELECT
  m.id,
  CASE
    WHEN m.temperatura_c >= 28 AND m.mq135_aire >= 3600 THEN 'EMERGENCIA'
    WHEN m.temperatura_c >= 28 OR m.mq135_aire >= 3600 THEN 'ALERTA'
    ELSE 'NORMAL'
  END AS estado_riesgo,
  CASE
    WHEN m.temperatura_c >= 28 AND m.mq135_aire >= 3600 THEN 'Temperatura y gas altos'
    WHEN m.temperatura_c >= 28 OR m.mq135_aire >= 3600 THEN 'Temperatura o gas alto'
    ELSE 'Valores dentro de rango'
  END AS detalle_estado,
  CASE
    WHEN m.temperatura_c >= 28 AND m.mq135_aire >= 3600 THEN 1.00
    WHEN m.temperatura_c >= 28 OR m.mq135_aire >= 3600 THEN 3.00
    ELSE 6.00
  END AS tiempo_espera_seg
FROM mediciones_brutas m
ORDER BY m.id;

INSERT INTO eventos_actuadores (
  medicion_id,
  device_id,
  estado_riesgo,
  motivo_activacion,
  historial_reciente,
  led_estado,
  extractor_estado,
  sirena_estado,
  valvula_gas_estado
)
SELECT
  m.id AS medicion_id,
  m.device_id,
  s.estado_riesgo,
  CASE s.estado_riesgo
    WHEN 'EMERGENCIA' THEN 'Activacion por temperatura y gas altos'
    WHEN 'ALERTA' THEN 'Activacion por variable fuera de rango'
    ELSE 'Sin activacion, condiciones normales'
  END AS motivo_activacion,
  CONCAT_WS(
    '>',
    LAG(s.estado_riesgo, 3) OVER (PARTITION BY m.device_id ORDER BY m.id),
    LAG(s.estado_riesgo, 2) OVER (PARTITION BY m.device_id ORDER BY m.id),
    LAG(s.estado_riesgo, 1) OVER (PARTITION BY m.device_id ORDER BY m.id),
    s.estado_riesgo
  ) AS historial_reciente,
  CASE s.estado_riesgo
    WHEN 'EMERGENCIA' THEN 'ROJO'
    WHEN 'ALERTA' THEN 'AMARILLO'
    ELSE 'VERDE'
  END AS led_estado,
  CASE s.estado_riesgo
    WHEN 'NORMAL' THEN 'APAGADO'
    ELSE 'ENCENDIDO'
  END AS extractor_estado,
  CASE s.estado_riesgo
    WHEN 'EMERGENCIA' THEN 'ENCENDIDA'
    ELSE 'APAGADA'
  END AS sirena_estado,
  CASE s.estado_riesgo
    WHEN 'EMERGENCIA' THEN 'CERRADA'
    ELSE 'ABIERTA'
  END AS valvula_gas_estado
FROM mediciones_brutas m
INNER JOIN estados_medicion s ON s.medicion_id = m.id
ORDER BY m.id;

SELECT zona, COUNT(*) AS total_por_cocina
FROM mediciones_brutas
GROUP BY zona
ORDER BY zona;
