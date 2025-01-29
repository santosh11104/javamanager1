#!/usr/bin/env node

const { execSync } = require("child_process");
const { Command } = require("commander");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Logging setup
const logFilePath = path.join(__dirname, "java-manager.log");
function log(message, level = "info") {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  fs.appendFileSync(logFilePath, logMessage);
  if (level === "error" || level === "warn") {
    console[level](logMessage.trim());
  }
}

// Read user input in terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Dynamically load ora
async function loadOra() {
  const ora = (await import("ora")).default;
  return ora;
}

const program = new Command();
program.version("1.3.0");

/**
 * Executes a shell command and returns stdout as a string.
 */
const executeCommand = (command) => {
  try {
    const result = execSync(command, { stdio: "pipe" }).toString().trim();
    log(`Command executed: ${command}`);
    return result;
  } catch (error) {
    log(`Command failed: ${command} - ${error.message}`, "error");
    return null;
  }
};

/**
 * Fetches the currently active Java version.
 */
const getCurrentJavaVersion = () => {
  const output = executeCommand("java -version 2>&1 | grep 'version' | awk '{print $3}' | tr -d '\"'");
  return output || "None";
};

/**
 * Fetches available OpenJDK versions from the package manager.
 */
const getAvailableJavaVersions = () => {
  const availableVersions = executeCommand("apt-cache search openjdk | grep 'openjdk-[0-9]*-jdk' | awk '{print $1}'");
  if (!availableVersions) {
    return [];
  }
  return availableVersions.split("\n").map(pkg => pkg.replace("openjdk-", "").replace("-jdk", ""));
};

/**
 * Updates the default system Java version.
 */
const setDefaultJavaVersion = (version) => {
  executeCommand(`sudo update-alternatives --set java /usr/lib/jvm/java-${version}-openjdk-amd64/bin/java`);
  executeCommand("source ~/.bashrc");
  log(`Default Java version set to OpenJDK ${version}.`);
};

/**
 * Installs a specific Java version after user confirmation.
 */
 /**
 * Installs a specific Java version (or default version if none is provided).
 */
 /**
 * Installs a specific Java version (or default version if none is provided).
 */
 /**
 * Installs a specific Java version (or default version if none is provided).
 */
async function installJava(version) {
  const ora = await loadOra();

  // Set default version if none is provided
  if (!version) {
    version = "11"; // Default to OpenJDK 11
    console.log(`⚠ No Java version specified. Installing default version: OpenJDK ${version}...`);
    log(`No version specified. Installing default Java version: ${version}.`);
  }

  const spinner = ora(`Checking if OpenJDK ${version} is already installed...`).start();

  // Check if the version is already installed
  const installedVersions = executeCommand("update-java-alternatives -l 2>/dev/null || true");
  if (installedVersions.includes(`java-1.${version}.0-openjdk-amd64`)) {
    spinner.fail(`OpenJDK ${version} is already installed.`);
    log(`OpenJDK ${version} is already installed. Skipping installation.`, "warn");
    console.log(`⚠ OpenJDK ${version} is already installed. Skipping installation.`);
    process.exit(1);
  }

  spinner.text = `Checking if OpenJDK ${version} is available for installation...`;

  // Check if the version is valid in the package list
  const availableVersions = executeCommand("apt-cache search openjdk | grep jdk | awk '{print $1}'");
  if (!availableVersions.includes(`openjdk-${version}-jdk`)) {
    spinner.fail(`OpenJDK ${version} is not available.`);
    log(`OpenJDK ${version} is not available for installation.`, "error");
    process.exit(1);
  }

  spinner.text = `Installing OpenJDK ${version}...`;

  try {
    executeCommand(`sudo apt update`);
    executeCommand(`sudo apt install -y openjdk-${version}-jdk`);

    // Set JAVA_HOME and PATH
    const javaPath = `/usr/lib/jvm/java-${version}-openjdk-amd64`;
    executeCommand(`echo 'export JAVA_HOME=${javaPath}' >> ~/.bashrc`);
    executeCommand(`echo 'export PATH=$JAVA_HOME/bin:$PATH' >> ~/.bashrc`);

    // Apply changes immediately
    executeCommand(`source ~/.bashrc`);

    spinner.succeed(`OpenJDK ${version} installed successfully!`);
    log(`OpenJDK ${version} installed successfully.`);

    // Verify installation
    const installedVersion = executeCommand("java -version 2>&1");
    console.log(`\n✅ Java installed successfully! Current version:\n${installedVersion}`);
  } catch (error) {
    spinner.fail(`Failed to install OpenJDK ${version}.`);
    log(`Failed to install OpenJDK ${version}: ${error.message}`, "error");
    process.exit(1);
  }
}




