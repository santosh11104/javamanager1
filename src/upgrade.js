const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

function runCommand(command, shell = "/bin/bash") {
  return new Promise((resolve, reject) => {
    exec(command, { shell }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Command failed: ${command}`);
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
    if (!fs.existsSync(source)) {
      console.log(`⚠️ No existing version found at ${source}. Skipping backup.`);
      return;
    }

    if (fs.existsSync(destination)) {
      console.log(`📂 Backup already exists at ${destination}. Removing old backup...`);
      await runCommand(`sudo rm -rf ${destination}`);
    }

    console.log(`📂 Creating backup: ${source} -> ${destination}`);
    await runCommand(`sudo cp -r ${source} ${destination}`);
  } catch (error) {
    console.error(`❌ Backup creation failed: ${error}`);
    throw error;
  }
}
async function getVersionsFromConfig(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      throw new Error(`❌ Config file not found: ${configPath}`);
    }

    const configData = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configData);

    if (
      !config.mave ||
      !config.mave.dependencies ||
      !config.mave.dependencies.java ||
      !config.mave.dependencies.tomcat
    ) {
      throw new Error(`❌ Invalid config structure in ${configPath}`);
    }

    return {
      java: {
        version: config.mave.dependencies.java.version || null,
        url: config.mave.dependencies.java.packageUrlUnix || null,
      },
      tomcat: {
        version: config.mave.dependencies.tomcat.version || null,
        url: config.mave.dependencies.tomcat.packageUrlUnix || null,
      },
    };
  } catch (error) {
    console.error("❌ Error reading or parsing config file:", error);
    throw error;
  }
}
async function upgradeJava(javaVersion, javaUrl, previousJavaVersion) {
  const javaDir = `/opt/openjdk-${javaVersion}`;
  const tempTarFile = `/tmp/java-${javaVersion}.tar.gz`;
  const javaBackupsDir = `/opt/java_backups`;

  try {
    await runCommand(`sudo mkdir -p ${javaBackupsDir}`);

    if (previousJavaVersion) {
      const previousJavaDir = `/opt/openjdk-${previousJavaVersion}`;
      const backupDest = path.join(javaBackupsDir, `openjdk-${previousJavaVersion}`);

      if (fs.existsSync(previousJavaDir)) {
        console.log(`📂 Backing up previous Java version: ${previousJavaVersion}`);
        await createBackup(previousJavaDir, backupDest);
        await runCommand(`sudo rm -rf ${previousJavaDir}`);
      }
    }

    console.log(`🚀 Upgrading Java ${javaVersion} from ${javaUrl}...`);
    await runCommand(`sudo apt update && sudo apt install -y wget`);
    await runCommand(`sudo wget -q "${javaUrl}" -O "${tempTarFile}"`);
    await runCommand(`sudo tar -xzf "${tempTarFile}" -C /opt`);
    const extractedFolder = await runCommand(`ls /opt | grep 'jdk-' | head -n 1`);
    if (!extractedFolder) throw new Error("❌ Could not find extracted JDK folder.");

    await runCommand(`sudo mv /opt/${extractedFolder} ${javaDir}`);
    await runCommand(`rm -f ${tempTarFile}`);

    // ✅ Set Environment Variables
    const envCommands = `
      sudo sed -i '/^JAVA_HOME=/d' /etc/environment &&
      echo 'JAVA_HOME="${javaDir}"' | sudo tee -a /etc/environment &&
      . /etc/environment
    `;
    await runCommand(envCommands);

    console.log(`✅ Java ${javaVersion} upgraded successfully.`);
  } catch (error) {
    console.error(`❌ Java upgrade failed: ${error}`);
    throw error;
  }
}

async function upgradeTomcat(tomcatVersion, tomcatUrl, previousTomcatVersion, javaVersion) {
  const tomcatDir = `/opt/tomcat-${tomcatVersion}`;
  const tempTarFile = `/tmp/tomcat-${tomcatVersion}.tar.gz`;
  const tomcatBackupsDir = `/opt/tomcat_backups`;
  const serviceFilePath = `/etc/systemd/system/tomcat-${tomcatVersion}.service`;

  try {
    await runCommand(`sudo mkdir -p ${tomcatBackupsDir}`);

    if (previousTomcatVersion) {
      const previousTomcatDir = `/opt/tomcat-${previousTomcatVersion}`;
      const backupDest = path.join(tomcatBackupsDir, `tomcat-${previousTomcatVersion}`);

      if (fs.existsSync(previousTomcatDir)) {
        console.log(`📂 Backing up previous Tomcat version: ${previousTomcatVersion}`);
        await createBackup(previousTomcatDir, backupDest);
        await runCommand(`sudo rm -rf ${previousTomcatDir}`);
      }
    }

    console.log(`🚀 Upgrading Tomcat ${tomcatVersion} from ${tomcatUrl}...`);
    await runCommand("sudo systemctl stop tomcat* || true");
    await runCommand("sudo rm -rf /opt/tomcat-* /usr/share/tomcat-* /var/lib/tomcat-* /etc/tomcat-*");

    await runCommand("sudo apt update && sudo apt install -y wget");
    await runCommand(`sudo mkdir -p ${tomcatDir}`);
    await runCommand(`sudo wget -q ${tomcatUrl} -O ${tempTarFile}`);
    await runCommand(`sudo tar -xzf "${tempTarFile}" -C "${tomcatDir}" --strip-components=1`);
    await runCommand(`rm -f ${tempTarFile}`);
    await runCommand("sudo adduser --system --no-create-home --group tomcat || true");
    await runCommand(`sudo chown -R tomcat:tomcat ${tomcatDir}`);
    await runCommand(`sudo chmod -R 755 ${tomcatDir}`);
    await runCommand(`sudo chmod -R +x ${tomcatDir}/bin/*.sh`);

    // ✅ Create systemd service file
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
    console.log("🚀 Starting upgrade process...");
    const configPath = path.join(__dirname, "mavee_config_upgrade.json");

    // ✅ Fetch Versions
    const config = await getVersionsFromConfig(configPath);

    if (!config.java.version || !config.java.url || !config.tomcat.version || !config.tomcat.url) {
      throw new Error("❌ Missing Java or Tomcat version details in config.");
    }

    console.log(`🔍 Java Version: ${config.java.version}, Tomcat Version: ${config.tomcat.version}`);

    const previousVersionsFilePath = path.join(__dirname, "previous_versions.json");
    let previousVersions = { install: { java: null, tomcat: null }, upgrade: [] };

    if (fs.existsSync(previousVersionsFilePath)) {
      previousVersions = JSON.parse(fs.readFileSync(previousVersionsFilePath, "utf-8"));
      if (!previousVersions.upgrade || !Array.isArray(previousVersions.upgrade)) {
        previousVersions.upgrade = [];
      }
    }

    // **🚀 Pick Previous Version from Upgrade Array if Available**
    let previousJavaVersion = previousVersions.install.java;
    let previousTomcatVersion = previousVersions.install.tomcat;

    if (previousVersions.upgrade.length > 0) {
      const lastUpgrade = previousVersions.upgrade[previousVersions.upgrade.length - 1];
      previousJavaVersion = lastUpgrade.java;
      previousTomcatVersion = lastUpgrade.tomcat;
    }

    console.log(`🔄 Previous Java: ${previousJavaVersion}, Previous Tomcat: ${previousTomcatVersion}`);

    // **Check if Already Upgraded**
    const isUpgradeBlocked = previousVersions.upgrade.some(
      (entry) => entry.java === config.java.version && entry.tomcat === config.tomcat.version
    );

    if (isUpgradeBlocked) {
      console.error(
        `❌ Upgrade failed: Java ${config.java.version} and Tomcat ${config.tomcat.version} are already in upgrade history.`
      );
      return;
    }

    console.log("🔄 Performing upgrade...");
    await upgradeJava(config.java.version, config.java.url, previousJavaVersion);
    await upgradeTomcat(config.tomcat.version, config.tomcat.url, previousTomcatVersion, config.java.version);

    // ✅ Maintain only the last 2 upgrade versions
    if (previousVersions.upgrade.length >= 2) {
      previousVersions.upgrade.shift();
    }

    previousVersions.upgrade.push({ java: config.java.version, tomcat: config.tomcat.version });

    fs.writeFileSync(previousVersionsFilePath, JSON.stringify(previousVersions, null, 2));
    console.log("✅ Upgrade completed successfully!");
  } catch (error) {
    console.error("❌ Upgrade failed:", error);
  }
}

module.exports = { upgrade };
