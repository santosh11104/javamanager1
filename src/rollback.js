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

// Get the first upgrade version from previous_versions.json for rollback
async function getRollbackVersion() {
    const versionsFilePath = path.join(__dirname, "previous_versions.json");

    if (!fs.existsSync(versionsFilePath)) {
        throw new Error("🚨 previous_versions.json not found! Cannot rollback.");
    }

    let previousVersions = JSON.parse(fs.readFileSync(versionsFilePath, "utf-8"));

    if (!previousVersions.upgrade || previousVersions.upgrade.length <= 1) {
        console.error("🚨 Rollback aborted! At least two upgrade versions are required.");
        return null;
    }

    // Get the first upgrade entry to rollback
    const rollbackVersion = previousVersions.upgrade[0]; // First item

    // Remove the last upgrade entry from the array
    previousVersions.upgrade.pop();

    // Save updated previous_versions.json
    fs.writeFileSync(versionsFilePath, JSON.stringify(previousVersions, null, 2));

    return rollbackVersion; // { java: "19", tomcat: "10.1.35" }
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
    const serviceFilePath = `/etc/systemd/system/tomcat-${tomcatVersion}.service`;

    // 🔎 If Tomcat already exists, skip restoration
    if (fs.existsSync(tomcatDir)) {
        console.log(`✅ Tomcat ${tomcatVersion} already exists in /opt/. Skipping restoration.`);
    } else {
        if (!fs.existsSync(tomcatBackupDir)) {
            console.error(`🚨 Tomcat backup for version ${tomcatVersion} not found!`);
            throw new Error(`Tomcat backup for version ${tomcatVersion} is missing.`);
        }

        // Stop all running Tomcat services
        console.log("🛑 Stopping all Tomcat services...");
        await runCommand(`sudo systemctl stop tomcat* || true`);
        await runCommand(`sudo systemctl disable tomcat* || true`);

        // Remove all other Tomcat versions
        console.log("🗑️ Removing all other Tomcat versions...");
        await runCommand(`sudo rm -rf /opt/tomcat-* /usr/share/tomcat-* /var/lib/tomcat-* /etc/tomcat-*`);

        // Restore Tomcat from backup
        console.log(`♻️ Restoring Tomcat ${tomcatVersion} from backup...`);
        await runCommand(`sudo cp -r ${tomcatBackupDir} ${tomcatDir}`);
    }

    // Set correct permissions
    console.log("🔧 Setting Tomcat user permissions...");
    await runCommand(`sudo chown -R tomcat:tomcat ${tomcatDir}`);
    await runCommand(`sudo chmod -R 755 ${tomcatDir}`);
    await runCommand(`sudo chmod -R +x ${tomcatDir}/bin/*.sh`);

    // Restore Tomcat systemd service
    console.log("⚙️ Restoring Tomcat systemd service...");
    const serviceFileContent = `
[Unit]
Description=Apache Tomcat ${tomcatVersion}
After=network.target

[Service]
User=tomcat
Group=tomcat
Environment="JAVA_HOME=/opt/openjdk-${tomcatVersion}"
Environment="CATALINA_HOME=${tomcatDir}"
ExecStart=${tomcatDir}/bin/startup.sh
ExecStop=${tomcatDir}/bin/shutdown.sh
Restart=always

[Install]
WantedBy=multi-user.target
`;
    fs.writeFileSync(serviceFilePath, serviceFileContent);

    // Reload systemd, enable, and start Tomcat
    console.log("🔄 Reloading systemd and starting Tomcat...");
    await runCommand(`sudo systemctl daemon-reload`);
    await runCommand(`sudo systemctl enable tomcat-${tomcatVersion}`);
    await runCommand(`sudo systemctl restart tomcat-${tomcatVersion}`);

    // Ensure Tomcat service is running
    console.log("🟢 Checking Tomcat service status...");
    let serviceStatus;
    try {
        serviceStatus = await runCommand(`sudo systemctl is-active tomcat-${tomcatVersion}`);
    } catch (error) {
        console.warn("⚠️ Tomcat service is inactive or failed. Attempting manual start...");
        await runCommand(`sudo ${tomcatDir}/bin/catalina.sh start`);
    }

    console.log(`✅ Tomcat ${tomcatVersion} rollback completed successfully.`);
}


// Main rollback function
async function rollback() {
    try {
        console.log("🔄 Starting rollback process...");

        // Get first upgrade version to rollback to
        const rollbackVersion = await getRollbackVersion();
        if (!rollbackVersion) {
            console.error("🚨 No upgrade versions found. Cannot rollback.");
            return;
        }

        const { java: rollbackJavaVersion, tomcat: rollbackTomcatVersion } = rollbackVersion;

        console.log(`🔄 Rolling back Java to ${rollbackJavaVersion} and Tomcat to ${rollbackTomcatVersion}...`);

        await rollbackJava(rollbackJavaVersion);
        await rollbackTomcat(rollbackTomcatVersion);

        console.log("✅ Rollback process completed successfully.");
    } catch (error) {
        console.error("🚨 Rollback failed:", error);
    }
}

module.exports = { rollback, rollbackJava, rollbackTomcat };
