const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "mavee_config_upgrade.json");

/**
 * Runs a shell command.
 */
async function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
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

/**
 * Reads the Java & Tomcat versions and URLs from `mavee_config_upgrade.json`
 */
async function getUpgradeConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      throw new Error("🚨 Upgrade configuration file not found.");
    }

    const configData = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(configData);

    return {
      javaVersion: config.mave.dependencies.java.version,
      javaUrl: config.mave.dependencies.java.packageUrlUnix,
      tomcatVersion: config.mave.dependencies.tomcat.version,
      tomcatUrl: config.mave.dependencies.tomcat.packageUrlUnix,
    };
  } catch (error) {
    console.error("❌ Failed to read upgrade configuration:", error);
    throw error;
  }
}

/**
 * Creates a backup of the given directory.
 */
async function createBackup(source, destination) {
  try {
    if (fs.existsSync(destination)) {
      console.log(`📂 Backup already exists at ${destination}, removing old backup...`);
      await runCommand(`sudo rm -rf ${destination}`);
    }
    console.log(`📂 Creating backup: ${source} -> ${destination}`);
    await runCommand(`sudo cp -r ${source} ${destination}`);
  } catch (error) {
    console.error(`❌ Backup creation failed: ${error}`);
    throw error;
  }
}

/**
 * Rolls back to the previous versions of Java & Tomcat.
 */
async function rollback(javaVersion, tomcatVersion) {
  console.log("🔄 Rolling back due to failure...");

  try {
    const javaBackupDir = `/opt/java_backups/openjdk-${javaVersion}`;
    const tomcatBackupDir = `/opt/tomcat_backups/tomcat-${tomcatVersion}`;

    if (fs.existsSync(javaBackupDir)) {
      console.log(`♻️ Restoring Java ${javaVersion} from backup...`);
      await runCommand(`sudo rm -rf /opt/openjdk-*`);
      await runCommand(`sudo cp -r ${javaBackupDir} /opt/openjdk-${javaVersion}`);
    } else {
      console.warn(`⚠️ No Java backup found for version ${javaVersion}. Skipping rollback.`);
    }

    if (fs.existsSync(tomcatBackupDir)) {
      console.log(`♻️ Restoring Tomcat ${tomcatVersion} from backup...`);
      await runCommand(`sudo rm -rf /opt/tomcat-*`);
      await runCommand(`sudo cp -r ${tomcatBackupDir} /opt/tomcat-${tomcatVersion}`);
    } else {
      console.warn(`⚠️ No Tomcat backup found for version ${tomcatVersion}. Skipping rollback.`);
    }

    // ✅ Restart Tomcat Service after rollback
    console.log("🔄 Restarting Tomcat...");
    await runCommand(`sudo systemctl daemon-reload`);
    await runCommand(`sudo systemctl restart tomcat-${tomcatVersion}`);

    console.log("✅ Rollback completed successfully.");
  } catch (error) {
    console.error("❌ Rollback failed:", error);
  }
}

/**
 * Upgrades Java.
 */
