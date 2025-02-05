const { uninstallJava, uninstallTomcat } = require("./uninstall");

// Rename for clarity
const rollbackJava = uninstallJava;
const rollbackTomcat = uninstallTomcat;

module.exports = { rollbackJava, rollbackTomcat };
