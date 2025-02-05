const { execSync } = require("child_process");

function checkJavaRunning() {
    try {
        const javaProcess = execSync("pgrep -f java", { encoding: "utf8" }).trim();
        if (javaProcess) {
            console.log("Java is running. Process ID(s):", javaProcess);
            return true;
        }
    } catch (error) {
        console.error("Java is NOT running.");
        return false;
    }
}


function checkTomcatRunning() {
    try {
        execSync("systemctl is-active --quiet tomcat");
        console.log("Tomcat is running.");
        return true;
    } catch (error) {
        console.error("Tomcat is NOT running.");
        return false;
    }
}

// Run checks
checkJavaRunning();
checkTomcatRunning();
