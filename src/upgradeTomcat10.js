const { exec } = require("child_process");
const fs = require("fs");

async function upgradeTomcat10(version) {   
  return new Promise(async (resolve, reject) => {
    const TOMCAT_VERSION = version || "10.1.34";
    const TOMCAT_DIR = "/opt/tomcat10";
    const TOMCAT_URL = `https://dlcdn.apache.org/tomcat/tomcat-10/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz`;
    const TOMCAT_SERVICE_NAME = "tomcat10";

    console.log(`Installing Tomcat version ${TOMCAT_VERSION}...`);

    try {
      console.log("Stopping existing Tomcat services...");
      await new Promise((resolveStop) => {
        exec(`sudo systemctl stop tomcat9 || true && sudo systemctl stop tomcat10 || true`, resolveStop);
      });

      console.log("Removing old Tomcat installations...");
      await new Promise((resolveRemove) => {
        exec(`sudo rm -rf ${TOMCAT_DIR}`, resolveRemove);
      });

      console.log(`Downloading Tomcat from ${TOMCAT_URL}...`);
      await new Promise((resolveDownload, rejectDownload) => {
        exec(`cd /tmp && wget -q ${TOMCAT_URL} -O tomcat.tar.gz`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Failed to download Tomcat: ${stderr}`);
            return rejectDownload(error);
          }
          resolveDownload();
        });
      });

      console.log("Extracting Tomcat...");
      await new Promise((resolveExtract, rejectExtract) => {
        exec(`sudo mkdir -p ${TOMCAT_DIR} && sudo tar -xzf /tmp/tomcat.tar.gz -C ${TOMCAT_DIR} --strip-components=1 && rm -f /tmp/tomcat.tar.gz`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Failed to extract Tomcat: ${stderr}`);
            return rejectExtract(error);
          }
          resolveExtract();
        });
      });

      console.log("Setting up Tomcat user and permissions...");
      await new Promise((resolvePermissions, rejectPermissions) => {
        exec(`sudo adduser --system --no-create-home --group tomcat || true && sudo chown -R tomcat:tomcat ${TOMCAT_DIR} && sudo chmod +x ${TOMCAT_DIR}/bin/*.sh`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Failed to set permissions: ${stderr}`);
            return rejectPermissions(error);
          }
          resolvePermissions();
        });
      });

      console.log("Setting up systemd service for Tomcat...");
      const serviceFilePath = `/etc/systemd/system/${TOMCAT_SERVICE_NAME}.service`;
      const serviceFileContent = `
        [Unit]
        Description=Apache Tomcat ${TOMCAT_VERSION}
        After=network.target

        [Service]
        Type=forking
        User=tomcat
        Group=tomcat
        Environment=JAVA_HOME=/usr/lib/jvm/default-java
        Environment=CATALINA_HOME=${TOMCAT_DIR}
        ExecStart=${TOMCAT_DIR}/bin/catalina.sh start
        ExecStop=${TOMCAT_DIR}/bin/catalina.sh stop
        Restart=always

        [Install]
        WantedBy=multi-user.target
      `;

      await fs.promises.writeFile(serviceFilePath, serviceFileContent);

      console.log("Reloading systemd and starting Tomcat...");
      await new Promise((resolveStart, rejectStart) => {
        exec(`sudo systemctl daemon-reload && sudo systemctl enable ${TOMCAT_SERVICE_NAME} && sudo systemctl start ${TOMCAT_SERVICE_NAME}`, (startError, startStdout, startStderr) => {
          if (startError) {
            console.error(`Failed to start Tomcat ${TOMCAT_VERSION}: ${startStderr}`);
            return rejectStart(new Error(`Tomcat ${TOMCAT_VERSION} startup failed: ${startError}`));
          }
          console.log(`Tomcat ${TOMCAT_VERSION} started successfully.`);
          resolveStart();
        });
      });

      console.log(`Tomcat ${TOMCAT_VERSION} installation completed successfully.`);
      resolve();
    } catch (error) {
      console.error("Tomcat installation failed!", error);
      reject(error);
    }
  });
}

module.exports = { upgradeTomcat10 }; 
