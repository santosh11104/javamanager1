const { exec } = require("child_process");
const fs = require("fs");

// Function to check if a backup exists
function backupExists(path) {
  return fs.existsSync(path);
}

// Function to create a backup (only if missing)
async function createBackup(src, dest) {
  return new Promise((resolve, reject) => {
    if (!backupExists(dest)) {
      console.log(`Creating backup from ${src} to ${dest}...`);
      exec(`sudo cp -r ${src} ${dest}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Failed to create backup: ${stderr}`);
          return reject(error);
        }
        console.log("Backup created successfully.");
        resolve();
      });
    } else {
      console.log("Backup already exists, skipping...");
      resolve();
    }
  });
}

// Function to rollback Java
async function rollbackJava() {
  return new Promise(async (resolve, reject) => {
    console.log("Rolling back to Java 17...");

    const backupPath = "/opt/java_backup";
    const javaPath = "/usr/lib/jvm/java-17-openjdk-amd64";

    if (!backupExists(backupPath)) {
      console.error("Java backup not found! Creating a new backup...");
      await createBackup(javaPath, backupPath);
    }

    const command = `
      sudo rm -rf /usr/lib/jvm/java-21-openjdk-amd64 &&
      sudo cp -r /opt/java_backup /usr/lib/jvm/java-17-openjdk-amd64 &&
      echo 'JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"' | sudo tee /etc/environment &&
      echo 'export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"' | sudo tee -a /etc/profile &&
      echo 'export PATH=$JAVA_HOME/bin:$PATH' | sudo tee -a /etc/profile
    `;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Java rollback failed: ${stderr}`);
        return reject(error);
      }
      console.log("Java rollback successful.");
      resolve();
    });
  });
}


 // Function to rollback Tomcat
 async function rollbackTomcat() {
  return new Promise(async (resolve, reject) => {
    console.log("Rolling back to Tomcat 9...");

    const backupPath = "/opt/tomcat_backup/tomcat9";
    const tomcatPath = "/opt/tomcat9";

    // 1️⃣ Ensure Tomcat 10 is stopped and disabled
    console.log("Stopping and disabling Tomcat 10...");
    await new Promise((resolveStop) => {
      exec(`sudo systemctl stop tomcat10 || true && sudo systemctl disable tomcat10 || true`, resolveStop);
    });

    // 2️⃣ Remove Tomcat 10 and its systemd service
    console.log("Removing Tomcat 10 and its systemd service...");
    await new Promise((resolveRemove) => {
      exec(`sudo apt remove --purge -y tomcat10 || true && sudo rm -rf /opt/tomcat10 /usr/share/tomcat10 /var/lib/tomcat10 /etc/tomcat10`, resolveRemove);
    });

    // 3️⃣ Verify if Tomcat 9 backup exists
    if (!backupExists(backupPath)) {
      console.error("Tomcat backup not found! Rollback failed.");
      return reject(new Error("Tomcat 9 backup is missing."));
    }

    // 4️⃣ Ensure /opt/tomcat9 directory exists before copying
    console.log("Ensuring /opt/tomcat9 directory exists...");
    await new Promise((resolveMkdir) => {
      exec(`sudo mkdir -p /opt/tomcat9`, (mkdirError, mkdirStdout, mkdirStderr) => {
        if (mkdirError) {
          console.error(`Failed to create /opt/tomcat9: ${mkdirStderr}`);
          return reject(mkdirError);
        }
        resolveMkdir();
      });
    });

    // 5️⃣ Restore Tomcat 9 from backup using rsync
    console.log("Restoring Tomcat 9 from backup...");
    await new Promise((resolveCopy, rejectCopy) => {
      exec(`sudo rsync -avz ${backupPath}/ /opt/tomcat9/`, (copyError, copyStdout, copyStderr) => {
        if (copyError) {
          console.error(`Failed to restore Tomcat 9: ${copyStderr}`);
          return rejectCopy(copyError);
        }
        console.log("Tomcat 9 restored successfully.");
        resolveCopy();
      });
    });

    // 6️⃣ Set correct permissions for Tomcat 9
    console.log("Setting correct permissions for Tomcat 9...");
    await new Promise((resolveChmod) => {
      exec(`sudo chown -R tomcat:tomcat /opt/tomcat9`, (chmodError, chmodStdout, chmodStderr) => {
        if (chmodError) {
          console.error(`Failed to set permissions: ${chmodStderr}`);
          return reject(chmodError);
        }
        resolveChmod();
      });
    });

    // 7️⃣ Restore systemd service for Tomcat 9 if missing
    const serviceFilePath = "/etc/systemd/system/tomcat9.service";
    if (!backupExists(serviceFilePath)) {
      console.log("Restoring Tomcat 9 systemd service file...");
      const serviceFileContent = `
        [Unit]
        Description=Apache Tomcat 9
        After=network.target

        [Service]
        Type=forking
        User=tomcat
        Group=tomcat
        Environment=JAVA_HOME=/usr/lib/jvm/default-java
        Environment=CATALINA_HOME=/opt/tomcat9
        ExecStart=/opt/tomcat9/bin/catalina.sh run
        ExecStop=/opt/tomcat9/bin/catalina.sh stop
        Restart=always

        [Install]
        WantedBy=multi-user.target
      `;
      await fs.promises.writeFile(serviceFilePath, serviceFileContent);
    }

    // 8️⃣ Reload systemd and start Tomcat 9
    console.log("Reloading systemd and starting Tomcat 9...");
    await new Promise((resolveStart, rejectStart) => {
      exec(`sudo systemctl daemon-reload && sudo systemctl enable tomcat9 && sudo systemctl start tomcat9`, (startError, startStdout, startStderr) => {
        if (startError) {
          console.error(`Failed to start Tomcat 9: ${startStderr}`);
          return rejectStart(new Error("Failed to start Tomcat 9."));
        }
        console.log("Tomcat 9 rollback successful and started.");
        resolveStart();
      });
    });

    resolve();
  });
}



module.exports = { rollbackJava, rollbackTomcat };