/**
 * Proceeds with Java installation, updates system path, and handles rollback.
 */
async function proceedWithInstallation(newVersion, oldVersion) {
  const ora = await loadOra();
  const spinner = ora(`Installing OpenJDK ${newVersion}...`).start();

  try {
    executeCommand("sudo apt update");
    executeCommand(`sudo apt install -y openjdk-${newVersion}-jdk`);

    // Set as default Java version
    setDefaultJavaVersion(newVersion);

    spinner.succeed(`OpenJDK ${newVersion} installed successfully!`);
    log(`OpenJDK ${newVersion} installed successfully.`);
  } catch (error) {
    spinner.fail(`Failed to install OpenJDK ${newVersion}. Rolling back to ${oldVersion}...`);
    log(`Installation failed: ${error.message}. Rolling back to ${oldVersion}.`, "error");

    if (oldVersion) {
      setDefaultJavaVersion(oldVersion);
      log(`Rolled back to OpenJDK ${oldVersion}.`);
    }
    process.exit(1);
  }
}

/**
 * Uninstalls a specific Java version.
 */
 /**
 * Uninstalls a specific Java version.
 */
 /**
 * Uninstalls a specific Java version.
 */
/**
 * Uninstalls a specific Java version.
 */
 /**
 * Uninstalls a specific Java version.
 */
 /**
 * Uninstalls a specific Java version.
 */
async function uninstallJava(version) {
  const ora = await loadOra();
  const spinner = ora(`Checking if OpenJDK ${version} is installed...`).start();

  // Try to get installed Java versions
  let installedAlternatives;
  try {
    installedAlternatives = executeCommand("update-java-alternatives -l");
  } catch (error) {
    spinner.fail("Failed to retrieve installed Java versions using update-java-alternatives.");
    log("update-java-alternatives failed. Falling back to dpkg.", "warn");
  }

  const installedPackages = executeCommand("dpkg --list | grep openjdk");

  // Check if dpkg command failed
  if (!installedPackages) {
    spinner.fail("Failed to retrieve installed Java versions.");
    log("Failed to retrieve installed Java versions.", "error");
    process.exit(1);
  }

  // Determine package naming format
  const javaJdkPackage = `openjdk-${version}-jdk`;
  const javaJrePackage = `openjdk-${version}-jre`;
  const javaJreHeadlessPackage = `openjdk-${version}-jre-headless`;

  // Check if the version exists in installed packages
  if (!installedPackages.includes(javaJdkPackage) && !installedPackages.includes(javaJrePackage)) {
    spinner.fail(`OpenJDK ${version} is not installed.`);
    log(`OpenJDK ${version} is not installed, skipping removal.`, "warn");
    process.exit(1);
  }

  // Start uninstallation
  spinner.text = `Uninstalling OpenJDK ${version}...`;
  try {
    executeCommand(`sudo apt remove --purge -y ${javaJdkPackage} ${javaJrePackage} ${javaJreHeadlessPackage}`);
    executeCommand("sudo apt autoremove -y");

    // Clean up JVM directory if it exists
    const javaPaths = [
      `/usr/lib/jvm/java-${version}-openjdk-amd64`,
      `/usr/lib/jvm/java-${version}-openjdk`,
      `/usr/lib/jvm/java-${version}`
    ];

    javaPaths.forEach((path) => {
      if (fs.existsSync(path)) {
        executeCommand(`sudo rm -rf ${path}`);
      }
    });

    spinner.succeed(`OpenJDK ${version} uninstalled successfully!`);
    log(`OpenJDK ${version} uninstalled successfully.`);
  } catch (error) {
    spinner.fail(`Failed to uninstall OpenJDK ${version}.`);
    log(`Failed to uninstall OpenJDK ${version}: ${error.message}`, "error");
    process.exit(1);
  }
}





