#!/usr/bin/env bash
# Genera un certificado SSL self-signed para Cátodo (necesario para que
# getDisplayMedia / compartir pantalla funcione en /cast, que requiere HTTPS).
set -euo pipefail

DATA_DIR="${CATODO_DATA_DIR:-$HOME/.local/share/catodo}"
SSL_DIR="$DATA_DIR/ssl"
mkdir -p "$SSL_DIR"

if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    echo "Certificado ya existe en $SSL_DIR"
    exit 0
fi

# CN y SAN con IP de la máquina para reducir avisos.
# hostname -I no es portable (BusyBox/BSD), usamos ip como fallback.
IP=$(ip -4 addr show 2>/dev/null \
    | grep -oP 'inet \K[\d.]+' \
    | grep -v '^127\.' | head -1) || true
SAN="DNS:localhost,IP:127.0.0.1"
[ -n "$IP" ] && SAN="$SAN,IP:$IP"

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" \
    -subj "/CN=catodo" \
    -addext "subjectAltName=$SAN" >/dev/null 2>&1

echo "Certificado generado en $SSL_DIR"
echo "Reiniciá el backend y lanzá la app con CATODO_SSL=1"
