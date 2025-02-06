const { exec } = require("child_process");

// Function to uninstall all Java versions

const fs = require("fs");
const path = require("path");

// Function to uninstall Java completely


// Function to uninstall Java completely
async function uninstallJava() {
  return new Promise((resolve, reject) => {
    console.log("Checking installed Java versions...");

    exec("dpkg -l | grep -i openjdk || true", (dpkgError, dpkgStdout) => {
      if (dpkgError) {
        console.warn("Warning: Could not list Java versions. Skipping package-based uninstallation.");
      }

      if (!dpkgStdout || dpkgStdout.trim() === "") {
        console.log("No OpenJDK packages found via dpkg. Skipping Java uninstallation.");
        return resolve();
      }

      const javaPackages = dpkgStdout
        .trim()
        .split("\n")
        .map(line => {
          const parts = line.split(/\s+/);
          return parts[1]; // Extract package name
        })
        .filter(pkg => pkg && pkg.includes("openjdk"));

      if (javaPackages.length === 0) {
        console.log("No OpenJDK packages found. Skipping Java uninstallation.");
        return resolve();
      }

      console.log("Uninstalling Java packages:", javaPackages.join(", "));

      const uninstallCommands = javaPackages
        .map(pkg => `sudo apt remove --purge -y ${pkg}`)
        .join(" && ");

      exec(uninstallCommands, (error, stdout, stderr) => {
        if (error) {
          console.warn(`Warning: Java package uninstallation failed: ${stderr}`);
        } else {
          console.log("Java packages removed successfully.");
        }

        console.log("Cleaning up Java directories in /usr/lib/jvm...");
        exec("sudo rm -rf /usr/lib/jvm/java-*", (rmError, rmStdout, rmStderr) => {
          if (rmError) {
            console.warn(`Warning: Failed to clean Java directories: ${rmStderr}`);
          } else {
            console.log("Java directories removed.");
          }

          exec("sudo apt autoremove -y && sudo apt autoclean -y", () => {
            console.log("Java cleanup completed.");
            resolve();
          });
        });
      });
    });
  });
}



// Function to uninstall all Tomcat versions
async function uninstallTomcat() {
  return new Promise((resolve, reject) => {
    console.log("Detecting and removing all Tomcat services...");

    const commands = [
      // Stop and disable services (correctly using sudo with xargs)
      `systemctl --user list-units --type=service | grep tomcat | grep -v '●' | awk '{print $1}' | xargs -I {} sudo systemctl --user stop {} || true`,
      `systemctl list-units --type=service | grep tomcat | grep -v '●' | awk '{print $1}' | xargs -I {} sudo systemctl stop {} || true`,
      `systemctl --user list-units --type=service | grep tomcat | grep -v '●' | awk '{print $1}' | xargs -I {} sudo systemctl --user disable {} || true`,
      `systemctl list-units --type=service | grep tomcat | grep -v '●' | awk '{print $1}' | xargs -I {} sudo systemctl disable {} || true`,

      // Remove service files
      "sudo rm -f /etc/systemd/system/tomcat*.service",
      "sudo rm -f /lib/systemd/system/tomcat*.service",
      "sudo rm -f ~/.config/systemd/user/tomcat*.service",

      // Kill Tomcat processes
      "sudo pkill -f tomcat || true",

      // Remove Tomcat directories
      "sudo rm -rf /usr/share/tomcat* /var/lib/tomcat* /etc/tomcat* /opt/tomcat || true",

      // Reload systemd daemon
      "sudo systemctl daemon-reload",
      "systemctl --user daemon-reload", // No sudo for user-level daemon-reload
    ];


    // Execute commands sequentially
    const executeNextCommand = async (index) => {
      if (index >= commands.length) {
        return resolve(); // All commands completed
      }

      const command = commands[index];
      console.log(`Executing: ${command}`); // Log the command being executed

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing command: ${command}`);
          console.error(stderr); // Log stderr for debugging
          // DO NOT REJECT HERE.  Let the script continue to try and remove other tomcat instances.
        } else {
          console.log(stdout);
        }
        executeNextCommand(index + 1); // Execute the next command regardless of the error
      });
    };

    executeNextCommand(0); // Start the chain of command execution
  });
}


// Export functions
module.exports = { uninstallJava, uninstallTomcat };
 
