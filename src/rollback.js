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

async function createBackup(source, destination) {
    try {
        if (fs.existsSync(destination)) {
            console.log(`Backup already exists at ${destination}. Removing existing backup...`);
            await runCommand(`sudo rm -rf ${destination}`);
        }
        console.log(`Creating backup: ${source} -> ${destination}`);
        await runCommand(`sudo cp -r ${source} ${destination}`);
    } catch (error) {
        console.error(`Backup creation failed: ${error}`);
        throw error;
    }
}

async function getCurrentJavaVersion() {
    try {
        const javaHome = await runCommand("echo $JAVA_HOME");
        if (!javaHome) return null;
        const javaVersionMatch = javaHome.match(/openjdk-(\d+(?:\.\d+)*)/); // Improved regex
        return javaVersionMatch ? javaVersionMatch[1] : null;

    } catch (error) {
        console.error("Error getting current Java version:", error);
        return null;
    }
}

async function getCurrentTomcatVersion() {
    try {
        const catalinaHome = await runCommand("echo $CATALINA_HOME");
        if (!catalinaHome) return null;

        const versionMatch = catalinaHome.match(/tomcat-(\d+(?:\.\d+)*)/);  // Improved regex

        return versionMatch ? versionMatch[1] : null;

    } catch (error) {
        console.error("Error getting current Tomcat version:", error);
        return null;
    }
}


async function rollbackJava(javaVersion) {
    return new Promise(async (resolve, reject) => {
        const currentJavaVersion = await getCurrentJavaVersion();

        if (currentJavaVersion === javaVersion) {
            console.log(`Java ${javaVersion} is already installed. Skipping rollback.`);
            return resolve(false); // Resolve with false (skipped)
        }

        console.log(`Rolling back to Java ${javaVersion}...`);

        const javaBackupDir = `/opt/java_backups/openjdk-${javaVersion}`;
        const javaDir = `/opt/openjdk-${javaVersion}`;

        if (!fs.existsSync(javaBackupDir)) {
            console.error(`Java backup for version ${javaVersion} not found!`);
            return reject(new Error(`Java backup for version ${javaVersion} is missing.`));
        }

        try {
            // ... (Java rollback logic - same as before)
            console.log(`Java rollback to ${javaVersion} successful.`);
            resolve(true); // Resolve with true (success)
        } catch (error) {
            console.error(`Java rollback failed: ${error}`);
            reject(error);
        }
    });
}

async function rollbackTomcat(tomcatVersion) {
    return new Promise(async (resolve, reject) => {
        const currentTomcatVersion = await getCurrentTomcatVersion();

        if (currentTomcatVersion === tomcatVersion) {
            console.log(`Tomcat ${tomcatVersion} is already installed. Skipping rollback.`);
            return resolve(false); // Resolve with false (skipped)
        }

        console.log(`Rolling back to Tomcat ${tomcatVersion}...`);

        const tomcatBackupDir = `/opt/tomcat_backups/tomcat-${tomcatVersion}`;
        const tomcatDir = `/opt/tomcat-${tomcatVersion}`;

        if (!fs.existsSync(tomcatBackupDir)) {
            console.error(`Tomcat backup for version ${tomcatVersion} not found!`);
            return reject(new Error(`Tomcat backup for version ${tomcatVersion} is missing.`));
        }

        try {
            // ... (Tomcat rollback logic - same as before)
            console.log(`Tomcat rollback to ${tomcatVersion} successful.`);
            resolve(true); // Resolve with true (success)
        } catch (error) {
            console.error(`Tomcat rollback failed: ${error}`);
            reject(error);
        }
    });
}

async function rollback() {
    try {
        console.log("Starting rollback process...");

        const configPath = path.join(__dirname, "mavee_config_rollback.json");

        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found: ${configPath}`);
        }

        const configData = fs.readFileSync(configPath, "utf-8");
        let config;

        try {
            config = JSON.parse(configData);
        } catch (parseError) {
            console.error("Error parsing JSON:", parseError);
            return;
        }

        if (!config.mave || !config.mave.dependencies || !config.mave.dependencies.java || !config.mave.dependencies.tomcat) {
            console.error("Invalid config file format. Please check the structure.");
            return;
        }

        const javaVersion = config.mave.dependencies.java.version;
        const tomcatVersion = config.mave.dependencies.tomcat.version;

        console.log("Java Version to rollback to:", javaVersion);
        console.log("Tomcat Version to rollback to:", tomcatVersion);

        const javaRollbackResult = await rollbackJava(javaVersion);

        let tomcatRollbackResult = false; // Initialize to false (assume skipped)

        if (javaRollbackResult === true) { // Only if Java rollback was actually PERFORMED
            tomcatRollbackResult = await rollbackTomcat(tomcatVersion);
        } else {
            console.log("Java rollback was skipped."); // Explicit message when Java skipped
        }
        console.log(`javaVersionhere ${tomcatVersion}`);
        if (tomcatRollbackResult === false) {
            console.log("Tomcat rollback was skipped."); // Explicit message when Tomcat skipped
        }

        if (javaRollbackResult === false && tomcatRollbackResult === false) {
            console.log("Both Java and Tomcat rollbacks were skipped.");
        }

        config.mave.dependencies.java.version = javaVersion;
        config.mave.dependencies.tomcat.version = tomcatVersion;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

        console.log("Rollback process finished.");

    } catch (error) {
        console.error("Rollback failed:", error);
    }
}

module.exports = { rollback, rollbackJava, rollbackTomcat };