/**
 * Lists installed Java versions.
 */
async function listInstalledJavaVersions() {
  const ora = await loadOra();
  const spinner = ora("Checking installed Java versions...").start();

  try {
    const versions = executeCommand("update-java-alternatives -l");
    if (versions) {
      spinner.succeed("Installed Java versions:");
      console.log(versions);
      log("Installed Java versions listed successfully.");
    } else {
      spinner.fail("No Java versions found.");
      log("No Java versions found.", "warn");
    }
  } catch (error) {
    spinner.fail("Failed to retrieve Java versions.");
    log("Failed to retrieve Java versions.", "error");
    process.exit(1);
  }
}

 
 /**
 * Lists all installed Java versions on the system by looking at the directory.
 */
async function listJavaVersions(){
  const ora = await loadOra();
  const spinner = ora("Checking installed Java versions...").start();

  try {
    // List Java versions by looking in the /usr/lib/jvm directory
    const versions = executeCommand("ls /usr/lib/jvm | grep -E 'java|openjdk'");

    if (versions) {
      spinner.succeed("Installed Java versions:");
      console.log(versions);
      log("Installed Java versions listed successfully.");
    } else {
      spinner.fail("No Java versions found.");
      log("No Java versions found.", "warn");
    }
  } catch (error) {
    spinner.fail("Failed to retrieve Java versions.");
    log("Failed to retrieve Java versions.", "error");
    process.exit(1);
  }
};


/**
 * Removes all Java installations from the system.
 */
async function removeAllJavaInstallations(){
  const ora = await loadOra();  // Load ora dynamically
  const spinner = ora("Removing all Java installations...").start();

  try {
    // Uninstall all openjdk packages using apt-get
    const aptRemoveCommand = `sudo apt-get purge --auto-remove -y openjdk-*`;
    executeCommand(aptRemoveCommand);
    log("Uninstalled all OpenJDK packages.");

    // Clean up Java-related files from /usr/lib/jvm
    const removeJVMCommand = `sudo rm -rf /usr/lib/jvm/*`;
    executeCommand(removeJVMCommand);
    log("Removed all Java-related files from /usr/lib/jvm.");

    // Remove any environment variables related to JAVA_HOME
    const removeEnvCommand = `sed -i '/export JAVA_HOME/d' ~/.bashrc && sed -i '/export PATH=.*JAVA_HOME.*/d' ~/.bashrc`;
    executeCommand(removeEnvCommand);
    log("Removed Java environment variables from ~/.bashrc.");

    // Refresh bashrc to apply changes
    executeCommand("source ~/.bashrc");
    log("Refreshed shell environment.");

    spinner.succeed("All Java installations removed successfully.");
  } catch (error) {
    spinner.fail("Failed to remove all Java installations.");
    log("Failed to remove all Java installations: " + error.message, "error");
    process.exit(1);
  }
};


// CLI Commands for my use
program
  .command("install-java")
  .description("Install a specific Java version")
  .option("-v, --version <version>", "Specify Java version (e.g., 11, 17, 20)")
  .action((options) => installJava(options.version));

program
  .command("uninstall-java")
  .description("Uninstall a specific Java version")
  .option("-v, --version <version>", "Specify Java version to remove")
  .action((options) => uninstallJava(options.version));

/*program
  .command("list-java")
  .description("List installed Java versions")
  .action(() => listInstalledJavaVersions());
  */

  program
  .command("list-java")
  .description("List all installed Java versions")
  .action(() => listJavaVersions());  

  program
  .command("remove-all-java")
  .description("Remove all Java installations from the system")
  .action(() => removeAllJavaInstallations());
program.parse(process.argv);
