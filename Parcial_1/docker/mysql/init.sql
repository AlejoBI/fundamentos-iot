CREATE DATABASE IF NOT EXISTS iot_db;
USE iot_db;

CREATE TABLE IF NOT EXISTS mediciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  device_id VARCHAR(100) NOT NULL,
  zona VARCHAR(120) NOT NULL,
  temperatura_c DECIMAL(6,2) NOT NULL,
  mq135_aire INT NOT NULL,
  estado_riesgo VARCHAR(20) NOT NULL,
  timestamp_origen DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_created_at (created_at),
  INDEX idx_estado_riesgo (estado_riesgo),
  INDEX idx_device_id (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
