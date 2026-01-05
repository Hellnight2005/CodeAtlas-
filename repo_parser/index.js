require('dotenv').config();
const express = require('express');
// Trigger restart
const app = express();
const PORT = 5001;
const { connectConsumer, subscribeToTopic, connectProducer } = require('./config/kafka');
const { processFile } = require('./controllers/processingController');
const appRoutes = require('./routes/appRoutes');
const requestLogger = require('./middleware/requestLogger');
const connectDB = require('./config/mongoClient');
const { startQueueWorker } = require('./workers/recovery.js');

// Middleware
app.use(express.json());
app.use(requestLogger);

// connect DB
connectDB();
startQueueWorker().catch(err => console.error("Queue Worker Failed:", err));

// Routes
app.use('/', appRoutes);

// Base route
app.get('/', (req, res) => {
    res.send('repo_parser is running on port 5001');
});

// Start Server & Kafka
app.listen(PORT, async () => {
    console.log(`repo_parser is running on port ${PORT}`);

    // Connect Kafka
    await connectConsumer();
    await connectProducer();

    // Subscribe to File Processing Topic
    await subscribeToTopic('repo-files-processing', processFile);
});
