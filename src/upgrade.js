const axios = require("axios");
const { exec } = require("child_process");
const { rollbackJava, rollbackTomcat } = require("./rollback");
const fs = require('fs'); // Require the fs module
// Function to get Java & Tomcat versions from Mavee API
async function getMaveeVersions() {
  try {
    const response = await axios.get("http://127.0.0.1:3000/version");
    return {
      javaVersion: response.data.java,
      tomcatVersion: response.data.tomcat
    };
  } catch (error) {
    throw new Error(`Failed to fetch versions from Mavee Server: ${error.message}`);
  }
}

 // Function to upgrade Java
async function upgradeJava(version) {
  return new Promise((resolve, reject) => {
    console.log(`Upgrading Java to version ${version}...`);

    const command = `
      sudo apt update &&
      if sudo apt-cache show openjdk-${version}-jdk > /dev/null 2>&1; then
        sudo apt install -y openjdk-${version}-jdk;
      else
        echo "Java version ${version} not found, falling back to latest available OpenJDK";
        sudo apt install -y openjdk-21-jdk;
      fi &&
      echo 'JAVA_HOME="/usr/lib/jvm/java-${version}-openjdk-amd64"' | sudo tee /etc/environment &&
      echo 'export JAVA_HOME="/usr/lib/jvm/java-${version}-openjdk-amd64"' | sudo tee -a /etc/profile &&
      echo 'export PATH=$JAVA_HOME/bin:$PATH' | sudo tee -a /etc/profile
    `;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Java upgrade failed: ${stderr}`);
        reject(new Error(`Java upgrade failed: ${stderr}`));
      } else {
        console.log(`Java ${version} installed successfully: ${stdout}`);
        resolve();
      }
    });
  });
}

// Function to upgrade Tomcat
async function upgradeTomcat(version) {
  return new Promise(async (resolve, reject) => {
    console.log(`Upgrading Tomcat to version ${version}...`);

    const tomcatServiceName = `tomcat${version.split(".")[0]}`;

    try {
      console.log("Removing previous Tomcat versions...");
      await new Promise((resolveUninstall, rejectUninstall) => {
        exec(
          `sudo systemctl stop tomcat9 || true &&
           sudo systemctl stop tomcat10 || true &&
           sudo apt remove --purge -y tomcat9 tomcat9-common &&
           sudo rm -rf /opt/tomcat /var/lib/tomcat9 /etc/tomcat9`,
          (removeError, removeStdout, removeStderr) => {
            if (removeError) {
              console.warn(`Warning: Could not fully remove old Tomcat versions: ${removeStderr}`);
            }
            resolveUninstall();
          }
        );
      });

      console.log("Running Tomcat installation script...");
      await new Promise((resolveTomcatInstall, rejectTomcatInstall) => {
        exec(`sudo bash ./install_tomcat.sh`, (installError, installStdout, installStderr) => {
          if (installError) {
            console.error(`Tomcat installation script failed:\n${installStderr}`);
            rejectTomcatInstall(new Error(`Tomcat installation failed: ${installStderr}`));
            return;
          }
          console.log(`Tomcat installation script executed successfully: ${installStdout}`);
          resolveTomcatInstall();
        });
      });

      console.log("Setting up systemd service for Tomcat...");
      const serviceFilePath = `/etc/systemd/system/${tomcatServiceName}.service`;

      if (!fs.existsSync(serviceFilePath)) {
        console.log("Creating new systemd service file...");
        const serviceFileContent = `
          [Unit]
          Description=Apache Tomcat ${version}
          After=network.target

          [Service]
          User=tomcat
          Group=tomcat
          Environment=JAVA_HOME=/usr/lib/jvm/default-java
          Environment=CATALINA_HOME=/opt/tomcat
          ExecStart=/opt/tomcat/bin/catalina.sh run
          ExecStop=/opt/tomcat/bin/catalina.sh stop
          Restart=always

          [Install]
          WantedBy=multi-user.target
        `;

        fs.writeFileSync(`/tmp/${tomcatServiceName}.service`, serviceFileContent);

        exec(`sudo mv /tmp/${tomcatServiceName}.service ${serviceFilePath}`, (mvErr) => {
          if (mvErr) {
            console.error("Failed to move systemd service file:", mvErr);
            reject(new Error("Failed to configure Tomcat systemd service."));
            return;
          }
        });
      }

      console.log("Reloading systemd and starting Tomcat...");
      exec(
        `sudo systemctl daemon-reload && sudo systemctl enable ${tomcatServiceName} && sudo systemctl restart ${tomcatServiceName}`,
        (startError) => {
          if (startError) {
            console.error("Failed to start Tomcat 10:", startError);
            reject(new Error("Tomcat 10 startup failed."));
            return;
          }
          console.log("Tomcat 10 started successfully.");
          resolve();
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}


// Function to handle the full upgrade process
async function upgrade() {
  try {
    console.log("Starting upgrade process...");
    console.log("Fetching required versions from Mavee Server...");

    const { javaVersion, tomcatVersion } = await getMaveeVersions();
    console.log(`Upgrading Java to version ${javaVersion} and Tomcat to ${tomcatVersion}...`);

    await upgradeJava(javaVersion);
    await upgradeTomcat(tomcatVersion);

    console.log("Upgrade completed successfully!");
  } catch (error) {
    console.error("Upgrade failed:", error.message);
  }
}


module.exports = { upgrade };
