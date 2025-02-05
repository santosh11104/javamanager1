const { execSync } = require("child_process");
const { logError, logInfo } = require("./utils");

function checkJavaInstalled() {
  try {
    execSync("java -version", { stdio: "ignore" });
    logInfo("Java is installed.");
    return true;
  } catch (error) {
    logInfo("Java is not installed.");
    return false;
  }
}

function checkTomcatInstalled() {
  try {
    execSync("ls /opt/tomcat", { stdio: "ignore" });
    logInfo("Tomcat is installed.");
    return true;
  } catch (error) {
    logInfo("Tomcat is not installed.");
    return false;
  }
}

function installJava(version) {
  logInfo(`Installing Java ${version}...`);
  try {
    execSync(`sudo apt update && sudo apt install -y openjdk-${version}-jdk`, { stdio: "inherit" });
    logInfo("Java installation completed.");
  } catch (error) {
    logError("Failed to install Java", error);
  }
}

function installTomcat(version) {
  logInfo(`Installing Tomcat ${version}...`);
  try {
    const TOMCAT_DIR = "/opt/tomcat";
    const majorVersion = version.split(".")[0];
    const tomcatUrl = `https://downloads.apache.org/tomcat/tomcat-${majorVersion}/v${version}/bin/apache-tomcat-${version}.tar.gz`;

    execSync(`sudo mkdir -p ${TOMCAT_DIR}`);
    execSync(`wget ${tomcatUrl} -O /tmp/tomcat.tar.gz`, { stdio: "inherit" });
    execSync(`sudo tar xzf /tmp/tomcat.tar.gz -C ${TOMCAT_DIR} --strip-components=1`, { stdio: "inherit" });
    execSync(`sudo chmod +x ${TOMCAT_DIR}/bin/*.sh`);
    
    logInfo("Tomcat installation completed.");
  } catch (error) {
    logError("Failed to install Tomcat", error);
  }
}

module.exports = { checkJavaInstalled, checkTomcatInstalled, installJava, installTomcat };
