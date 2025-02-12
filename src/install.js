const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

// Path to the JSON configuration file
const configPath = path.join(__dirname, "mavee_config.json"); // Adjust the path as needed

// Read configuration from the JSON file
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const javaVersion = config.mave.dependencies.java.version;
const javaUrl = config.mave.dependencies.java.packageUrlUnix;

// Function to install Java from the URL specified in the JSON file
async function installJava() {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Installing Java ${javaVersion} from ${javaUrl}...`);

    // Define the command to download and install Java
    const javaDir = `/opt/openjdk-${javaVersion}`;
    const tempTarFile = `/tmp/java-${javaVersion}.tar.gz`;

    // Ensure the path is quoted properly for Java directories
   /* const commands = [
      `sudo apt update`, // Update package index
      `sudo mkdir -p "${javaDir}"`, // Ensure the directory for Java exists
      `sudo wget -q "${javaUrl}" -O "${tempTarFile}"`, // Download Java tarball
      `sudo tar -xzf "${tempTarFile}" -C "${javaDir}" --strip-components=1`, // Extract Java tarball
      `rm -f "${tempTarFile}"`, // Remove the tarball file after extraction
      `echo 'JAVA_HOME="${javaDir}"' | sudo tee /etc/environment`, // Set JAVA_HOME
      `echo 'export JAVA_HOME="${javaDir}"' | sudo tee -a /etc/profile`, // Set JAVA_HOME in profile
      `echo 'export PATH=\$JAVA_HOME/bin:\$PATH' | sudo tee -a /etc/profile`, // Update PATH
      `. /etc/profile`, // Reload profile
    ];*/
    const commands = `
      sudo apt update &&
      sudo mkdir -p /opt &&
      sudo wget -q ${javaUrl} -O /tmp/java.tar.gz &&
      sudo tar -xzf /tmp/java.tar.gz -C /opt &&
      extracted_folder=$(ls /opt | grep 'jdk' | head -n 1) &&
      sudo rm -rf /opt/openjdk-${javaVersion} &&
      sudo mv /opt/$extracted_folder /opt/openjdk-${javaVersion} &&
      rm -f /tmp/java.tar.gz &&
      echo 'JAVA_HOME="/opt/openjdk-${javaVersion}"' | sudo tee /etc/environment &&
      echo 'export JAVA_HOME="/opt/openjdk-${javaVersion}"' | sudo tee -a /etc/profile &&
      echo 'export PATH="$JAVA_HOME/bin:$PATH"' | sudo tee -a /etc/profile &&
      . /etc/profile  # Use dot instead of source
    `;

    exec(commands, { shell: "/bin/bash" }, (error, stdout, stderr) => {  // <-- Use bash shell
      if (error) {
        console.error(`❌ Java installation failed: ${stderr}`);
         
        reject(stderr);
      } else {
        console.log(`✅ Java ${javaVersion} installed successfully.`);
        resolve(stdout);
      }
    });
  });
}

const tomcatVersion = config.mave.dependencies.tomcat.version;
const tomcatUrl = config.mave.dependencies.tomcat.packageUrlUnix;

// Function to install Tomcat from the URL specified in the JSON file
async function installTomcat() {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Installing Apache Tomcat ${tomcatVersion} from ${tomcatUrl}...`);

    // Define the Tomcat directory and service file path
    const tomcatDir = `/opt/tomcat-${tomcatVersion}`;
    const serviceFilePath = `/etc/systemd/system/tomcat-${tomcatVersion}.service`;
    const tempTarFile = `/tmp/tomcat-${tomcatVersion}.tar.gz`;

    // Ensure necessary commands are installed
    const installCommands = [
      "sudo apt update", // Update package index
      "sudo apt install -y wget", // Ensure wget is installed
      `sudo mkdir -p ${tomcatDir}`, // Create Tomcat directory
    ];

    const tomcatCommands = [
      `sudo wget -q ${tomcatUrl} -O ${tempTarFile}`, // Download Tomcat tarball
      `sudo tar -xzf ${tempTarFile} -C ${tomcatDir} --strip-components=1`, // Extract Tomcat tarball
      `rm -f ${tempTarFile}`, // Clean up the tarball file
      "sudo adduser --system --no-create-home --group tomcat || true", // Ensure tomcat user
      `sudo chown -R tomcat:tomcat ${tomcatDir}`, // Set ownership
      `sudo chmod -R 755 ${tomcatDir}`, // Set permissions
      `sudo chmod -R +x ${tomcatDir}/bin/*.sh`, // Make scripts executable
    ];

    exec(installCommands.concat(tomcatCommands).join(" && "), (error, stdout, stderr) => {
      if (error) {
        return reject(`❌ Tomcat installation failed: ${stderr}`);
      }
      console.log(`✅ Apache Tomcat ${tomcatVersion} installed successfully: ${stdout}`);

      // Ensure the systemd service file exists
      if (!fs.existsSync(serviceFilePath)) {
        console.log("⚠️ Tomcat service file not found. Creating a new one...");

        const serviceFileContent = `
[Unit]
Description=Apache Tomcat ${tomcatVersion}
After=network.target

[Service]
User=tomcat
Group=tomcat
Environment="JAVA_HOME=/opt/openjdk-${javaVersion}"
Environment="CATALINA_HOME=${tomcatDir}"
ExecStart=${tomcatDir}/bin/catalina.sh run
ExecStop=${tomcatDir}/bin/shutdown.sh
Restart=always

[Install]
WantedBy=multi-user.target
`;


        fs.writeFileSync(serviceFilePath, serviceFileContent);
        console.log(`✅ Created new Tomcat service file: ${serviceFilePath}`);
      } else {
        console.log("✅ Tomcat service file already exists.");
      }

      // Ensure correct permissions & restart Tomcat
      exec(`sudo chmod 644 ${serviceFilePath}`, (permErr) => {
        if (permErr) {
          return reject("❌ Failed to set correct permissions for Tomcat service file.");
        }
        console.log("✅ Permissions set successfully for Tomcat service file.");

        exec(
          `sudo systemctl daemon-reload && sudo systemctl enable tomcat-${tomcatVersion} && sudo systemctl restart tomcat-${tomcatVersion}`,
          (restartErr, restartStdout, restartStderr) => {
            if (restartErr) {
              console.error("❌ Tomcat restart failed:", restartStderr);
              return reject(`Tomcat restart failed: ${restartStderr}`);
            }
            console.log(`✅ Tomcat restarted successfully: ${restartStdout}`);
            resolve();
          }
        );
      });
    });
  });
}
module.exports = { installJava, installTomcat  };