async function upgradeJava(javaVersion, javaUrl) {
  const javaDir = `/opt/openjdk-${javaVersion}`;
  const tempTarFile = `/tmp/java-${javaVersion}.tar.gz`;
  const javaBackupsDir = `/opt/java_backups`;

  try {
    await runCommand(`sudo mkdir -p ${javaBackupsDir}`);

    // ✅ Backup current Java version
    const existingJava = await runCommand(`ls /opt | grep 'openjdk-' | head -n 1`);
    if (existingJava) {
      const backupDest = path.join(javaBackupsDir, existingJava);
      await createBackup(`/opt/${existingJava}`, backupDest);
      await runCommand(`sudo rm -rf /opt/${existingJava}`);
    }

    console.log(`🚀 Upgrading Java ${javaVersion} from ${javaUrl}...`);
    await runCommand(`sudo apt update && sudo apt install -y wget`);

    // ✅ Check if Java download succeeds before upgrading
    try {
      await runCommand(`sudo wget -q "${javaUrl}" -O "${tempTarFile}"`);
    } catch (error) {
      console.error("❌ Java download failed. Rolling back...");
      await rollback(javaVersion, "11.0.3");
      throw error;
    }

    await runCommand(`sudo tar -xzf "${tempTarFile}" -C /opt`);

    // ✅ Rename extracted folder
    const extractedFolder = await runCommand(`ls /opt | grep 'jdk-' | head -n 1`);
    if (extractedFolder) {
      await runCommand(`sudo mv /opt/${extractedFolder} ${javaDir}`);
    }

    await runCommand(`rm -f ${tempTarFile}`);
 // ✅ Update Environment Variables
 const envCommands = `
 sudo sed -i '/^export JAVA_HOME=/d' /etc/profile
 sudo sed -i '/^export PATH=.*JAVA_HOME/d' /etc/profile
 sudo sed -i '/^JAVA_HOME=/d' /etc/environment

 echo 'export JAVA_HOME=${javaDir}' | sudo tee -a /etc/profile
 echo 'export PATH=$JAVA_HOME/bin:$PATH' | sudo tee -a /etc/profile
 echo 'JAVA_HOME=${javaDir}' | sudo tee -a /etc/environment
`;

await runCommand(envCommands);

// ✅ Apply changes to the current shell session
await runCommand(`bash -c "source /etc/profile"`);
    console.log(`✅ Java ${javaVersion} upgraded successfully.`);
  } catch (error) {
    console.error(`❌ Java upgrade failed: ${error}`);
    throw error;
  }
}

/**
 * Upgrades Tomcat.
 */
async function upgradeTomcat(tomcatVersion, tomcatUrl, javaVersion) {
  const tomcatDir = `/opt/tomcat-${tomcatVersion}`;
  const tempTarFile = `/tmp/tomcat-${tomcatVersion}.tar.gz`;
  const tomcatBackupsDir = `/opt/tomcat_backups`;

  try {
    await runCommand(`sudo mkdir -p ${tomcatBackupsDir}`);

    // ✅ Backup current Tomcat version
    const existingTomcat = await runCommand(`ls /opt | grep 'tomcat-' | head -n 1`);
    if (existingTomcat) {
      const backupDest = path.join(tomcatBackupsDir, existingTomcat);
      await createBackup(`/opt/${existingTomcat}`, backupDest);
      await runCommand(`sudo rm -rf /opt/${existingTomcat}`);
    }

    console.log(`🚀 Upgrading Tomcat ${tomcatVersion} from ${tomcatUrl}...`);
 // ✅ Check if Tomcat download succeeds before upgrading
 try {
  await runCommand(`sudo wget -q "${tomcatUrl}" -O "${tempTarFile}"`);
} catch (error) {
  console.error("❌ Tomcat download failed. Rolling back...");
  await rollback("20", "11.0.3"); // Replace with correct previous versions
  throw error;
}

    await runCommand(`sudo tar -xzf "${tempTarFile}" -C /opt`);

    // ✅ Rename extracted folder
    const extractedFolder = await runCommand(`ls /opt | grep 'apache-tomcat-' | head -n 1`);
    if (extractedFolder) {
      await runCommand(`sudo mv /opt/${extractedFolder} ${tomcatDir}`);
    }

    await runCommand(`rm -f ${tempTarFile}`);
    await runCommand(`sudo chown -R tomcat:tomcat ${tomcatDir}`);
    await runCommand(`sudo chmod -R 755 ${tomcatDir}`);
    await runCommand(`sudo chmod -R +x ${tomcatDir}/bin/*.sh`);
     // ✅ Restore Tomcat systemd service
     const serviceFilePath = `/etc/systemd/system/tomcat-${tomcatVersion}.service`;
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
 
     console.log("⚙️ Creating Tomcat systemd service...");
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

/**
 * Main upgrade function.
 */
async function upgrade() {
  try {
    console.log("🚀 Starting upgrade process...");

    const { javaVersion, javaUrl, tomcatVersion, tomcatUrl } = await getUpgradeConfig();

    await upgradeJava(javaVersion, javaUrl);
    await upgradeTomcat(tomcatVersion, tomcatUrl, javaVersion);

    console.log("✅ Upgrade completed successfully.");
  } catch (error) {
    console.error("❌ Upgrade failed. Rolling back...");
    const { javaVersion, tomcatVersion } = await getUpgradeConfig();
    await rollback(javaVersion, tomcatVersion);
  }
}

module.exports = { upgrade };
