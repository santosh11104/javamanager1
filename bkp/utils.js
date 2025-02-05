const fs = require("fs");
const path = require("path");

// Define a log directory in the user's home folder
const LOG_DIR = path.join(process.env.HOME, ".java_tomcat_cli/logs");

// Ensure the log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Define the log file path
const LOG_FILE = path.join(LOG_DIR, "java_tomcat_cli.log");

// Function to log errors
function logError(message, error) {
  const errorMsg = `${new Date().toISOString()} - ERROR: ${message} - ${error.message}\n`;
  console.error(errorMsg);
  fs.appendFileSync(LOG_FILE, errorMsg);
}

// Function to log info messages
function logInfo(message) {
  const infoMsg = `${new Date().toISOString()} - INFO: ${message}\n`;
  console.log(infoMsg);
  fs.appendFileSync(LOG_FILE, infoMsg);
}

module.exports = { logError, logInfo };
