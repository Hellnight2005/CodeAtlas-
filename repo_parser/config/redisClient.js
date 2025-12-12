const redis = require('redis');
const logEvent = require('../utils/logEvent');

const client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => logEvent({ level: 'error', message: `Redis Client Error: ${err.message}`, request_id: 'system' }));

(async () => {
    await client.connect();
    logEvent({ level: 'info', message: 'Redis Client Connected', request_id: 'system' });
})();

module.exports = client;
