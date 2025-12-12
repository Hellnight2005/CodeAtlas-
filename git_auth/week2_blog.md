# Week 2: Building a Robust Structured Logging System in Node.js

This week focused on transforming a basic Node.js logging setup into a production-grade, structured, and observable system. We moved from simple console logs to a file-based Winston setup, and finally to a database-backed solution with real-time monitoring.

Here is a detailed breakdown of the implementation.

---

## 1. Structured Logging with Winston

The first step was to replace ad-hoc `console.log` statements with a standard logging library. We chose **Winston** for its flexibility and transport support.

### Key Implementations:

*   **JSON Formatting**: We configured Winston to output strict JSON. This ensures logs are machine-readable and easy to parse by aggregation tools.
*   **Service Isolation**: Logs are automatically stored in service-specific folders (`/public/log/{SERVICE_NAME}/`), making it easy to host multiple services on the same machine.
*   **Metadata Enrichment**: We implemented a middleware (`middleware/requestLogger.js`) that automatically attaches context to every log:
    *   `request_id`: A UUID for tracing requests across the system.
    *   `ip`: The client's IP address.
    *   `path`: The requested URL.
    *   `userAgent`: Client browser details.
*   **Unified API**: We attached a helper function `req.log(level, message)` to the Express request object. This allows controllers to log messages without manually passing metadata—it's injected automatically.

**File:** `config/logger.js`, `middleware/requestLogger.js`

---

## 2. MySQL Database Integration

File logs are great, but separate files (info/warn/error) are hard to query. We integrated **MySQL** to centralize logs.

### Key Implementations:

*   **Database Setup**: Created a script (`utils/initMysql.js`) to automatically check and create the `Log` database and the `log` table.
*   **Custom Transport**: We wrote a custom Winston Transport (`utils/mysqlTransport.js`) that intercepts log events and writes them directly to the MySQL database in real-time.
*   **Schema Design**: initially planned to store metadata as a JSON column, we refactored the schema to use **separated columns** (`ip`, `path`, `userAgent`) for better SQL query performance and filtering.

**Table Schema:**
`timestamp` | `service_name` | `level` | `message` | `request_id` | `ip` | `path` | `userAgent`

---

## 3. Automated Backups with Cron Jobs

To prevent log files from growing indefinitely and to ensure persistence, we implemented a scheduled task.

### Key Implementations:

*   **Node-Cron**: We used `node-cron` to schedule a job (`cron/logBackup.js`) that runs every minute.
*   **Batch Processing**: The script reads the `info.log`, `warn.log`, and `error.log` files using streams to handle large file sizes efficiently.
*   **Cleanup**: After successfully batch-inserting the logs into MySQL, the script **truncates** the log files to zero length, keeping the disk usage low.

**File:** `cron/logBackup.js`

---

## 4. Real-time Monitoring with Log Watcher

For a more responsive system, we built a continuous log monitoring service.

### Key Implementations:

*   **Pointer System**: The watcher (`watcher/logWatcher.js`) keeps track of how much of each log file has been processed using a local `pointers.json` file. This ensures we don't process the same log lines twice, even if the service restarts.
*   **Threshold-based Insertion**: To optimize database writes, the watcher buffers logs and only inserts them when a specific threshold is met (e.g., 10 new lines).
*   **Safe Truncation**: Once the buffer is flushed to the database, the file is safely truncated, and pointers are reset.

**File:** `watcher/logWatcher.js`

---

## Summary

We now have a comprehensive logging architecture:
1.  **Capture**: Middleware captures context.
2.  **Store**: Winston writes to JSON files.
3.  **Persist**: Custom transports and Cron jobs ensure data is safely stored in MySQL.
4.  **Monitor**: A continuous watcher creates a specialized pipeline for real-time observation.

This setup ensures reliability, traceability, and ease of debugging for the `GitHub_Service`.
