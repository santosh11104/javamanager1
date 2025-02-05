#!/usr/bin/env node


const { Command } = require("commander");


const { logError, logInfo } = require("./utils");
const { checkJavaInstalled, checkTomcatInstalled, installJava, installTomcat } = require("./installer");

const { upgradeJavaAndTomcat } = require("./upgrade");

const program = new Command();

program
  .command("check")
  .description("Check if Java and Tomcat are installed")
  .action(() => {
    checkJavaInstalled();
    checkTomcatInstalled();
  });

program
  .command("install")
  .description("Install Java and Tomcat")
  .action(async () => {
    try {
      if (!checkJavaInstalled()) installJava("17");
      if (!checkTomcatInstalled()) installTomcat("10.1.15");
    } catch (error) {
      logError("Installation failed", error);
    }
  });

program
  .command("upgrade")
  .description("Upgrade Java and Tomcat based on Mavee requirements")
  .action(async () => {
    try {
      await upgradeJavaAndTomcat();
    } catch (error) {
      logError("Upgrade failed", error);
    }
  });

program.parse(process.argv);

   
  
   
