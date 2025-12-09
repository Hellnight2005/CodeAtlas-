const fs = require('fs');
const path = require('path');
const app = require('./app');

const SERVICE_NAME = process.env.SERVICE_NAME || "GitHub_Service";
const LOG_DIR = path.join(__dirname, "public", "log", SERVICE_NAME);
const PORT = 3002;

// Clear logs
if (fs.existsSync(LOG_DIR)) {
    const files = fs.readdirSync(LOG_DIR);
    for (const file of files) {
        fs.unlinkSync(path.join(LOG_DIR, file));
    }
}

const server = app.listen(PORT, async () => {
    console.log(`Test server running on ${PORT}`);
    try {
        await fetch(`http://localhost:${PORT}/?test=1`);
        setTimeout(() => {
            checkLogs();
            server.close();
        }, 1000);
    } catch (err) {
        console.error(err);
        server.close();
    }
});

function checkLogs() {
    const infoLogPath = path.join(LOG_DIR, "info.log");
    if (!fs.existsSync(infoLogPath)) {
        console.error("FAIL: No log file");
        return;
    }
    const content = fs.readFileSync(infoLogPath, 'utf8');
    const firstLine = content.trim().split('\n')[0];
    console.log("Log Line:", firstLine);

    try {
        const json = JSON.parse(firstLine);
        if (json.metadata.path === "/?test=1" || json.metadata.path === "/") {
            console.log("SUCCESS: Path found");
        } else {
            console.log("FAIL: Path is still null/wrong: " + json.metadata.path);
        }

        if (json.request_id) {
            console.log("SUCCESS: Request ID found");
        } else {
            console.log("FAIL: Request ID missing");
        }
    } catch (e) {
        console.error("FAIL: JSON parse error");
    }
}
