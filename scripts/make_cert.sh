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
# hostname -I es lo más portable; fallback a ip -4 (iproute2) si no existe.
if command -v hostname >/dev/null 2>&1; then
    IP="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^127\.' | head -1 || true)"
fi
if [ -z "$IP" ] && command -v ip >/dev/null 2>&1; then
    IP="$(ip -4 addr show 2>/dev/null \
        | sed -n 's/.*inet \([0-9.]*\).*/\1/p' \
        | grep -v '^127\.' | head -1 || true)"
fi
SAN="DNS:localhost,IP:127.0.0.1"
[ -n "$IP" ] && SAN="$SAN,IP:$IP"

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" \
    -subj "/CN=catodo" \
    -addext "subjectAltName=$SAN" >/dev/null 2>&1

echo "Certificado generado en $SSL_DIR"
echo "Reiniciá el backend y lanzá la app con CATODO_SSL=1"
