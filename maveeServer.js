const express = require("express");
const app = express();
const PORT = 3000;

// Simulated API response for required Java and Tomcat versions
app.get("/version", (req, res) => {
    res.json({
        java: "21",
        tomcat: "10.1.34"
    });
});

app.listen(PORT, () => {
    console.log(`Mock Mavee API running at http://127.0.0.1:${PORT}`);
});
