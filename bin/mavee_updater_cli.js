#!/usr/bin/env node

const { program } = require("commander");
const axios = require("axios");
const { installJava, installTomcat } = require("../src/install");
const { uninstallJava, uninstallTomcat } = require("../src/uninstall");
const { upgrade } = require("../src/upgrade");
const { rollbackJava, rollbackTomcat } = require("../src/rollback");

 

async function safeAction(action, actionName) {
  try {
    console.log(`Starting ${actionName}...`);
    await action();
    console.log(`${actionName} completed successfully!`);
  } catch (error) {
    console.error(`${actionName} failed:`, error);
    process.exit(1);
  }
}

program
  .command("install")
  .description("Install Java and Tomcat")
  .action(() => safeAction(async () => {
    await installJava();
    await installTomcat();
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
  .action(async () => {
    console.log("Starting rollback process...");
    try {
      await rollbackJava();
      await rollbackTomcat();
      console.log("Rollback completed successfully!");
      process.exit(0);
    } catch (error) {
      console.error("Rollback failed:", error);
      process.exit(1);
    }
  });

program
  .command("uninstall")
  .description("Uninstall Java and Tomcat")
  .action(() => safeAction(async () => {
    await uninstallJava();
    await uninstallTomcat();
  }, "Uninstallation"));

program.parse(process.argv);
