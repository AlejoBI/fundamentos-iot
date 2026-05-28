CREATE DATABASE IF NOT EXISTS iot_db;
USE iot_db;

-- Allow API container (any Docker host) to connect
CREATE USER IF NOT EXISTS 'iot_user'@'%' IDENTIFIED BY 'iot_pass';
GRANT ALL PRIVILEGES ON iot_db.* TO 'iot_user'@'%';
FLUSH PRIVILEGES;

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

CREATE OR REPLACE VIEW vw_mediciones_estado AS
SELECT m.id, m.device_id, m.zona, m.temperatura_c, m.mq135_aire,
       m.timestamp_origen, m.limpio,
       e.estado_riesgo, e.detalle_estado, e.tiempo_espera_seg
FROM mediciones_brutas m
LEFT JOIN estados_medicion e ON e.medicion_id = m.id;

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

DROP PROCEDURE IF EXISTS sp_limpiar_lote;
DELIMITER $$
CREATE PROCEDURE sp_limpiar_lote(IN batch_size INT)
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE v_id BIGINT UNSIGNED;
  DECLARE v_device_id VARCHAR(100);
  DECLARE v_zona VARCHAR(120);
  DECLARE v_temp DECIMAL(6,2);
  DECLARE v_mq135 INT;
  DECLARE v_ts DATETIME;
  DECLARE problematic_count INT DEFAULT 0;
  DECLARE v_temp_bad BOOLEAN DEFAULT FALSE;
  DECLARE v_mq135_bad BOOLEAN DEFAULT FALSE;
  DECLARE avg_temp DECIMAL(6,2) DEFAULT NULL;
  DECLARE avg_mq135 INT DEFAULT NULL;
  DECLARE final_temp DECIMAL(6,2) DEFAULT NULL;
  DECLARE final_mq135 INT DEFAULT NULL;

  DECLARE cur CURSOR FOR
    SELECT id, device_id, zona, temperatura_c, mq135_aire, timestamp_origen
    FROM mediciones_brutas
    WHERE limpio = 0
    ORDER BY id ASC
    LIMIT batch_size;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;

  read_loop: LOOP
    FETCH cur INTO v_id, v_device_id, v_zona, v_temp, v_mq135, v_ts;
    IF done THEN
      LEAVE read_loop;
    END IF;

    SET problematic_count = 0;
    SET v_temp_bad = (v_temp IS NULL OR v_temp = 0 OR v_temp < 0);
    SET v_mq135_bad = (v_mq135 IS NULL OR v_mq135 = 0 OR v_mq135 < 0);
    IF v_temp_bad THEN SET problematic_count = problematic_count + 1; END IF;
    IF v_mq135_bad THEN SET problematic_count = problematic_count + 1; END IF;

    IF problematic_count >= 2 THEN
      INSERT INTO incidencias (medicion_id, device_id, zona, tipo_incidencia, detalle_incidencia, valor_detectado)
      VALUES (v_id, v_device_id, v_zona, 'OBSERVADO',
              CONCAT('Valores invalidos, solo incidencia: temp=', COALESCE(v_temp, 'NULL'), ', mq135=', COALESCE(v_mq135, 'NULL')),
              JSON_OBJECT('temperatura_c', v_temp, 'mq135_aire', v_mq135));
    ELSE
      SET final_temp = IF(v_temp_bad, NULL, v_temp);
      SET final_mq135 = IF(v_mq135_bad, NULL, v_mq135);

      IF v_temp_bad THEN
        SELECT AVG(l.temperatura_c) INTO avg_temp
        FROM mediciones_limpias l
        INNER JOIN mediciones_brutas b ON b.id = l.medicion_id
        WHERE b.device_id = v_device_id AND l.temperatura_c IS NOT NULL
        ORDER BY l.id DESC LIMIT 5;
        SET final_temp = COALESCE(avg_temp, 25.0);
      END IF;

      IF v_mq135_bad THEN
        SELECT AVG(l.mq135_aire) INTO avg_mq135
        FROM mediciones_limpias l
        INNER JOIN mediciones_brutas b ON b.id = l.medicion_id
        WHERE b.device_id = v_device_id AND l.mq135_aire IS NOT NULL
        ORDER BY l.id DESC LIMIT 5;
        SET final_mq135 = COALESCE(avg_mq135, 500);
      END IF;

      INSERT INTO mediciones_limpias (medicion_id, temperatura_c, mq135_aire)
      VALUES (v_id, final_temp, final_mq135);

      IF problematic_count = 1 THEN
        INSERT INTO incidencias (medicion_id, device_id, zona, tipo_incidencia, detalle_incidencia, valor_detectado)
        VALUES (v_id, v_device_id, v_zona, 'OBSERVADO',
                CONCAT('Valor imputado con media: temp=', v_temp, '->', final_temp, ', mq135=', v_mq135, '->', final_mq135),
                JSON_OBJECT('temperatura_c_original', v_temp, 'mq135_aire_original', v_mq135,
                            'temperatura_c_imputado', final_temp, 'mq135_aire_imputado', final_mq135));
      END IF;
    END IF;

    UPDATE mediciones_brutas SET limpio = 1 WHERE id = v_id;
  END LOOP;

  CLOSE cur;
END$$
DELIMITER ;
