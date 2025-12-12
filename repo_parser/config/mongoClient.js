const mongoose = require('mongoose');
const logEvent = require('../utils/logEvent');

const connectDB = async () => {
    try {
        if (mongoose.connection.readyState === 1) {
            return;
        }

        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // Options are largely default in newer mongoose versions, but keeping it simple
        });

        logEvent({ level: 'info', message: `MongoDB Connected: ${conn.connection.host}`, request_id: 'system-startup' });
    } catch (error) {
        logEvent({ level: 'error', message: `MongoDB connection error: ${error.message}`, request_id: 'system-startup' });
        // Don't exit process, allow retry or partial functionality
    }
};

module.exports = connectDB;
