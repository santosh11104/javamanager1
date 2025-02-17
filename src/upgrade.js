const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

function runCommand(command, shell = "/bin/bash") {
  return new Promise((resolve, reject) => {
    exec(command, { shell }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Command failed: ${command}`);
        console.error(`Error: ${stderr}`);
        reject(stderr || error.message);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function createBackup(source, destination) {
  try {
    if (fs.existsSync(destination)) {
      console.log(`Backup already exists at ${destination}. Removing existing backup...`);
      await runCommand(`sudo rm -rf ${destination}`);
    }
    console.log(`Creating backup: ${source} -> ${destination}`);
    await runCommand(`sudo cp -r ${source} ${destination}`); // Use cp -r for directories
  } catch (error) {
    console.error(`Backup creation failed: ${error}`);
    throw error;
  }
}

async function getVersionsFromConfig(configPath) {
  try {
    const configData = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configData);
    return {
      java: {
        version: config.mave.dependencies.java.version,
        url: config.mave.dependencies.java.packageUrlUnix,
      },
      tomcat: {
        version: config.mave.dependencies.tomcat.version,
        url: config.mave.dependencies.tomcat.packageUrlUnix,
      },
    };
  } catch (error) {
    console.error("Error reading or parsing config file:", error);
    throw error;
  }
}

async function upgradeTomcat(tomcatVersion, tomcatUrl, previousTomcatVersion, javaVersion) {
  if (tomcatVersion === previousTomcatVersion && previousTomcatVersion !== null) {
    console.log(`Tomcat version ${tomcatVersion} is already installed. Skipping upgrade.`);
    return;
  }

  const tomcatDir = `/opt/tomcat-${tomcatVersion}`;
  const tempTarFile = `/tmp/tomcat-${tomcatVersion}.tar.gz`;
  const serviceFilePath = `/etc/systemd/system/tomcat-${tomcatVersion}.service`;
  const tomcatBackupsDir = `/opt/tomcat_backups`;

  try {
    await runCommand(`sudo mkdir -p ${tomcatBackupsDir}`);

    const previousTomcatDir = `/opt/tomcat-${previousTomcatVersion}`;

    if (fs.existsSync(previousTomcatDir)) {
      const backupDest = path.join(tomcatBackupsDir, `tomcat-${previousTomcatVersion}`);
      await createBackup(previousTomcatDir, backupDest);
      await runCommand(`sudo rm -rf ${previousTomcatDir}`);
    } else {
      console.warn(`Previous Tomcat version ${previousTomcatVersion} not found. Skipping backup.`);
    }

    console.log(`🚀 Upgrading Tomcat ${tomcatVersion} from ${tomcatUrl}...`);

    await runCommand("sudo systemctl stop tomcat* || true");
    await runCommand("sudo rm -rf /opt/tomcat-* /usr/share/tomcat-* /var/lib/tomcat-* /etc/tomcat-*");

    await runCommand("sudo apt update");
    await runCommand("sudo apt install -y wget");
    await runCommand(`sudo mkdir -p ${tomcatDir}`);
    await runCommand(`sudo wget -q ${tomcatUrl} -O ${tempTarFile}`);
    await runCommand(`sudo tar -xzf "${tempTarFile}" -C "${tomcatDir}" --strip-components=1`);
    await runCommand(`rm -f ${tempTarFile}`);

    await runCommand("sudo adduser --system --no-create-home --group tomcat || true");
    await runCommand(`sudo chown -R tomcat:tomcat ${tomcatDir}`);
    await runCommand(`sudo chmod -R 755 ${tomcatDir}`);
    await runCommand(`sudo chmod -R +x ${tomcatDir}/bin/*.sh`);

    const serviceFileContent = `
[Unit]
Description=Apache Tomcat ${tomcatVersion}
After=network.target

[Service]
User=tomcat
Group=tomcat
Environment="JAVA_HOME=/opt/openjdk-${javaVersion}"
Environment="CATALINA_HOME=${tomcatDir}"
ExecStart=${tomcatDir}/bin/catalina.sh run
ExecStop=${tomcatDir}/bin/shutdown.sh
Restart=always

[Install]
WantedBy=multi-user.target
`;

    await runCommand(`echo '${serviceFileContent}' | sudo tee ${serviceFilePath}`);
    await runCommand(`sudo chmod 644 ${serviceFilePath}`);
    await runCommand(`sudo systemctl daemon-reload`);
    await runCommand(`sudo systemctl enable tomcat-${tomcatVersion}`);
    await runCommand(`sudo systemctl restart tomcat-${tomcatVersion}`);

    console.log(`✅ Tomcat ${tomcatVersion} upgraded successfully.`);
  } catch (error) {
    console.error(`❌ Tomcat upgrade failed: ${error}`);
    throw error;
  }
}

async function upgrade() {
  try {
    console.log("Starting upgrade process...");

    const configPath = path.join(__dirname, "mavee_config_upgrade.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    // ✅ Fetch required versions from config file
    const currentJavaVersion = config.mave.dependencies.java.version;
    const currentJavaUrl = config.mave.dependencies.java.packageUrlUnix;
    const currentTomcatVersion = config.mave.dependencies.tomcat.version;
    const currentTomcatUrl = config.mave.dependencies.tomcat.packageUrlUnix;

    // ✅ Fetch previous versions
    const previousVersionsFilePath = path.join(__dirname, "previous_versions.json");
    let previousVersions = { install: { java: null, tomcat: null }, upgrade: [] };

    if (fs.existsSync(previousVersionsFilePath)) {
      const fileData = fs.readFileSync(previousVersionsFilePath, "utf-8");
      previousVersions = JSON.parse(fileData);
      previousVersions.upgrade = previousVersions.upgrade || [];
    }

    // ✅ Check if upgrade matches any of the two stored versions
    const isUpgradeBlocked = previousVersions.upgrade.some(
      (entry) => entry.java === currentJavaVersion && entry.tomcat === currentTomcatVersion
    );

    if (isUpgradeBlocked) {
      console.error(`❌ Upgrade failed: Java ${currentJavaVersion} and Tomcat ${currentTomcatVersion} are already in the upgrade history.`);
      return; // Stop execution
    }

    console.log("Performing upgrade...");

    // ✅ Call Java Upgrade Function
    await upgradeJava(currentJavaVersion, currentJavaUrl, previousVersions.install?.java);

    // ✅ Call Tomcat Upgrade Function
    await upgradeTomcat(currentTomcatVersion, currentTomcatUrl, previousVersions.install?.tomcat, currentJavaVersion);

    console.log("Upgrade completed successfully!");

    // ✅ Maintain only the last 2 upgrade versions
    if (previousVersions.upgrade.length >= 2) {
      previousVersions.upgrade.shift(); // Remove the oldest entry
    }

    // ✅ Append the new upgrade version to the end
    previousVersions.upgrade.push({
      java: currentJavaVersion,
      tomcat: currentTomcatVersion,
    });

    fs.writeFileSync(previousVersionsFilePath, JSON.stringify(previousVersions, null, 2));

    console.log("previous_versions.json updated.");
  } catch (error) {
    console.error("Upgrade failed:", error);
  }
}

async function upgradeJava(javaVersion, javaUrl, previousJavaVersion) {
  if (javaVersion === previousJavaVersion && previousJavaVersion !== null) {
    console.log(`Java version ${javaVersion} is already installed. Skipping upgrade.`);
    return;
  }

  const javaDir = `/opt/openjdk-${javaVersion}`;
  const tempTarFile = `/tmp/java-${javaVersion}.tar.gz`;
  const javaBackupsDir = `/opt/java_backups`; // Directory for Java backups

  try {
    await runCommand(`sudo mkdir -p ${javaBackupsDir}`); // Ensure backup folder exists

    // ✅ **Backup existing Java version before upgrade**
    const previousJavaDir = `/opt/openjdk-${previousJavaVersion}`;
    if (fs.existsSync(previousJavaDir)) {
      const backupDest = path.join(javaBackupsDir, `openjdk-${previousJavaVersion}`);
      await createBackup(previousJavaDir, backupDest);
      await runCommand(`sudo rm -rf ${previousJavaDir}`); // Remove after successful backup
    } else {
      console.log("No previous Java installation found. Skipping backup.");
    }

    console.log(`🚀 Upgrading Java ${javaVersion} from ${javaUrl}...`);

    await runCommand(`sudo apt update`);
    await runCommand(`sudo apt install -y wget`);
    await runCommand(`sudo mkdir -p /opt`); 

    // ✅ **Download Java Package**
    await runCommand(`sudo wget -q "${javaUrl}" -O "${tempTarFile}"`);

    // ✅ **Extract Java Properly**
    await runCommand(`sudo tar -xzf "${tempTarFile}" -C /opt`);
    const extractedFolder = await runCommand(`ls /opt | grep 'jdk-' | head -n 1`);
    if (!extractedFolder) {
      throw new Error("Could not find extracted JDK folder.");
    }

    await runCommand(`sudo mv /opt/${extractedFolder} ${javaDir}`);
    await runCommand(`rm -f ${tempTarFile}`); // Clean up tar file

    // ✅ **Set Environment Variables**
    const envCommands = `
        sudo sed -i '/^JAVA_HOME=/d' /etc/environment &&
        sudo sed -i '/^export JAVA_HOME=/d' /etc/profile &&
        sudo sed -i '/^export PATH=.*JAVA_HOME/d' /etc/profile &&
        echo 'JAVA_HOME="${javaDir}"' | sudo tee -a /etc/environment &&
        echo 'export JAVA_HOME="${javaDir}"' | sudo tee -a /etc/profile &&
        echo 'export PATH="$JAVA_HOME/bin:$PATH"' | sudo tee -a /etc/profile &&
        . /etc/profile
    `;
    await runCommand(envCommands);

    console.log(`✅ Java ${javaVersion} upgraded successfully.`);
  } catch (error) {
    console.error(`❌ Java upgrade failed: ${error}`);
    throw error;
  }
}


module.exports = { upgrade };
