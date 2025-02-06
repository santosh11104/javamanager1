const { exec } = require("child_process");

// Function to install Java and set JAVA_HOME
async function installJava() {
  return new Promise((resolve, reject) => {
    exec(
      "sudo apt update && sudo apt install -y openjdk-17-jdk",
      (error, stdout, stderr) => {
        if (error) {
          reject(`Java installation failed: ${stderr}`);
        } else {
          console.log(`Java installed successfully: ${stdout}`);

          // Set JAVA_HOME globally
          const javaHomeCmd = `
          echo 'JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"' | sudo tee /etc/environment &&
          echo 'export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"' | sudo tee -a /etc/profile &&
          echo 'export PATH=$JAVA_HOME/bin:$PATH' | sudo tee -a /etc/profile
        `;

          exec(javaHomeCmd, (err) => {
            if (err) {
              reject("Failed to set JAVA_HOME");
            } else {
              console.log("JAVA_HOME set successfully!");
              resolve();
            }
          });
        }
      }
    );
  });
}

// Function to install and configure Tomcat 9

const fs = require("fs");

async function installTomcat() {
  return new Promise((resolve, reject) => {
    console.log("🚀 Installing Tomcat 9.0.98...");

    const TOMCAT_VERSION = "9.0.98";
    const TOMCAT_URL = `https://dlcdn.apache.org/tomcat/tomcat-9/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz`;
    const TOMCAT_DIR = "/opt/tomcat9";
    const SERVICE_FILE_PATH = "/etc/systemd/system/tomcat9.service";

    const commands = [
      "sudo apt update",
      "sudo apt install -y default-jdk wget", // Ensure JDK & wget are installed
      "sudo systemctl stop tomcat9 || true",
      `sudo rm -rf ${TOMCAT_DIR}`, // Remove previous Tomcat installations
      `sudo mkdir -p ${TOMCAT_DIR}`, // Create Tomcat directory
      `cd /tmp && wget -q ${TOMCAT_URL} -O tomcat.tar.gz`, // Download Tomcat
      `sudo tar -xzf /tmp/tomcat.tar.gz -C ${TOMCAT_DIR} --strip-components=1`, // Extract
      "rm -f /tmp/tomcat.tar.gz", // Cleanup
      "sudo adduser --system --no-create-home --group tomcat || true", // Ensure tomcat user
      `sudo chown -R tomcat:tomcat ${TOMCAT_DIR}`,
      `sudo chmod -R 755 ${TOMCAT_DIR}`,
      `sudo chmod -R +x ${TOMCAT_DIR}/bin/*.sh`, // Make scripts executable
    ];

    exec(commands.join(" && "), (error, stdout, stderr) => {
      if (error) {
        return reject(`❌ Tomcat installation failed: ${stderr}`);
      }
      console.log(`✅ Tomcat 9.0.98 installed successfully: ${stdout}`);

      // Ensure the systemd service file exists
      if (!fs.existsSync(SERVICE_FILE_PATH)) {
        console.log("⚠️ Tomcat service file not found. Creating a new one...");

        const serviceFileContent = `
[Unit]
Description=Apache Tomcat 9.0.98
After=network.target

[Service]
User=tomcat
Group=tomcat
Environment="JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64"
Environment="CATALINA_HOME=${TOMCAT_DIR}"
ExecStart=${TOMCAT_DIR}/bin/catalina.sh run
ExecStop=${TOMCAT_DIR}/bin/shutdown.sh
Restart=always

[Install]
WantedBy=multi-user.target
        `;

        fs.writeFileSync(SERVICE_FILE_PATH, serviceFileContent);
        console.log(`✅ Created new Tomcat service file: ${SERVICE_FILE_PATH}`);
      } else {
        console.log("✅ Tomcat service file already exists.");
      }

      // Ensure correct permissions & restart Tomcat
      exec(`sudo chmod 644 ${SERVICE_FILE_PATH}`, (permErr) => {
        if (permErr) {
          return reject(
            "❌ Failed to set correct permissions for Tomcat service file."
          );
        }
        console.log("✅ Permissions set successfully for Tomcat service file.");

        exec(
          "sudo systemctl daemon-reload && sudo systemctl enable tomcat9 && sudo systemctl restart tomcat9",
          (restartErr, restartStdout, restartStderr) => {
            if (restartErr) {
              console.error("❌ Tomcat restart failed:", restartStderr);
              return reject(`Tomcat restart failed: ${restartStderr}`);
            }
            console.log(`✅ Tomcat restarted successfully: ${restartStdout}`);
            resolve();
          }
        );
      });
    });
  });
}

module.exports = { installJava, installTomcat };
