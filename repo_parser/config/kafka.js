const { Kafka } = require('kafkajs');
const logEvent = require('../utils/logEvent');

const kafka = new Kafka({
    clientId: 'repo-parser-service',
    brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'repo-parser-group' });
const producer = kafka.producer();

const connectConsumer = async () => {
    try {
        await consumer.connect();
        logEvent({ level: 'info', message: 'Kafka Consumer Connected', request_id: 'system-startup' });
    } catch (error) {
        logEvent({ level: 'error', message: `Error connecting Kafka consumer: ${error.message}`, request_id: 'system-startup' });
    }
};

const connectProducer = async () => {
    try {
        await producer.connect();
        logEvent({ level: 'info', message: 'Kafka Producer Connected', request_id: 'system-startup' });
    } catch (error) {
        logEvent({ level: 'error', message: `Error connecting Kafka producer: ${error.message}`, request_id: 'system-startup' });
    }
};

const produceMessage = async (topic, message) => {
    try {
        await producer.send({
            topic,
            messages: [{ value: JSON.stringify(message) }],
        });
    } catch (error) {
        logEvent({ level: 'error', message: `Error producing to ${topic}: ${error.message}`, request_id: 'kafka-producer' });
    }
};

const subscribeToTopic = async (topic, messageHandler) => {
    try {
        await consumer.subscribe({ topic, fromBeginning: false });
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                const value = message.value.toString();
                try {
                    const parsedValue = JSON.parse(value);
                    await messageHandler(parsedValue);
                } catch (e) {
                    logEvent({ level: 'error', message: `Failed to parse message: ${e.message}`, request_id: 'kafka-consumer' });
                }
            },
        });
        logEvent({ level: 'info', message: `Subscribed to topic: ${topic}`, request_id: 'system-startup' });
    } catch (error) {
        logEvent({ level: 'error', message: `Error subscribing to ${topic}: ${error.message}`, request_id: 'system-startup' });
    }
};

module.exports = { connectConsumer, subscribeToTopic, connectProducer, produceMessage };
