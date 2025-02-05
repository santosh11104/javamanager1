#!/bin/bash

tomcatDir="/opt/tomcat"
tomcatUrl="https://dlcdn.apache.org/tomcat/tomcat-10/v10.1.34/bin/apache-tomcat-10.1.34.tar.gz"
tomcatServiceName="tomcat10"

sudo systemctl stop "$tomcatServiceName" || true

set -e

# Create the tomcat user and group if they don't exist
if ! getent group tomcat > /dev/null; then
    sudo addgroup tomcat
fi
if ! getent passwd tomcat > /dev/null; then
    sudo adduser --ingroup tomcat --disabled-password --gecos "" tomcat
fi

# Create the Tomcat directory (and parent directories if necessary)
sudo mkdir -p "$tomcatDir"

cd /tmp

# Download the file (as the user running the script)
wget "$tomcatUrl"

# Check if the download was successful (using stat)
if ! stat -c '%s' apache-tomcat-10.1.34.tar.gz > /dev/null 2>&1; then
  echo "Tomcat archive download failed." >&2
  exit 1
fi

# Change ownership to root (explicitly)
sudo chown root:root apache-tomcat-10.1.34.tar.gz

# Extract the archive (as root) - use absolute path and specify the archive name
sudo tar -xzf /tmp/apache-tomcat-10.1.34.tar.gz -C "$tomcatDir" --strip-components=1

# Set ownership and permissions on the Tomcat directory (as root)
sudo chown -R tomcat:tomcat "$tomcatDir"
sudo chmod +x "$tomcatDir"/bin/*.sh

# Create symbolic link (as root)
sudo ln -sf "$tomcatDir" /opt/tomcat

exit 0