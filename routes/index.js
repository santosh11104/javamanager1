const express = require("express");
const router = express.Router();

const javaInstaller = require("../services/javaInstaller");
const maveInstaller = require("../services/maveInstaller");

// Check system status
router.get("/status", async (req, res) => {
  try {
    const status = await javaInstaller.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Install MAVE
router.post("/install", async (req, res) => {
  const { version } = req.body;
  try {
    await maveInstaller.install(version);
    res.json({ message: "MAVE installed successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upgrade Java and MAVE
router.post("/upgrade", async (req, res) => {
  const { maveVersion, javaVersion, upgradeJava } = req.body;
  try {
    await maveInstaller.upgrade(maveVersion, javaVersion, upgradeJava);
    res.json({ message: "Upgrade successful!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rollback Java
router.post("/rollback", async (req, res) => {
  try {
    await javaInstaller.rollback();
    res.json({ message: "Java rollback successful!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
