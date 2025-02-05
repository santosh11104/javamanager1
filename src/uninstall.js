const { exec } = require("child_process");

async function uninstallJava() {
  return new Promise((resolve, reject) => {
    exec("dpkg -l | grep openjdk || true", (checkError, stdout) => {
      if (checkError) {
        return reject(`Error checking Java packages: ${checkError.message}`);
      }

      const javaPackagesWithDetails = stdout ? stdout.trim().split("\n") : [];

      const javaPackages = javaPackagesWithDetails.map(line => {
        // Extract only the package name (second word in the line)
        const parts = line.split(/\s+/); // Split by any whitespace
        return parts[1]; // Return the second element
      }).filter(pkg => pkg); // Remove any empty strings

      // Add default Java packages to the list (outside the loop)
      javaPackages.push("default-jre", "default-jdk");

      const uninstallPromises = javaPackages.map(pkg => {
        return new Promise((resolvePkg, rejectPkg) => {
            if (!pkg) return resolvePkg();
          console.log(`Uninstalling Java package: ${pkg}`);
          exec(`sudo apt remove --purge -y ${pkg}`, (error, stdout, stderr) => {
            if (error) {
              rejectPkg(`Error uninstalling ${pkg}: ${stderr || error.message}`);
            } else {
              console.log(`${pkg} uninstalled: ${stdout}`);
              resolvePkg();
            }
          });
        });
      });

      Promise.all(uninstallPromises)
        .then(() => {
          console.log("All OpenJDK packages uninstalled. Cleaning up...");
          exec("sudo apt autoremove -y && sudo apt autoclean -y", (error, stdout, stderr) => {
            if (error) {
              reject(`Cleanup failed: ${stderr || error.message}`);
            } else {
              console.log(`Cleanup successful: ${stdout}`);
              resolve();
            }
          });
        })
        .catch(reject);
    });
  });
}



async function uninstallTomcat() {
  return new Promise((resolve, reject) => {
    const commands = [
      "sudo systemctl stop tomcat || true",  // Stop systemd services (ignore errors)
      "sudo systemctl disable tomcat || true",
      "sudo systemctl stop tomcat9 || true",
      "sudo systemctl disable tomcat9 || true",

      // Find and kill any remaining Java processes related to Tomcat (more aggressive)
      "sudo pkill -f \"java.*tomcat\" || true", // Kill Java processes FIRST

      // Remove Tomcat directories and files
      "sudo rm -rf /usr/share/tomcat9 || true",
      "sudo rm -rf /var/lib/tomcat9 || true",
      "sudo rm -rf /etc/tomcat9 || true",
      "sudo rm -rf /opt/tomcat || true",  // Remove manually installed Tomcat
      "sudo rm -f /etc/systemd/system/tomcat.service || true",
      "sudo rm -f /etc/systemd/system/tomcat9.service || true",
      "sudo rm -f ~/.config/systemd/user/tomcat.service || true",
      "sudo rm -f ~/.config/systemd/user/tomcat9.service || true",

      // Find Tomcat processes using ps and kill them (even if not Java)
      "ps aux | grep tomcat | grep -v grep | awk '{print $2}' | xargs sudo kill -9 || true", // Kill any remaining Tomcat processes

      "sudo systemctl daemon-reload",
      "systemctl --user daemon-reload"
    ];

    const executeCommands = commands.join(" && ");

    exec(executeCommands, (error, stdout, stderr) => {
      if (error) {
        reject(`Tomcat uninstallation failed: ${stderr || error.message}`);
      } else {
        console.log(`Tomcat uninstalled successfully: ${stdout}`);
        resolve();
      }
    });
  });
}

module.exports = { uninstallJava, uninstallTomcat };