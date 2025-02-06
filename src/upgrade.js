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

    const tomcatServiceName = `tomcat${version.split('.')[0]}`;

    try {
      // 1. Stop ALL existing Tomcat services (Crucial!)
      console.log("Stopping ALL running Tomcat services...");
      await new Promise(resolveStop => {
          exec(`sudo systemctl stop tomcat* || true`, resolveStop);
      });

      // 2. Disable ALL existing Tomcat services (Crucial!)
      console.log("Disabling ALL existing Tomcat services...");
      await new Promise(resolveDisable => {
          exec(`sudo systemctl disable tomcat* || true`, resolveDisable);
      });

      // 3. Remove previous Tomcat versions (More Robust)
      console.log("Removing previous Tomcat versions...");
      await new Promise((resolveUninstall, rejectUninstall) => {
        exec(
          `sudo apt remove --purge -y tomcat* || true && sudo rm -rf /opt/tomcat* /usr/share/tomcat* /var/lib/tomcat* /etc/tomcat*`, // Remove all tomcat locations
          (removeError, removeStdout, removeStderr) => {
            if (removeError) {
              console.warn(`Warning: Could not fully remove old Tomcat versions: ${removeStderr}`);
            }
            resolveUninstall();
          }
        );
      });

      // 4. Run Tomcat installation script
      console.log("Running Tomcat installation script...");
      await new Promise((resolveTomcatInstall, rejectTomcatInstall) => {
        exec(`sudo bash ./install_tomcat.sh`, (installError, installStdout, installStderr) => {
          if (installError) {
            console.error(`Tomcat installation script failed:\n${installStderr}`);
            return rejectTomcatInstall(new Error(`Tomcat installation failed: ${installStderr}`));
          }
          console.log(`Tomcat installation script executed successfully: ${installStdout}`);
          resolveTomcatInstall();
        });
      });

      // 5. Set up systemd service for Tomcat (Improved)
      console.log("Setting up systemd service for Tomcat...");
      const serviceFilePath = `/etc/systemd/system/${tomcatServiceName}.service`;
      const serviceFileContent = `
        [Unit]
        Description=Apache Tomcat ${version}
        After=network.target

        [Service]
        Type=forking
        User=tomcat
        Group=tomcat
        Environment=JAVA_HOME=/usr/lib/jvm/default-java  # Or use your specific path
        Environment=CATALINA_HOME=/opt/tomcat10  # Make sure this is correct!
        ExecStart=/opt/tomcat10/bin/catalina.sh run
        ExecStop=/opt/tomcat10/bin/catalina.sh stop
        Restart=always

        [Install]
        WantedBy=multi-user.target
      `;

      await fs.promises.writeFile(serviceFilePath, serviceFileContent); // Write directly to the correct location

      // 6. Reload systemd and start Tomcat (Improved)
      console.log("Reloading systemd and starting Tomcat...");
      await new Promise((resolveStart, rejectStart) => {
        exec(`sudo systemctl daemon-reload && sudo systemctl enable ${tomcatServiceName} && sudo systemctl start ${tomcatServiceName}`, (startError, startStdout, startStderr) => {
          if (startError) {
            console.error(`Failed to start Tomcat ${version}:\n${startStderr}`);
            return rejectStart(new Error(`Tomcat ${version} startup failed: ${startError}`)); // Pass the error object
          }
          console.log(`Tomcat ${version} started successfully:\n${startStdout}`);
          resolveStart();
        });
      });

      resolve(); // Resolve the main promise if everything is successful

    } catch (error) {
      console.error("Tomcat upgrade failed:", error);
      reject(error); // Reject with the caught error
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
