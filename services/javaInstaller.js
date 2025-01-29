const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ENV_BACKUP_PATH = path.join(__dirname, "../logs/javaEnvBackup.json");

const javaInstaller = {
  async getStatus() {
    try {
      const version = execSync("java -version 2>&1").toString();
      const javaHome = process.env.JAVA_HOME || "Not set";
      const pathEnv = process.env.PATH;
      return { javaVersion: version.trim(), JAVA_HOME: javaHome, PATH: pathEnv };
    } catch {
      return { javaVersion: "Not installed", JAVA_HOME: "Not set", PATH: "Not set" };
    }
  },

  backupEnvironmentVariables() {
    const javaHome = process.env.JAVA_HOME || "";
    const pathEnv = process.env.PATH || "";

    fs.writeFileSync(ENV_BACKUP_PATH, JSON.stringify({ JAVA_HOME: javaHome, PATH: pathEnv }, null, 2));
    console.log("Java environment variables backed up.");
  },

  restoreEnvironmentVariables() {
    if (!fs.existsSync(ENV_BACKUP_PATH)) {
      throw new Error("No backup of environment variables found.");
    }

    const backup = JSON.parse(fs.readFileSync(ENV_BACKUP_PATH, "utf8"));
    const { JAVA_HOME, PATH } = backup;

    // Update session environment variables
    process.env.JAVA_HOME = JAVA_HOME;
    process.env.PATH = PATH;

    // Persist to `/etc/environment` or user-specific profile
    this.updateEnvironmentFile(JAVA_HOME, PATH);

    console.log("Environment variables restored to backup.");
  },

  updateEnvironmentFile(javaHome, pathEnv) {
    const environmentFile = "/etc/environment";

    try {
      const content = fs.readFileSync(environmentFile, "utf8");
      const updatedContent = content
        .replace(/JAVA_HOME=.*\n?/, `JAVA_HOME="${javaHome}"\n`)
        .replace(/PATH=.*\n?/, `PATH="${pathEnv}"\n`);
      fs.writeFileSync(environmentFile, updatedContent);
      console.log("Environment file updated.");
    } catch (error) {
      console.error("Failed to update environment file:", error);
      throw new Error("Environment file update failed.");
    }
  },

  async install(version) {
    console.log(`Installing Java version: ${version}`);
    const javaPath = `/usr/lib/jvm/java-${version}-openjdk-amd64`;

    execSync(`sudo apt update && sudo apt install -y openjdk-${version}-jdk`);
    process.env.JAVA_HOME = javaPath;
    process.env.PATH = `${javaPath}/bin:${process.env.PATH}`;

    // Update system environment file
    this.updateEnvironmentFile(javaPath, process.env.PATH);
  },

  async upgrade(version) {
    try {
      // Backup current environment variables
      this.backupEnvironmentVariables();

      // Install the new Java version
      await this.install(version);

      // Verify the new Java version
      const newVersion = execSync("java -version 2>&1").toString();
      console.log(`Java successfully upgraded to: ${newVersion}`);
    } catch (error) {
      console.error("Java upgrade failed:", error);

      // Rollback environment variables and rethrow error
      this.restoreEnvironmentVariables();
      throw new Error("Java upgrade failed. Rolled back to the previous environment.");
    }
  },

  async rollback() {
    console.log("Rolling back Java installation...");
    this.restoreEnvironmentVariables();

    const backupVersion = JSON.parse(fs.readFileSync(ENV_BACKUP_PATH, "utf8")).JAVA_HOME;
    if (backupVersion) {
      const versionNumber = backupVersion.match(/java-(\d+)/)?.[1];
      if (versionNumber) {
        execSync(`sudo apt install -y openjdk-${versionNumber}-jdk`);
        console.log(`Rolled back to Java version: ${versionNumber}`);
      } else {
        throw new Error("Could not determine Java version for rollback.");
      }
    } else {
      throw new Error("No backup Java version found.");
    }
  },
};

module.exports = javaInstaller;
