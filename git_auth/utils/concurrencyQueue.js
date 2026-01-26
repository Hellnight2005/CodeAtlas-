const logger = require('../config/logger');

class TaskQueue {
    constructor(concurrency = 1) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
        this.paused = false;
    }

    add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.process();
        });
    }

    async process() {
        if (this.paused || this.running >= this.concurrency || this.queue.length === 0) {
            return;
        }

        this.running++;
        const { task, resolve, reject } = this.queue.shift();

        try {
            const result = await task();
            resolve(result);
        } catch (error) {
            // Check for Rate Limits
            if (this.isRateLimitError(error)) {
                console.log('[TaskQueue] Rate Limit Hit! Pausing queue...');

                const resetTime = this.getResetTime(error);

                if (resetTime > 60000) { // If wait is more than 60 seconds, abort
                    logger.error({
                        message: `Rate Limit Hit: ${error.message}. Wait time ${resetTime}ms too long. Aborting task.`,
                        metadata: { type: 'RATE_LIMIT_ABORT', reset: resetTime }
                    });
                    reject(new Error(`Rate Limit Exceeded. Reset in ${Math.ceil(resetTime / 1000)}s.`));
                } else {
                    // Log specifically for the Watcher to pick up
                    logger.error({
                        message: `Rate Limit Hit: ${error.message}. Pausing operations for ${resetTime}ms.`,
                        metadata: { type: 'RATE_LIMIT', reset: resetTime }
                    });

                    this.pause(resetTime);

                    // FAIL FAST: Reject the current task so the user gets feedback immediately.
                    // Do NOT unshift it back to the queue (which causes hangs).
                    reject(error);

                    // this.queue.unshift({ task, resolve, reject }); // CAUSES HANG
                }


            } else {
                reject(error);
            }
        } finally {
            this.running--;
            if (!this.paused) {
                this.process();
            }
        }
    }

    isRateLimitError(error) {
        if (!error.response) return false;
        const status = error.response.status;
        return status === 429 || status === 403;
    }

    getResetTime(error) {
        // Try to get reset time from headers
        const headers = error.response?.headers || {};
        const resetHeader = headers['x-ratelimit-reset'] || headers['retry-after'];

        if (resetHeader) {
            // If it's a timestamp (seconds since epoch)
            if (resetHeader > 1000000000) {
                const resetDate = new Date(resetHeader * 1000);
                const waitTime = resetDate.getTime() - Date.now();
                return waitTime > 0 ? waitTime : 60000; // Default 1 min
            }
            // If it's seconds
            return parseInt(resetHeader) * 1000;
        }

        return 60000; // Default 1 minute
    }

    pause(duration) {
        if (this.paused) return;
        this.paused = true;
        console.log(`[TaskQueue] Paused for ${duration / 1000} seconds.`);

        setTimeout(() => {
            console.log('[TaskQueue] Resuming queue...');
            this.paused = false;
            this.process();
        }, duration);
    }
}

module.exports = new TaskQueue(1); // Singleton instance with concurrency 1
