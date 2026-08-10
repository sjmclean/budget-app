#!/usr/bin/env sh
set -eu

LAN_ADDRESS="${1:-}"
if [ -z "$LAN_ADDRESS" ]; then
  echo "Usage: scripts/setup-dev-https.sh <LAN-IP-or-hostname>" >&2
  echo "Example: scripts/setup-dev-https.sh 192.168.1.246" >&2
  exit 2
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL is required. Install the openssl package and run this command again." >&2
  exit 1
fi

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CERTIFICATE_DIRECTORY="$REPOSITORY_ROOT/.certs"
CA_KEY="$CERTIFICATE_DIRECTORY/budget-app-dev-ca.key"
CA_CERTIFICATE="$CERTIFICATE_DIRECTORY/budget-app-dev-ca.crt"
SERVER_KEY="$CERTIFICATE_DIRECTORY/budget-app-dev.key"
SERVER_REQUEST="$CERTIFICATE_DIRECTORY/budget-app-dev.csr"
SERVER_CERTIFICATE="$CERTIFICATE_DIRECTORY/budget-app-dev.crt"
EXTENSIONS="$CERTIFICATE_DIRECTORY/budget-app-dev.ext"

mkdir -p "$CERTIFICATE_DIRECTORY"
chmod 700 "$CERTIFICATE_DIRECTORY"

if [ ! -f "$CA_KEY" ] || [ ! -f "$CA_CERTIFICATE" ]; then
  openssl genrsa -out "$CA_KEY" 3072
  chmod 600 "$CA_KEY"
  openssl req -x509 -new -sha256 \
    -key "$CA_KEY" \
    -days 3650 \
    -subj "/CN=Budget App Development CA" \
    -out "$CA_CERTIFICATE"
fi

openssl genrsa -out "$SERVER_KEY" 2048
chmod 600 "$SERVER_KEY"
openssl req -new \
  -key "$SERVER_KEY" \
  -subj "/CN=$LAN_ADDRESS" \
  -out "$SERVER_REQUEST"

case "$LAN_ADDRESS" in
  *[!0-9.]*)
    PRIMARY_SAN="DNS:$LAN_ADDRESS"
    ;;
  *)
    PRIMARY_SAN="IP:$LAN_ADDRESS"
    ;;
esac

cat > "$EXTENSIONS" <<EOF
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$PRIMARY_SAN,DNS:localhost,IP:127.0.0.1
EOF

openssl x509 -req -sha256 \
  -in "$SERVER_REQUEST" \
  -CA "$CA_CERTIFICATE" \
  -CAkey "$CA_KEY" \
  -CAcreateserial \
  -days 825 \
  -extfile "$EXTENSIONS" \
  -out "$SERVER_CERTIFICATE"

rm -f "$SERVER_REQUEST" "$EXTENSIONS"

echo
echo "Development HTTPS is configured for $LAN_ADDRESS."
echo "Restart pnpm dev, then open: https://$LAN_ADDRESS:5173/"
echo
echo "Install and explicitly trust this CA certificate on each test device:"
echo "  $CA_CERTIFICATE"
