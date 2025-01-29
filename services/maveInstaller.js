const { execSync } = require("child_process");

const maveInstaller = {
  async install(version) {
    console.log(`Installing MAVE version: ${version}`);
    execSync(`sudo ./install-mave-${version}.sh`);
  },

  async upgrade(maveVersion, javaVersion, upgradeJava) {
    if (upgradeJava) {
      const javaInstaller = require("./javaInstaller");
      await javaInstaller.upgrade(javaVersion);
    }
    await this.install(maveVersion);
  },
};

module.exports = maveInstaller;
