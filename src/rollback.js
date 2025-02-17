// rollback.js
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

// Get the last upgrade version from previous_versions.json
async function getRollbackVersion() {
    const versionsFilePath = path.join(__dirname, "previous_versions.json");

    if (!fs.existsSync(versionsFilePath)) {
        throw new Error("🚨 previous_versions.json not found! Cannot rollback.");
    }

    let previousVersions = JSON.parse(fs.readFileSync(versionsFilePath, "utf-8"));

    if (!previousVersions.upgrade || previousVersions.upgrade.length === 0) {
        throw new Error("🚨 No previous upgrade versions available to rollback.");
    }

    // Get the last upgrade entry
    const lastUpgrade = previousVersions.upgrade.pop(); // Remove last upgrade entry

    // Save updated previous_versions.json after removing last upgrade entry
    fs.writeFileSync(versionsFilePath, JSON.stringify(previousVersions, null, 2));

    return lastUpgrade; // { java: "19", tomcat: "10.1.35" }
}

// Function to rollback Java
async function rollbackJava(javaVersion) {
    console.log(`🔄 Rolling back to Java ${javaVersion}...`);

    const javaBackupDir = `/opt/java_backups/openjdk-${javaVersion}`;
    const javaDir = `/opt/openjdk-${javaVersion}`;

    // 🔎 If Java exists in /opt/, no rollback needed
    if (fs.existsSync(javaDir)) {
        console.log(`✅ Java ${javaVersion} already exists in /opt/. Skipping rollback.`);
        return;
    }

    if (!fs.existsSync(javaBackupDir)) {
        console.error(`🚨 Java backup for version ${javaVersion} not found!`);
        throw new Error(`Java backup for version ${javaVersion} is missing.`);
    }

    // Remove all other Java versions
    console.log("🗑️ Removing all other Java versions...");
    await runCommand(`sudo rm -rf /opt/openjdk-*`);

    // Restore Java from backup
    console.log(`♻️ Restoring Java ${javaVersion} from backup...`);
    await runCommand(`sudo cp -r ${javaBackupDir} ${javaDir}`);

    // Set environment variables
    console.log("🔧 Setting JAVA_HOME...");
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

    console.log(`✅ Java rollback to ${javaVersion} completed successfully.`);
}

// Function to rollback Tomcat
async function rollbackTomcat(tomcatVersion) {
    console.log(`🔄 Rolling back to Tomcat ${tomcatVersion}...`);

    const tomcatBackupDir = `/opt/tomcat_backups/tomcat-${tomcatVersion}`;
    const tomcatDir = `/opt/tomcat-${tomcatVersion}`;

    // 🔎 If Tomcat exists in /opt/, no rollback needed
    if (fs.existsSync(tomcatDir)) {
        console.log(`✅ Tomcat ${tomcatVersion} already exists in /opt/. Skipping rollback.`);
        return;
    }

    if (!fs.existsSync(tomcatBackupDir)) {
        console.error(`🚨 Tomcat backup for version ${tomcatVersion} not found!`);
        throw new Error(`Tomcat backup for version ${tomcatVersion} is missing.`);
    }

    // Stop and disable all Tomcat services
    console.log("🛑 Stopping all Tomcat services...");
    await runCommand(`sudo systemctl stop tomcat* || true`);
    await runCommand(`sudo systemctl disable tomcat* || true`);

    // Remove all other Tomcat versions
    console.log("🗑️ Removing all other Tomcat versions...");
    await runCommand(`sudo rm -rf /opt/tomcat-* /usr/share/tomcat-* /var/lib/tomcat-* /etc/tomcat-*`);

    // Restore Tomcat from backup
    console.log(`♻️ Restoring Tomcat ${tomcatVersion} from backup...`);
    await runCommand(`sudo cp -r ${tomcatBackupDir} ${tomcatDir}`);

    // Set correct permissions
    console.log("🔧 Setting Tomcat user permissions...");
    await runCommand(`sudo chown -R tomcat:tomcat ${tomcatDir}`);
    await runCommand(`sudo chmod -R 755 ${tomcatDir}`);
    await runCommand(`sudo chmod -R +x ${tomcatDir}/bin/*.sh`);

    // Restore Tomcat systemd service
    console.log("⚙️ Restoring Tomcat systemd service...");
    const serviceFilePath = `/etc/systemd/system/tomcat-${tomcatVersion}.service`;
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
    fs.writeFileSync(serviceFilePath, serviceFileContent);

    // Reload systemd and start Tomcat
    console.log("🔄 Reloading systemd and starting Tomcat...");
    await runCommand(`sudo systemctl daemon-reload`);
    await runCommand(`sudo systemctl enable tomcat-${tomcatVersion}`);
    await runCommand(`sudo systemctl restart tomcat-${tomcatVersion}`);

    console.log(`✅ Tomcat rollback to ${tomcatVersion} completed successfully.`);
}

// Main rollback function
async function rollback() {
    try {
        console.log("🔄 Starting rollback process...");

        // Get last upgrade version to rollback to
        const lastUpgrade = await getRollbackVersion();
        if (!lastUpgrade) {
            console.error("🚨 No upgrade versions found. Cannot rollback.");
            return;
        }

        const { java: rollbackJavaVersion, tomcat: rollbackTomcatVersion } = lastUpgrade;

        console.log(`🔄 Rolling back Java to ${rollbackJavaVersion} and Tomcat to ${rollbackTomcatVersion}...`);

        await rollbackJava(rollbackJavaVersion);
        await rollbackTomcat(rollbackTomcatVersion);

        console.log("✅ Rollback process completed successfully.");
    } catch (error) {
        console.error("🚨 Rollback failed:", error);
    }
}

module.exports = { rollback, rollbackJava, rollbackTomcat };
