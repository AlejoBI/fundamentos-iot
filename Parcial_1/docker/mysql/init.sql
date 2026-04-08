CREATE DATABASE IF NOT EXISTS iot_db;
USE iot_db;

DROP TABLE IF EXISTS alertas_eventos;
DROP TABLE IF EXISTS mediciones;
DROP TABLE IF EXISTS eventos_actuadores;

CREATE TABLE IF NOT EXISTS mediciones_brutas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id VARCHAR(100) NOT NULL,
  zona VARCHAR(120) NOT NULL,
  temperatura_c DECIMAL(6,2) NOT NULL,
  mq135_aire INT NOT NULL,
  timestamp_origen DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_device_id (device_id),
  INDEX idx_timestamp_origen (timestamp_origen),
  INDEX idx_created_at (created_at),
  INDEX idx_temperatura_c (temperatura_c),
  INDEX idx_mq135_aire (mq135_aire)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS estados_medicion (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medicion_id BIGINT UNSIGNED NOT NULL,
  estado_riesgo VARCHAR(20) NOT NULL,
  detalle_estado VARCHAR(255) NULL,
  tiempo_espera_seg DECIMAL(8,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_estados_medicion_medicion (medicion_id),
  INDEX idx_estado_riesgo (estado_riesgo),
  INDEX idx_created_at (created_at),
  CONSTRAINT fk_estados_medicion_medicion
    FOREIGN KEY (medicion_id) REFERENCES mediciones_brutas(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_estado_riesgo
    CHECK (estado_riesgo IN ('NORMAL', 'ALERTA', 'EMERGENCIA', 'INVALIDO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS eventos_actuadores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medicion_id BIGINT UNSIGNED NULL,
  device_id VARCHAR(100) NOT NULL,
  estado_riesgo VARCHAR(20) NOT NULL,
  motivo_activacion VARCHAR(255) NOT NULL,
  historial_reciente VARCHAR(255) NULL,
  led_estado VARCHAR(20) NOT NULL,
  extractor_estado VARCHAR(20) NOT NULL,
  sirena_estado VARCHAR(20) NOT NULL,
  valvula_gas_estado VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_eventos_device_id (device_id),
  INDEX idx_eventos_estado_riesgo (estado_riesgo),
  INDEX idx_eventos_created_at (created_at),
  CONSTRAINT fk_eventos_actuadores_medicion
    FOREIGN KEY (medicion_id) REFERENCES mediciones_brutas(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_eventos_estado_riesgo
    CHECK (estado_riesgo IN ('NORMAL', 'ALERTA', 'EMERGENCIA', 'INVALIDO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP VIEW IF EXISTS vw_mediciones_estado;

DROP PROCEDURE IF EXISTS sp_limpiar_datos_iot;

DELIMITER $$
CREATE PROCEDURE sp_limpiar_datos_iot()
BEGIN
  DELETE FROM eventos_actuadores;
  DELETE FROM estados_medicion;
  DELETE FROM mediciones_brutas;
END$$
DELIMITER ;
