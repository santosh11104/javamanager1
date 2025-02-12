const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * Uninstalls Java by removing its installation directory and cleaning up environment variables.
 * This does not use dpkg but instead removes files from /opt and environment variables.
 */
async function uninstallJava() {
  return new Promise((resolve, reject) => {
    console.log("🚀 Uninstalling Java...");

    const commands = [
      "sudo rm -rf /opt/openjdk-*", // Remove all Java installations in /opt
      "sudo sed -i '/JAVA_HOME/d' /etc/environment", // Remove JAVA_HOME from system environment
      "sudo sed -i '/JAVA_HOME/d' /etc/profile",
      "sed -i '/JAVA_HOME/d' ~/.bashrc",
      "sed -i '/JAVA_HOME/d' ~/.bash_profile",
      "sed -i '/JAVA_HOME/d' ~/.zshrc || true",
      "unset JAVA_HOME", // Unset JAVA_HOME for current session
      ". /etc/environment && . ~/.bashrc" // Reload environment variables
    ];

    exec(commands.join(" && "), (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Java uninstallation failed: ${stderr}`);
        return reject(error);
      }
      console.log("✅ Java uninstalled successfully.");
      resolve();
    });
  });
}

/**
 * Uninstalls Tomcat by stopping services, removing files from /opt, and cleaning up system configurations.
 */


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
 * Uninstalls Tomcat by stopping services, removing files, and cleaning up environment variables.
 */
async function uninstallTomcat() {
  console.log("🚀 Uninstalling Tomcat...");

  try {
    // Stop and disable Tomcat services safely
    await runCommand("sudo systemctl list-units --type=service | grep -q 'tomcat' && sudo systemctl stop tomcat-*.service || true");
    await runCommand("sudo systemctl list-unit-files | grep -q 'tomcat' && sudo systemctl disable tomcat-*.service || true");

    // Reload systemd to apply changes
    await runCommand("sudo systemctl daemon-reexec || true");
    await runCommand("sudo systemctl daemon-reload || true");

    // Remove Tomcat service files
    await runCommand("sudo rm -f /etc/systemd/system/tomcat-*.service");
    await runCommand("sudo rm -f /lib/systemd/system/tomcat-*.service");

    // Kill any running Tomcat processes
     // Kill Tomcat processes
     await runCommand("ps aux | grep -i tomcat | grep -v grep | awk '{print $2}' | xargs -I {} sudo kill -9 {}");
   
    //await runCommand("sudo rm -rf /opt/tomcat-*");
    await runCommand("sudo /bin/rm -rf /usr/share/tomcat-* /var/lib/tomcat-* /etc/tomcat-* /opt/tomcat-* || true");
    await runCommand("pgrep -f tomcat && sudo pkill -f tomcat || true");

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





// Export functions
module.exports = { uninstallJava, uninstallTomcat };
