const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * Executes a shell command and returns a Promise.
 */
function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error: ${stderr || error.message}`);
        return reject(error);
      }
      console.log(`✅ Success: ${stdout.trim()}`);
      resolve(stdout.trim());
    });
  });
}

/**
 * Uninstalls Java by removing its installation directory and cleaning up environment variables.
 */
async function uninstallJava() {
  console.log("🚀 Uninstalling Java...");

  try {
    const commands = [
      "sudo rm -rf /opt/openjdk-*", // Remove all Java installations in /opt
      "sudo rm -rf /opt/java_backups", // Remove Java backups
      "sudo sed -i '/JAVA_HOME/d' /etc/environment", // Remove JAVA_HOME from system environment
      "sudo sed -i '/JAVA_HOME/d' /etc/profile",
      "sed -i '/JAVA_HOME/d' ~/.bashrc",
      "sed -i '/JAVA_HOME/d' ~/.bash_profile",
      "sed -i '/JAVA_HOME/d' ~/.zshrc || true",
      "unset JAVA_HOME", // Unset JAVA_HOME for current session
      ". /etc/environment && . ~/.bashrc" // Reload environment variables
    ];

    await runCommand(commands.join(" && "));
    console.log("✅ Java uninstalled successfully.");
  } catch (error) {
    console.error("❌ Java uninstallation failed.");
  }
}

/**
 * Uninstalls Tomcat by stopping services, removing files, and cleaning up environment variables.
 */
async function uninstallTomcat() {
  console.log("🚀 Uninstalling Tomcat...");

  try {
    // Stop and disable Tomcat services
    await runCommand("sudo systemctl list-units --type=service | grep -q 'tomcat' && sudo systemctl stop tomcat-*.service || true");
    await runCommand("sudo systemctl list-unit-files | grep -q 'tomcat' && sudo systemctl disable tomcat-*.service || true");

    // Reload systemd
    await runCommand("sudo systemctl daemon-reexec || true");
    await runCommand("sudo systemctl daemon-reload || true");

    // Remove Tomcat service files
    await runCommand("sudo rm -f /etc/systemd/system/tomcat-*.service");
    await runCommand("sudo rm -f /lib/systemd/system/tomcat-*.service");

    // Kill any running Tomcat processes
    await runCommand("ps aux | grep -i tomcat | grep -v grep | awk '{print $2}' | xargs -I {} sudo kill -9 {}");

    // Remove Tomcat installations and backups
    await runCommand("sudo rm -rf /opt/tomcat-* /usr/share/tomcat-* /var/lib/tomcat-* /etc/tomcat-* || true");
    await runCommand("sudo rm -rf /opt/tomcat_backups || true");

    // Remove Tomcat-related environment variables
    await runCommand("sudo sed -i '/CATALINA_HOME/d' /etc/environment");
    await runCommand("sudo sed -i '/CATALINA_HOME/d' /etc/profile");
    await runCommand("sed -i '/CATALINA_HOME/d' ~/.bashrc");
    await runCommand("sed -i '/CATALINA_HOME/d' ~/.bash_profile");
    await runCommand("sed -i '/CATALINA_HOME/d' ~/.zshrc || true");

    console.log("✅ Tomcat uninstalled successfully.");
  } catch (error) {
    console.error("❌ Tomcat uninstallation failed.");
  }
}

/**
 * Removes the `previous_versions.json` file if it exists.
 */
 
async function removePreviousVersionsFile() {
  try {
   
    const versionsFilePath = path.join(__dirname, "previous_versions.json");

    if (fs.existsSync(versionsFilePath)) {
      console.log("🗑️ Removing previous_versions.json...");

      // ✅ Step 1: Change ownership to the current user
      const currentUser = process.env.USER || process.env.LOGNAME; // Get the current user
      if (currentUser) {
        await runCommand(`sudo chown ${currentUser}:${currentUser} ${versionsFilePath}`);
        console.log(`✅ Changed ownership of previous_versions.json to ${currentUser}`);
      } else {
        console.warn("⚠ Unable to determine current user. Proceeding with sudo...");
      }

      // ✅ Step 2: Change permissions to allow deletion
      await runCommand(`sudo chmod 777 ${versionsFilePath}`);
      console.log("✅ Changed file permissions to 777 (read/write for all users).");

      // ✅ Step 3: Attempt normal deletion
      try {
        fs.unlinkSync(versionsFilePath);
       // console.log("✅ previous_versions.json removed successfully.");
      } catch (unlinkError) {
       // console.warn("⚠ Normal deletion failed. Trying with sudo...");
        await runCommand(`sudo rm -f ${versionsFilePath}`);
       // console.log("✅ previous_versions.json removed with sudo.");
      }
    } else {
     // console.log("ℹ️ previous_versions.json does not exist. Skipping...");
    }
  } catch (error) {
    console.error("❌ Failed to remove previous_versions.json:", error);
  }
}




/**
 * Performs a full uninstallation of Java, Tomcat, and removes backups + previous_versions.json.
 */
async function fullUninstall() {
  console.log("🚀 Starting full uninstallation...");
  await uninstallJava();
  await uninstallTomcat();
 
  console.log("✅ Full uninstallation completed.");
}


// Export functions
module.exports = { fullUninstall, uninstallJava, uninstallTomcat, removePreviousVersionsFile };
