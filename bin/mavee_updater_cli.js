#!/usr/bin/env node

const { program } = require("commander");
const axios = require("axios");
const { installJava, installTomcat } = require("../src/install");
const { uninstallJava, uninstallTomcat } = require("../src/uninstall");
const { upgrade } = require("../src/upgrade");
const { rollbackJava, rollbackTomcat } = require("../src/rollback");

const MAVEESERVER_URL = "http://127.0.0.1:3000/version";

async function fetchVersions() {
  try {
    console.log("Fetching required versions from Mavee Server...");
    const response = await axios.get(MAVEESERVER_URL);
    return response.data; // { java: "21", tomcat: "10.1.15" }
  } catch (error) {
    console.error("Failed to fetch versions from Mavee Server:", error.message);
    process.exit(1);
  }
}

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
  .description("Upgrade Java and Tomcat based on Mavee requirements")
  .action(async () => {
    console.log("Starting upgrade process...");
    const versions = await fetchVersions();
    try {
      console.log(`Upgrading Java to version ${versions.java} and Tomcat to ${versions.tomcat}...`);
      await upgrade(versions.java, versions.tomcat);
      console.log("Upgrade completed successfully!");
      process.exit(0);
    } catch (error) {
      console.error("Upgrade failed:", error);
      console.log("Rolling back to previous versions...");
      try {
        await rollbackJava();
        await rollbackTomcat();
        console.log("Rollback successful.");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError);
      }
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
