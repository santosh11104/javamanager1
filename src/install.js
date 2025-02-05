const { exec } = require("child_process");

// Function to install Java and set JAVA_HOME
async function installJava() {
  return new Promise((resolve, reject) => {
    exec("sudo apt update && sudo apt install -y openjdk-17-jdk", (error, stdout, stderr) => {
      if (error) {
        reject(`Java installation failed: ${stderr}`);
      } else {
        console.log(`Java installed successfully: ${stdout}`);

        // Set JAVA_HOME globally
        const javaHomeCmd = `
          echo 'JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"' | sudo tee /etc/environment &&
          echo 'export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"' | sudo tee -a /etc/profile &&
          echo 'export PATH=$JAVA_HOME/bin:$PATH' | sudo tee -a /etc/profile
        `;

        exec(javaHomeCmd, (err) => {
          if (err) {
            reject("Failed to set JAVA_HOME");
          } else {
            console.log("JAVA_HOME set successfully!");
            resolve();
          }
        });
      }
    });
  });
}

// Function to install and configure Tomcat 9
async function installTomcat() {
  return new Promise((resolve, reject) => {
    const commands = [
      "sudo apt update",
      "sudo apt install -y tomcat9",
      'echo \'JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"\' | sudo tee /etc/default/tomcat9'
    ];

    exec(commands.join(" && "), (error, stdout, stderr) => {
      if (error) {
        reject(`Tomcat installation failed: ${stderr}`);
      } else {
        console.log(`Tomcat installed successfully: ${stdout}`);

        // Modify Tomcat's systemd service file to include JAVA_HOME
        const tomcatServiceConfig = `
          sudo sed -i '/\\[Service\\]/a Environment="JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64"' /lib/systemd/system/tomcat9.service &&
          sudo systemctl daemon-reload
        `;

        exec(tomcatServiceConfig, (err) => {
          if (err) {
            reject("Failed to update Tomcat service file with JAVA_HOME");
          } else {
            // Restart Tomcat
            exec("sudo systemctl restart tomcat9 && sudo systemctl status tomcat9", (restartErr, restartStdout, restartStderr) => {
              if (restartErr) {
                reject(`Tomcat restart failed: ${restartStderr}`);
              } else {
                console.log(`Tomcat restarted successfully: ${restartStdout}`);
                resolve();
              }
            });
          }
        });
      }
    });
  });
}

module.exports = { installJava, installTomcat };
