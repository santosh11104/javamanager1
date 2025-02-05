const { execSync } = require("child_process");
const axios = require("axios");
const { logError, logInfo } = require("./utils");
const { installJava, installTomcat } = require("./installer");

const JAVA_BACKUP_DIR = "/opt/java_backup";

async function getRequiredVersions() {
  try {
    const response = await axios.get("http://mavee-api.local/version");
    return response.data;
  } catch (error) {
    logError("Failed to fetch required versions", error);
    return null;
  }
}

function backupJava() {
  logInfo("Backing up current Java version...");
  try {
    execSync(`sudo mkdir -p ${JAVA_BACKUP_DIR}`);
    execSync(`sudo cp -r /usr/lib/jvm/* ${JAVA_BACKUP_DIR}/`, { stdio: "inherit" });
  } catch (error) {
    logError("Failed to backup Java", error);
  }
}

function rollbackJava() {
  logInfo("Rolling back Java...");
  try {
    execSync(`sudo rm -rf /usr/lib/jvm/*`);
    execSync(`sudo cp -r ${JAVA_BACKUP_DIR}/* /usr/lib/jvm/`, { stdio: "inherit" });
    logInfo("Java rollback completed.");
  } catch (error) {
    logError("Failed to rollback Java", error);
  }
}

async function upgradeJavaAndTomcat() {
  const requiredVersions = await getRequiredVersions();
  if (!requiredVersions) return;

  logInfo("Upgrading Java and Tomcat...");
  backupJava();

  installJava(requiredVersions.java);
  try {
    execSync("sudo systemctl stop tomcat", { stdio: "inherit" });
    installTomcat(requiredVersions.tomcat);
    execSync("sudo systemctl start tomcat", { stdio: "inherit" });
    logInfo("Tomcat upgrade successful.");
  } catch (error) {
    logError("Tomcat upgrade failed, rolling back Java", error);
    rollbackJava();
  }
}

module.exports = { upgradeJavaAndTomcat };
