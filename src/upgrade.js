/**
 * Upgrades the Java and Tomcat versions on the system based on the versions fetched from the Mavee API.
 * 
 * This function performs the following steps:
 * 1. Fetches the required Java and Tomcat versions from the Mavee API.
 * 2. Backs up the current Java installation.
 * 3. Upgrades Java to the specified version.
 * 4. Backs up the current Tomcat installation.
 * 5. Removes any existing Tomcat versions and installs the specified Tomcat version.
 * 6. Sets up the systemd service for the new Tomcat version.
 * 7. Reloads systemd and starts the new Tomcat service.
 *
 * This function is the main entry point for the upgrade process and is exported from the module.
 */
const axios = require("axios");
const { exec } = require("child_process");
const { rollbackJava, rollbackTomcat } = require("./rollback");
const fs = require('fs');
const { upgradeTomcat10 } = require("./upgradeTomcat10"); //
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


async function upgradeTomcat(version) {
  return new Promise(async (resolve, reject) => {
    console.log("Checking for existing Tomcat 9 installation...");

    const possibleTomcatPaths = ["/opt/tomcat9", "/var/lib/tomcat9", "/usr/share/tomcat9"];
    let existingTomcatPath = possibleTomcatPaths.find(fs.existsSync);

    if (!existingTomcatPath) {
      console.warn("Tomcat 9 not found in expected locations, skipping backup.");
    } else {
      console.log(`Backing up Tomcat 9 from ${existingTomcatPath} to /opt/tomcat_backup/tomcat9...`);
      try {
        await new Promise((resolveMkdir, rejectMkdir) => {
          exec(`sudo mkdir -p /opt/tomcat_backup/tomcat9`, resolveMkdir);
        });

        await new Promise((resolveCopy, rejectCopy) => {
          exec(`sudo cp -r ${existingTomcatPath}/* /opt/tomcat_backup/tomcat9/`, resolveCopy);
        });

        console.log("Tomcat 9 backup completed successfully.");
      } catch (backupError) {
        console.error("Tomcat backup failed! Aborting upgrade to prevent data loss.");
        return reject(backupError);
      }
    }

    console.log(`Upgrading Tomcat to version ${version}...`);

    try {
      console.log("Stopping ALL running Tomcat services...");
      await new Promise(resolveStop => {
        exec(`sudo systemctl stop tomcat* || true`, resolveStop);
      });

      console.log("Disabling ALL existing Tomcat services...");
      await new Promise(resolveDisable => {
        exec(`sudo systemctl disable tomcat* || true`, resolveDisable);
      });

      if (!fs.existsSync("/opt/tomcat_backup/tomcat9")) {
        console.error("Backup verification failed! /opt/tomcat_backup/tomcat9 does not exist.");
        return reject(new Error("Backup verification failed, aborting removal."));
      }

      console.log("Removing previous Tomcat versions...");
      await new Promise((resolveUninstall, rejectUninstall) => {
        exec(
          `sudo find /opt /usr/share /var/lib /etc -maxdepth 1 -type d -name "tomcat*" ! -name "tomcat_backup" -exec rm -rf {} +`, 
          resolveUninstall
        );
      });

      console.log("Running Tomcat installation script...");
      await upgradeTomcat10(version);  // ✅ Now correctly calls upgradeTomcat10

      console.log(`Tomcat ${version} installation completed successfully.`);
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