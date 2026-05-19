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
  limpio TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_device_id (device_id),
  INDEX idx_timestamp_origen (timestamp_origen),
  INDEX idx_created_at (created_at),
  INDEX idx_temperatura_c (temperatura_c),
  INDEX idx_mq135_aire (mq135_aire),
  INDEX idx_limpio (limpio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mediciones_limpias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medicion_id BIGINT UNSIGNED NOT NULL,
  temperatura_c DECIMAL(6,2) NULL,
  mq135_aire INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_limpia_medicion (medicion_id),
  INDEX idx_limpia_medicion (medicion_id),
  CONSTRAINT fk_limpia_medicion
    FOREIGN KEY (medicion_id) REFERENCES mediciones_brutas(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_limpia_temperatura_no_cero
    CHECK (temperatura_c IS NULL OR temperatura_c <> 0),
  CONSTRAINT chk_limpia_mq135_no_cero
    CHECK (mq135_aire IS NULL OR mq135_aire <> 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS incidencias (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  medicion_id BIGINT UNSIGNED NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  zona VARCHAR(120) NOT NULL,
  tipo_incidencia VARCHAR(20) NOT NULL,
  detalle_incidencia VARCHAR(255) NOT NULL,
  valor_detectado JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_inc_medicion (medicion_id),
  INDEX idx_inc_device_id (device_id),
  INDEX idx_inc_tipo (tipo_incidencia),
  INDEX idx_inc_created_at (created_at),
  CONSTRAINT fk_incidencias_medicion
    FOREIGN KEY (medicion_id) REFERENCES mediciones_brutas(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_incidencias_tipo
    CHECK (tipo_incidencia IN ('OK', 'OBSERVADO', 'ERROR', 'DUPLICADO', 'MULTIPLE', 'INCOMPLETO', 'TEMPORAL', 'FORMATO', 'ATIPICO'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS analisis_mediciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id VARCHAR(100) NOT NULL,
  zona VARCHAR(120) NOT NULL,
  periodo_dias INT NOT NULL,
  total_registros INT NOT NULL,
  fecha_inicio_analisis DATETIME NOT NULL,
  fecha_fin_analisis DATETIME NOT NULL,
  fecha_generacion DATETIME NOT NULL,
  temp_promedio FLOAT NULL,
  temp_mediana FLOAT NULL,
  temp_moda FLOAT NULL,
  temp_minima FLOAT NULL,
  temp_maxima FLOAT NULL,
  temp_rango FLOAT NULL,
  temp_stddev FLOAT NULL,
  temp_varianza FLOAT NULL,
  temp_fuera_rango INT NULL,
  temp_anomalias INT NULL,
  mq135_promedio FLOAT NULL,
  mq135_mediana FLOAT NULL,
  mq135_moda FLOAT NULL,
  mq135_minima FLOAT NULL,
  mq135_maxima FLOAT NULL,
  mq135_rango FLOAT NULL,
  mq135_stddev FLOAT NULL,
  mq135_varianza FLOAT NULL,
  mq135_fuera_rango INT NULL,
  mq135_anomalias INT NULL,
  corr_temp_mq135 FLOAT NULL,
  distribucion_categorias JSON NULL,
  patrones_temporales JSON NULL,
  relaciones_variables JSON NULL,
  comparacion_periodos JSON NULL,
  justificacion_analisis JSON NULL,
  limitaciones JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_analisis_device_id (device_id),
  INDEX idx_analisis_zona (zona),
  INDEX idx_analisis_created_at (created_at)
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
  DELETE FROM analisis_mediciones;
  DELETE FROM eventos_actuadores;
  DELETE FROM estados_medicion;
  DELETE FROM incidencias;
  DELETE FROM mediciones_limpias;
  DELETE FROM mediciones_brutas;
END$$
DELIMITER ;
