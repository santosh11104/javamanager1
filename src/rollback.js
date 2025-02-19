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

/**
 * Rolls back Java to the last working version from backups.
 */
async function rollbackJava() {
  try {
    const javaBackupsDir = `/opt/java_backups`;
    const latestJavaBackup = await runCommand(`ls -t ${javaBackupsDir} | grep 'openjdk-' | head -n 1`);

    if (!latestJavaBackup) {
      console.error("🚨 No Java backup found for rollback.");
      return;
    }

    const javaBackupDir = path.join(javaBackupsDir, latestJavaBackup);
    const javaDir = `/opt/${latestJavaBackup}`;

    console.log(`🔄 Rolling back to Java from backup: ${latestJavaBackup}...`);

    // Remove all other Java versions
    console.log("🗑️ Removing all other Java versions...");
    await runCommand(`sudo rm -rf /opt/openjdk-*`);

    // Restore Java from backup
    console.log(`♻️ Restoring Java from backup: ${latestJavaBackup}...`);
    await runCommand(`sudo cp -r ${javaBackupDir} ${javaDir}`);

    // Set environment variables
    console.log("🔧 Setting JAVA_HOME...");
    const envCommands = `
      sudo sed -i '/^JAVA_HOME=/d' /etc/environment &&
      echo 'JAVA_HOME="${javaDir}"' | sudo tee -a /etc/environment &&
      . /etc/environment
    `;
    await runCommand(envCommands);

    console.log(`✅ Java rollback to ${latestJavaBackup} completed successfully.`);
  } catch (error) {
    console.error("❌ Java rollback failed:", error);
  }
}

/**
 * Rolls back Tomcat to the last working version from backups.
 */
async function rollbackTomcat() {
  try {
    const tomcatBackupsDir = `/opt/tomcat_backups`;
    const latestTomcatBackup = await runCommand(`ls -t ${tomcatBackupsDir} | grep 'tomcat-' | head -n 1`);

    if (!latestTomcatBackup) {
      console.error("🚨 No Tomcat backup found for rollback.");
      return;
    }

    const tomcatBackupDir = path.join(tomcatBackupsDir, latestTomcatBackup);
    const tomcatDir = `/opt/${latestTomcatBackup}`;

    console.log(`🔄 Rolling back to Tomcat from backup: ${latestTomcatBackup}...`);

    // Stop and disable all Tomcat services
    console.log("🛑 Stopping all Tomcat services...");
    await runCommand(`sudo systemctl stop tomcat* || true`);
    await runCommand(`sudo systemctl disable tomcat* || true`);

    // Remove all other Tomcat versions
    console.log("🗑️ Removing all other Tomcat versions...");
    await runCommand(`sudo rm -rf /opt/tomcat-* /usr/share/tomcat-* /var/lib/tomcat-* /etc/tomcat-*`);

    // Restore Tomcat from backup
    console.log(`♻️ Restoring Tomcat from backup: ${latestTomcatBackup}...`);
    await runCommand(`sudo cp -r ${tomcatBackupDir} ${tomcatDir}`);

    // Set correct permissions
    console.log("🔧 Setting Tomcat user permissions...");
    await runCommand(`sudo chown -R tomcat:tomcat ${tomcatDir}`);
    await runCommand(`sudo chmod -R 755 ${tomcatDir}`);
    await runCommand(`sudo chmod -R +x ${tomcatDir}/bin/*.sh`);

    // Restore or recreate the systemd service file
    console.log("⚙️ Checking if Tomcat systemd service exists...");
    const tomcatVersion = latestTomcatBackup.replace("tomcat-", ""); // Remove "tomcat-" prefix
    const serviceFilePath = `/etc/systemd/system/tomcat-${tomcatVersion}.service`;

    if (!fs.existsSync(serviceFilePath)) {
      console.log(`🔧 Service file not found. Restoring Tomcat service for ${tomcatVersion}...`);
      const serviceFileContent = `
[Unit]
Description=Apache Tomcat ${tomcatVersion}
After=network.target

[Service]
User=tomcat
Group=tomcat
Environment="JAVA_HOME=/opt/openjdk-${tomcatVersion}"
Environment="CATALINA_HOME=${tomcatDir}"
ExecStart=${tomcatDir}/bin/catalina.sh run
ExecStop=${tomcatDir}/bin/shutdown.sh
Restart=always

[Install]
WantedBy=multi-user.target
`;
      await runCommand(`echo '${serviceFileContent}' | sudo tee ${serviceFilePath}`);
      await runCommand(`sudo chmod 644 ${serviceFilePath}`);
    } else {
      console.log(`✅ Tomcat service file already exists: ${serviceFilePath}`);
    }

    // Reload systemd and start Tomcat
    console.log("🔄 Reloading systemd and starting Tomcat...");
    await runCommand(`sudo systemctl daemon-reload`);
    await runCommand(`sudo systemctl enable tomcat-${tomcatVersion}`);
    await runCommand(`sudo systemctl restart tomcat-${tomcatVersion}`);

    console.log(`✅ Tomcat rollback to ${latestTomcatBackup} completed successfully.`);
  } catch (error) {
    console.error("❌ Tomcat rollback failed:", error);
  }
}

/**
 * Main rollback function.
 */
async function rollback() {
  try {
    console.log("🔄 Starting rollback process...");

    await rollbackJava();
    await rollbackTomcat();

    console.log("✅ Rollback process completed successfully.");
  } catch (error) {
    console.error("🚨 Rollback failed:", error);
  }
}

module.exports = { rollback };
