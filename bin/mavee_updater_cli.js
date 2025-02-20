#!/usr/bin/env node

const { program } = require("commander");
const axios = require("axios");
const { install } = require("../src/install");
const { uninstallJava, uninstallTomcat,  removePreviousVersionsFile } = require("../src/uninstall");
const { upgrade } = require("../src/upgrade");
const { rollback } = require("../src/rollback");

 

async function safeAction(action, actionName) {
  try {
      console.log(`Starting ${actionName}...`);
      await action();
      console.log(`${actionName} completed successfully!`);
  } catch (error) {
      console.error(`${actionName} failed:`, error.message || error); // Improved error message
      process.exit(1);
  }
}

program
  .command("install")
  .description("Install Java and Tomcat")
  .action(() => safeAction(async () => {
    await install();
    //await installTomcat();
  }, "Installation"));

  program
  .command("upgrade")
  .description("Upgrade Java and Tomcat based on mavee_config.json")
  .action(async () => {
    console.log("Starting upgrade process...");
    try {
      await upgrade();
      console.log("Upgrade completed successfully!");
      process.exit(0);
    } catch (error) {
      console.error("Upgrade failed:", error.message);
      process.exit(1);
    }
  });

  program
    .command("rollback")
    .description("Rollback Java and Tomcat to previous versions")
    .action(() => safeAction(rollback, "Rollback")); // Using safeAction (optional)

program
  .command("uninstall")
  .description("Uninstall Java and Tomcat")
  .action(() => safeAction(async () => {
    await uninstallJava();
    await uninstallTomcat();
    await removePreviousVersionsFile();
  }, "Uninstallation"));

program.parse(process.argv);
