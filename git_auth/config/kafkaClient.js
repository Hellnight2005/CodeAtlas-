const { Kafka } = require('kafkajs');
const logger = require('./logger');

const kafka = new Kafka({
    clientId: 'github-service',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});

const producer = kafka.producer();
let isConnected = false;

const connectProducer = async () => {
    if (!isConnected) {
        try {
            await producer.connect();

            // Explicitly Create Topic to avoid "Leader Election" race conditions
            const admin = kafka.admin();
            await admin.connect();
            const topics = await admin.listTopics();
            if (!topics.includes('repo-files-processing')) {
                logger.info('Creating topic: repo-files-processing');
                await admin.createTopics({
                    topics: [{
                        topic: 'repo-files-processing',
                        numPartitions: 1,
                        replicationFactor: 1 // Single broker setup
                    }],
                    waitForLeaders: true,
                });
            }
            await admin.disconnect();

            isConnected = true;
            logger.info('Kafka Producer connected and topic verified');
        } catch (error) {
            logger.error(`Kafka Connection Error: ${error.message}`);
        }
    }
};

const produceMessage = async (topic, message) => {
    if (!isConnected) await connectProducer();

    try {
        await producer.send({
            topic,
            messages: [
                { value: JSON.stringify(message) }
            ],
        });
    } catch (error) {
        logger.error(`Failed to send message to ${topic}: ${error.message}`);
        throw error;
    }
};

module.exports = { produceMessage };
