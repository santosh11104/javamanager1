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
      console.log(
        `Backup already exists at ${destination}. Removing existing backup...`
      );
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
async function checkAndSetPreviousVersions(config) {
  const versionsFilePath = path.join(__dirname, "previous_versions.json");

  try {
    let previousVersions = { java: null, tomcat: null };

    if (fs.existsSync(versionsFilePath)) {
      previousVersions = JSON.parse(fs.readFileSync(versionsFilePath, "utf-8"));
    } else {
      console.log(
        "No previous versions file found. Creating one with null values."
      );
      fs.writeFileSync(
        versionsFilePath,
        JSON.stringify(
          {
            java: null,
            tomcat: null,
          },
          null,
          2
        )
      );
    }

    const javaVersionMatches =
      previousVersions.java === config.mave.dependencies.java.version;
    const tomcatVersionMatches =
      previousVersions.tomcat === config.mave.dependencies.tomcat.version;

    if (
      javaVersionMatches &&
      tomcatVersionMatches &&
      previousVersions.java !== null &&
      previousVersions.tomcat !== null
    ) {
      console.log("Java and Tomcat versions match. No upgrade needed.");
      return true; // Versions match, skip upgrade
    } else if (
      previousVersions.java === null ||
      previousVersions.tomcat === null
    ) {
      console.log(
        "Java or Tomcat not previously installed. Proceeding with installation."
      );
      return false; // Install needed if file was just created or if versions are null
    } else if (!javaVersionMatches || !tomcatVersionMatches) {
      console.warn(
        "Previous Java/Tomcat versions are different from current versions in config file."
      );
      console.warn(
        "Please ensure your config file is correct or run rollback if needed."
      );
      return false; // Versions don't match, proceed with upgrade
    } else {
      return false;
    }
  } catch (error) {
    console.error("Error checking or setting previous versions:", error);
    throw error;
  }
}
async function upgradeJava(javaVersion, javaUrl, previousJavaVersion) {
  if (javaVersion === previousJavaVersion && previousJavaVersion !== null) {
    // Check for null
    console.log(
      `Java version ${javaVersion} is already installed. Skipping upgrade.`
    );
    return;
  }
  const javaDir = `/opt/openjdk-${javaVersion}`;
  const tempTarFile = `/tmp/java-${javaVersion}.tar.gz`;
  const previousJavaDir = `/opt/openjdk-${previousJavaVersion}`;
  const javaBackupsDir = `/opt/java_backups`; // Directory for Java backups

  try {
    await runCommand(`sudo mkdir -p ${javaBackupsDir}`); // Create backups directory if it doesn't exist

    if (fs.existsSync(previousJavaDir)) {
      const backupDest = path.join(
        javaBackupsDir,
        `openjdk-${previousJavaVersion}`
      ); // Full backup path
      await createBackup(previousJavaDir, backupDest);
      await runCommand(`sudo rm -rf ${previousJavaDir}`); // Remove after successful backup
    } else {
      console.log("No previous Java installation found. Skipping backup.");
    }

    console.log(`🚀 Upgrading Java ${javaVersion} from ${javaUrl}...`);

    await runCommand(`sudo apt update`);
    await runCommand(`sudo apt install -y wget`);
    await runCommand(`sudo mkdir -p /opt`); // This is outside the subshell

    await runCommand(`sudo wget -q "${javaUrl}" -O "${tempTarFile}"`);
    await runCommand(`sudo tar -xzf "${tempTarFile}" -C /opt`);

    const extractedFolder = await runCommand(
      `ls /opt | grep 'jdk-' | head -n 1`
    );
    if (!extractedFolder) {
      throw new Error("Could not find extracted JDK folder.");
    }
    await runCommand(`sudo rm -rf "${javaDir}"`); // Remove existing Java directory
    // *** The crucial fix: Create the javaDir *inside* the subshell
    await runCommand(`sudo mkdir -p "${javaDir}"`); // Create the target directory

    // *** The subshell and process substitution fix ***
    const moveCommand = `
          sudo tar -xzf "${tempTarFile}" -C /opt &&
          extracted_folder=$(ls /opt | grep 'jdk-' | head -n 1) &&
          if [ -z "$extracted_folder" ]; then
            echo "Error: Could not find extracted JDK folder."
            exit 1
          fi &&
          sudo mv /opt/"$extracted_folder"/* "${javaDir}" &&
          sudo rm -rf /opt/"$extracted_folder"
        `;

    await runCommand(moveCommand); // Run the combined command

    await runCommand(`rm -f ${tempTarFile}`);

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

async function upgradeTomcat(
  tomcatVersion,
  tomcatUrl,
  previousTomcatVersion,
  javaVersion
) {
  if (
    tomcatVersion === previousTomcatVersion &&
    previousTomcatVersion !== null
  ) {
    // Check for null
    console.log(
      `Tomcat version ${tomcatVersion} is already installed. Skipping upgrade.`
    );
    return;
  }
  const tomcatDir = `/opt/tomcat-${tomcatVersion}`;
  const tempTarFile = `/tmp/tomcat-${tomcatVersion}.tar.gz`;
  const serviceFilePath = `/etc/systemd/system/tomcat-${tomcatVersion}.service`;
  const tomcatBackupsDir = `/opt/tomcat_backups`;

  try {
    await runCommand(`sudo mkdir -p ${tomcatBackupsDir}`);

    const previousTomcatDir = `/opt/tomcat-${previousTomcatVersion}`; // Store path in variable

    if (fs.existsSync(previousTomcatDir)) {
      const backupDest = path.join(
        tomcatBackupsDir,
        `tomcat-${previousTomcatVersion}`
      );
      await createBackup(previousTomcatDir, backupDest);
      await runCommand(`sudo rm -rf ${previousTomcatDir}`);
    } else {
      console.warn(
        `Previous Tomcat version ${previousTomcatVersion} not found. Skipping backup and removal.`
      );
    }

    console.log(`🚀 Upgrading Tomcat ${tomcatVersion} from ${tomcatUrl}...`);

    await runCommand("sudo systemctl stop tomcat* || true");
    await runCommand(
      "sudo rm -rf /opt/tomcat-* /usr/share/tomcat-* /var/lib/tomcat-* /etc/tomcat-*"
    );

    await runCommand("sudo apt update");
    await runCommand("sudo apt install -y wget");
    await runCommand(`sudo mkdir -p ${tomcatDir}`);
    await runCommand(`sudo wget -q ${tomcatUrl} -O ${tempTarFile}`);
    await runCommand(
      `sudo tar -xzf "${tempTarFile}" -C "${tomcatDir}" --strip-components=1`
    );
    await runCommand(`rm -f ${tempTarFile}`);

    await runCommand(
      "sudo adduser --system --no-create-home --group tomcat || true"
    );
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

    await runCommand(`sudo tee ${serviceFilePath} <<< "${serviceFileContent}"`);
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

    const versionsMatch = await checkAndSetPreviousVersions(config);

    if (versionsMatch) {
        console.log("No upgrade needed. Exiting.");
        return;
    }

    const currentJavaVersion = config.mave.dependencies.java.version;
    const currentJavaUrl = config.mave.dependencies.java.packageUrlUnix;
    const currentTomcatVersion = config.mave.dependencies.tomcat.version;
    const currentTomcatUrl = config.mave.dependencies.tomcat.packageUrlUnix;

    console.log("Backing up current versions (if available)...");
    const previousVersionsFilePath = path.join(__dirname, "previous_versions.json");

        let previousVersions = { install: { java: null, tomcat: null }, upgrade: [] }; // Default

        try {
            if (fs.existsSync(previousVersionsFilePath)) {
                const fileData = fs.readFileSync(previousVersionsFilePath, "utf-8");
                previousVersions = JSON.parse(fileData);

                // *** The crucial fix: Ensure previousVersions.upgrade is an array ***
                previousVersions.upgrade = previousVersions.upgrade || []; // Initialize if it is undefined
                previousVersions.install = previousVersions.install || { java: null, tomcat: null }; // Initialize if it is undefined
            }
        } catch (parseError) {
            console.warn("Error parsing previous_versions.json. Using default structure.", parseError);
        }

      console.log("Performing upgrade...");

      const javaUpgradeNeeded = currentJavaVersion !== previousVersions.install?.java;
        const tomcatUpgradeNeeded = currentTomcatVersion !== previousVersions.install?.tomcat;



      await upgradeJava(currentJavaVersion, currentJavaUrl, previousVersions.install?.java);
      await upgradeTomcat(currentTomcatVersion, currentTomcatUrl, previousVersions.install?.tomcat, currentJavaVersion);

      console.log("Upgrade completed successfully!");

      if (javaUpgradeNeeded || tomcatUpgradeNeeded) {
        const newConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        const upgradedVersions = {
            java: newConfig.mave.dependencies.java.version,
            tomcat: newConfig.mave.dependencies.tomcat.version
        };

        previousVersions.upgrade.push(upgradedVersions); // Now safe to push
        previousVersions.install = { ...upgradedVersions };

        console.log("Updating previous_versions.json...");
        fs.writeFileSync(previousVersionsFilePath, JSON.stringify(previousVersions, null, 2));
        console.log("previous_versions.json updated.");
    } else {
        console.log("No actual upgrade performed, skipping previous_versions.json update.");
    }

} catch (error) {
    console.error("Upgrade failed:", error);
}
}

module.exports = { upgrade };
