#!/bin/bash

TOMCAT_VERSION="10.1.34"  # Modify this dynamically in the upgrade script
TOMCAT_DIR="/opt/tomcat"
TOMCAT_URL="https://dlcdn.apache.org/tomcat/tomcat-10/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz"
TOMCAT_SERVICE_NAME="tomcat10"

echo "Stopping any existing Tomcat service..."
sudo systemctl stop tomcat9 || true
sudo systemctl stop tomcat10 || true

set -e  # Exit on error

# Remove old Tomcat installations
sudo rm -rf "$TOMCAT_DIR"

echo "Downloading Tomcat $TOMCAT_VERSION..."
cd /tmp
wget -q "$TOMCAT_URL" -O tomcat.tar.gz

if [ $? -ne 0 ]; then
  echo "Failed to download Tomcat archive."
  exit 1
fi

echo "Extracting Tomcat..."
sudo mkdir -p "$TOMCAT_DIR"
sudo tar -xzf tomcat.tar.gz -C "$TOMCAT_DIR" --strip-components=1
rm -f tomcat.tar.gz

echo "Setting up Tomcat user and permissions..."
sudo adduser --system --no-create-home --group tomcat || true
sudo chown -R tomcat:tomcat "$TOMCAT_DIR"
sudo chmod +x "$TOMCAT_DIR"/bin/*.sh

echo "Tomcat $TOMCAT_VERSION installed successfully."
exit 0
