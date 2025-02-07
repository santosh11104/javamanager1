const axios = require("axios");
const { exec } = require("child_process");
const { rollbackJava, rollbackTomcat } = require("./rollback");
const fs = require('fs');

// Function to check if a backup exists
function backupExists(path) {
  return fs.existsSync(path);
}

// Function to create a backup
async function createBackup(source, destination) {
  return new Promise((resolve, reject) => {
    if (backupExists(destination)) {
      console.log(`Backup already exists at ${destination}, skipping...`);
      return resolve();
    }

    console.log(`Creating backup from ${source} to ${destination}...`);
    exec(`sudo cp -r ${source} ${destination}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Failed to create backup: ${stderr}`);
        return reject(error);
      }
      console.log("Backup created successfully.");
      resolve();
    });
  });
}

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
  return new Promise(async (resolve, reject) => {
    console.log("Backing up current Java version...");
    try {
      await createBackup("/usr/lib/jvm/java-17-openjdk-amd64", "/opt/java_backup");
    } catch (backupError) {
      console.error("Java backup failed!", backupError);
      return reject(backupError); // Reject the promise if backup fails
    }

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
        console.log("Rolling back Java...");
        rollbackJava().then(() => reject(new Error(`Java upgrade failed: ${stderr}`)));
      } else {
        console.log(`Java ${version} installed successfully: ${stdout}`);
        resolve();
      }
    });
  });
}

// Function to upgrade Tomcat
// Function to upgrade Tomcat
async function upgradeTomcat(version) {
  return new Promise(async (resolve, reject) => {
    console.log("Checking for existing Tomcat 9 installation...");

    // Check multiple possible locations for Tomcat 9
    const possibleTomcatPaths = ["/opt/tomcat9", "/var/lib/tomcat9", "/usr/share/tomcat9"];
    let existingTomcatPath = possibleTomcatPaths.find(fs.existsSync);

    if (!existingTomcatPath) {
      console.warn("Tomcat 9 not found in expected locations, skipping backup.");
    } else {
      console.log(`Backing up Tomcat 9 from ${existingTomcatPath} to /opt/tomcat_backup/tomcat9...`);
      try {
        // Ensure backup folder exists before copying
        await new Promise((resolveMkdir, rejectMkdir) => {
          exec(`sudo mkdir -p /opt/tomcat_backup/tomcat9`, (mkdirError, mkdirStdout, mkdirStderr) => {
            if (mkdirError) {
              console.error(`Failed to create backup directory: ${mkdirStderr}`);
              return rejectMkdir(mkdirError);
            }
            resolveMkdir();
          });
        });

        // Copy Tomcat 9 files to backup
        await new Promise((resolveCopy, rejectCopy) => {
          exec(`sudo cp -r ${existingTomcatPath}/* /opt/tomcat_backup/tomcat9/`, (copyError, copyStdout, copyStderr) => {
            if (copyError) {
              console.error(`Failed to copy Tomcat 9 files: ${copyStderr}`);
              return rejectCopy(copyError);
            }
            console.log("Tomcat 9 backup completed successfully.");
            resolveCopy();
          });
        });

      } catch (backupError) {
        console.error("Tomcat backup failed! Aborting upgrade to prevent data loss.");
        return reject(backupError);
      }
    }

    console.log(`Upgrading Tomcat to version ${version}...`);

    const tomcatServiceName = `tomcat${version.split('.')[0]}`;

    try {
      // 1. Stop ALL existing Tomcat services
      console.log("Stopping ALL running Tomcat services...");
      await new Promise(resolveStop => {
        exec(`sudo systemctl stop tomcat* || true`, resolveStop);
      });

      // 2. Disable ALL existing Tomcat services
      console.log("Disabling ALL existing Tomcat services...");
      await new Promise(resolveDisable => {
        exec(`sudo systemctl disable tomcat* || true`, resolveDisable);
      });

      // 3. Verify backup exists before removing Tomcat
      if (!fs.existsSync("/opt/tomcat_backup/tomcat9")) {
        console.error("Backup verification failed! /opt/tomcat_backup/tomcat9 does not exist.");
        return reject(new Error("Backup verification failed, aborting removal."));
      }

      // 4. Remove previous Tomcat versions **without deleting /opt/tomcat_backup**
      console.log("Removing previous Tomcat versions...");
      await new Promise((resolveUninstall, rejectUninstall) => {
        exec(
          `sudo find /opt /usr/share /var/lib /etc -maxdepth 1 -type d -name "tomcat*" ! -name "tomcat_backup" -exec rm -rf {} +`, 
          (removeError, removeStdout, removeStderr) => {
            if (removeError) {
              console.warn(`Warning: Could not fully remove old Tomcat versions: ${removeStderr}`);
            }
            resolveUninstall();
          }
        );
      });

      // 5. Run Tomcat installation script
      console.log("Running Tomcat installation script...");
      await new Promise((resolveTomcatInstall, rejectTomcatInstall) => {
        exec(`sudo bash ./install_tomcat.sh`, (installError, installStdout, installStderr) => {
          if (installError) {
            console.error(`Tomcat installation script failed:\n${installStderr}`);
            console.log("Rolling back Tomcat...");
            rollbackTomcat().then(() => reject(new Error(`Tomcat installation failed: ${installStderr}`)));
          } else {
            console.log(`Tomcat installation script executed successfully: ${installStdout}`);
            resolveTomcatInstall();
          }
        });
      });

      // 6. Restore systemd service file creation
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
        Environment=JAVA_HOME=/usr/lib/jvm/default-java
        Environment=CATALINA_HOME=/opt/tomcat10
        ExecStart=/opt/tomcat10/bin/catalina.sh run
        ExecStop=/opt/tomcat10/bin/catalina.sh stop
        Restart=always

        [Install]
        WantedBy=multi-user.target
      `;

      await fs.promises.writeFile(serviceFilePath, serviceFileContent);

      // 7. Reload systemd and start Tomcat
      console.log("Reloading systemd and starting Tomcat...");
      await new Promise((resolveStart, rejectStart) => {
        exec(`sudo systemctl daemon-reload && sudo systemctl enable ${tomcatServiceName} && sudo systemctl start ${tomcatServiceName}`, (startError, startStdout, startStderr) => {
          if (startError) {
            console.error(`Failed to start Tomcat ${version}:\n${startStderr}`);
            return rejectStart(new Error(`Tomcat ${version} startup failed: ${startError}`));
          }
          console.log(`Tomcat ${version} started successfully:\n${startStdout}`);
          resolveStart();
        });
      });

      resolve();

    } catch (error) {
      console.error("Tomcat upgrade failed:", error);
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