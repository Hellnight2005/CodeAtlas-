const app = require('./app');
const fs = require('fs');
const path = require('path');

const PORT = 3004;

// Run server to generate logs
const server = app.listen(PORT, async () => {
    console.log(`Log Generator running on ${PORT}`);

    // Generate 12 requests (Threshold is 10)
    for (let i = 0; i < 12; i++) {
        await fetch(`http://localhost:${PORT}/?watcher_test=${i}`);
    }

    console.log("Generated 12 logs. Waiting for watcher...");

    // Watcher runs every 5s. Wait 7s.
    setTimeout(() => {
        checkFileEmpty();
        server.close();
    }, 8000);
});

function checkFileEmpty() {
    const logPath = path.join(__dirname, 'public', 'log', 'GitHub_Service', 'info.log');
    if (!fs.existsSync(logPath)) {
        console.log("PASS: File does not exist (maybe fully deleted?)");
        return;
    }

    const stats = fs.statSync(logPath);
    console.log(`Log File Size: ${stats.size} bytes`);

    if (stats.size === 0) {
        console.log("PASS: File is empty (Truncated)");
    } else {
        console.log("FAIL: File not empty. Watcher might not have run or threshold not reached.");
    }
}
