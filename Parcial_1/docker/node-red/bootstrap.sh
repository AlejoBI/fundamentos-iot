#!/bin/sh
set -e

SETTINGS_FILE="/data/settings.js"
CRED_FILE="/data/flows_cred.json"

: "${MQTT_USER:?MQTT_USER is required}"
: "${MQTT_PASS:?MQTT_PASS is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"

MQTT_USER_VALUE="${MQTT_USER}"
MQTT_PASS_VALUE="${MQTT_PASS}"
MYSQL_USER_VALUE="${MYSQL_USER}"
MYSQL_PASS_VALUE="${MYSQL_PASSWORD}"

if [ -f "$SETTINGS_FILE" ]; then
    sed -i 's#//credentialSecret: "a-secret-key",#credentialSecret: false,#' "$SETTINGS_FILE" || true
fi

if [ ! -f "$CRED_FILE" ] || grep -q '"\$"' "$CRED_FILE"; then
    cat > "$CRED_FILE" <<EOF
{
  "fd407c03c80b70fc": {
    "user": "$MQTT_USER_VALUE",
    "password": "$MQTT_PASS_VALUE"
  },
  "e573d97058b2f511": {
    "user": "$MYSQL_USER_VALUE",
    "password": "$MYSQL_PASS_VALUE"
  }
}
EOF
fi

exec /usr/src/node-red/entrypoint.sh
