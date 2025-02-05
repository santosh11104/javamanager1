const axios = require("axios");
const { exec } = require("child_process");
const { rollbackJava, rollbackTomcat } = require("./rollback");

// Function to get Java & Tomcat versions from Mavee API
async function getMaveeVersions() {
  try {
    const response = await axios.get("http://127.0.0.1:3000/version");
    return {
      javaVersion: response.data.java,
      tomcatVersion: response.data.tomcat
    };
  } catch (error) {
    throw new Error(`Failed to fetch versions from Mavee Server: ${error.message}`);
  }
}

// Function to upgrade Java
async function upgradeJava(version) {
  return new Promise((resolve, reject) => {
    console.log(`Upgrading Java to version ${version}...`);

    const command = `
      sudo apt update &&
      if sudo apt-cache show openjdk-${version}-jdk > /dev/null 2>&1; then
        sudo apt install -y openjdk-${version}-jdk;
      else
        echo "Java version ${version} not found, falling back to latest available OpenJDK";
        sudo apt install -y openjdk-21-jdk;
      fi &&
      echo 'JAVA_HOME="/usr/lib/jvm/java-${version}-openjdk-amd64"' | sudo tee /etc/environment &&
      echo 'export JAVA_HOME="/usr/lib/jvm/java-${version}-openjdk-amd64"' | sudo tee -a /etc/profile &&
      echo 'export PATH=$JAVA_HOME/bin:$PATH' | sudo tee -a /etc/profile
    `;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Java upgrade failed: ${stderr}`);
        reject(new Error(`Java upgrade failed: ${stderr}`));
      } else {
        console.log(`Java ${version} installed successfully: ${stdout}`);
        resolve();
      }
    });
  });
}

// Function to upgrade Tomcat (modified for automation)
const fs = require('fs'); // Require the fs module

async function upgradeTomcat(version) {
  return new Promise(async (resolve, reject) => {
    console.log(`Upgrading Tomcat to version ${version}...`);

    const tomcatDir = "/opt/tomcat";
    const tomcatMajorVersion = version.split('.')[0];
    const tomcatFullVersion = version; // Pass the full version to the script
    const tomcatServiceName = `tomcat${tomcatMajorVersion}`;

    let javaHome = process.env.JAVA_HOME;
    if (!javaHome) {
      javaHome = "/usr/lib/jvm/default-java";
      console.warn("JAVA_HOME environment variable is not set. Using fallback:", javaHome);

      try {
        await new Promise((resolveJdkInstall, rejectJdkInstall) => {
          exec(`sudo apt update && sudo apt install -y default-jdk`, (err, stdout, stderr) => {
            if (err) {
              console.error("Failed to install default-jdk:", stderr);
              rejectJdkInstall("Failed to install default-jdk");
              return;
            } else {
              console.log("default-jdk installed successfully (if it wasn't already).");
              resolveJdkInstall();
            }
          });
        });
      } catch (jdkInstallError) {
        reject(jdkInstallError);
        return;
      }
    }

    try {
      await new Promise((resolveJavaHomeCheck, rejectJavaHomeCheck) => {
        exec(`test -d "${javaHome}"`, (err, stdout, stderr) => {
          if (err) {
            console.error(`JAVA_HOME is invalid: ${javaHome}. Please set it correctly.`, stderr);
            rejectJavaHomeCheck(`JAVA_HOME is invalid: ${javaHome}`);
            return;
          } else {
            resolveJavaHomeCheck();
          }
        });
      });
    } catch (javaHomeCheckError) {
      reject(javaHomeCheckError);
      return;
    }


    try {
        await new Promise((resolveTomcatInstall, rejectTomcatInstall) => {
          exec(`sudo ./install_tomcat.sh`, (error, stdout, stderr) => {// Pass versions as arguments
                if (error) {
                    console.error(`Tomcat installation script failed:`);
                    console.error(`  Error: ${error.message}`);
                    console.error(`  Stderr: ${stderr}`);
                    rejectTomcatInstall(`Tomcat installation script failed: ${error.message}\n${stderr}`);
                    return;
                }
                console.log(`Tomcat installation script successful: ${stdout}`);
                resolveTomcatInstall();
            });
        });
    } catch (tomcatInstallError) {
        reject(tomcatInstallError);
        return;
    }



    // Create systemd service file (SEPARATE exec call)
    if (!fs.existsSync(`/etc/systemd/system/${tomcatServiceName}.service`)) {
      const serviceFileContent = `
        [Unit]
        Description=Apache Tomcat ${version}
        After=network.target

        [Service]
        User=tomcat
        Group=tomcat
        Environment=JAVA_HOME=${javaHome}
        Environment=CATALINA_HOME=/opt/tomcat
        ExecStart=/opt/tomcat/bin/catalina.sh run
        ExecStop=/opt/tomcat/bin/catalina.sh stop

        [Install]
        WantedBy=multi-user.target
      `;

      fs.writeFileSync(`/tmp/${tomcatServiceName}.service`, serviceFileContent);
      exec(`sudo mv /tmp/${tomcatServiceName}.service /etc/systemd/system/${tomcatServiceName}.service`, (mvErr, mvStdout, mvStderr) => {
        if (mvErr) {
          console.error(`Failed to move service file: ${mvErr.message}\n${mvStderr}`);
          reject(`Failed to move service file: ${mvErr.message}\n${mvStderr}`);
          return;
        }
        console.log("Service file created and moved successfully.");
      });

    }

    // Start Tomcat (SEPARATE exec call - after service file creation)
    exec(`sudo systemctl daemon-reload && sudo systemctl enable ${tomcatServiceName} && sudo systemctl restart ${tomcatServiceName}`, (startError, startStdout, startStderr) => {
      if (startError) {
        console.error(`Failed to start Tomcat: ${startError.message}\n${startStderr}`);
        reject(`Tomcat start failed: ${startError.message}\n${startStderr}`);
      } else {
        console.log(`Tomcat ${version} started successfully: ${startStdout}`);
        resolve();
      }
    });
  });
}

// Function to handle the full upgrade process
async function upgrade() {
  try {
    console.log("Starting upgrade process...");
    console.log("Fetching required versions from Mavee Server...");

    const { javaVersion, tomcatVersion } = await getMaveeVersions();
    console.log(`Upgrading Java to version ${javaVersion} and Tomcat to ${tomcatVersion}...`);

    // Upgrade Java
    await upgradeJava(javaVersion);

    // Upgrade Tomcat
    await upgradeTomcat(tomcatVersion);

    console.log("Upgrade completed successfully!");
  } catch (error) {
    console.error("Upgrade failed, rolling back:", error.message);

    try {
      await rollbackJava();
      await rollbackTomcat();
      console.log("Rollback completed.");
    } catch (rollbackError) {
      console.error("Rollback failed:", rollbackError.message);
    }
  }
}

module.exports = { upgrade };
