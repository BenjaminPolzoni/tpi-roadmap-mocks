import { Kafka, logLevel } from 'kafkajs';
import { randomUUID } from 'node:crypto';

export function envelope(eventType, producer, payload) {
  return {
    eventId: randomUUID(),
    eventType,
    eventVersion: 1,
    timestamp: new Date().toISOString(),
    producer,
    payload
  };
}

export function createPublisher(serviceName = process.env.SERVICE_NAME || process.env.HOSTNAME || 'mock-service') {
  const brokers = (process.env.KAFKA_BOOTSTRAP || 'event-bus:29092').split(',').map(b => b.trim());
  const kafka = new Kafka({
    clientId: serviceName,
    brokers,
    logLevel: logLevel.NOTHING,
    retry: {
      initialRetryTime: 500,
      retries: 10
    }
  });

  const producer = kafka.producer();
  let connected = false;

  async function getProducer() {
    if (!connected) {
      let retries = 10;
      while (!connected && retries > 0) {
        try {
          await producer.connect();
          connected = true;
        } catch (err) {
          retries--;
          console.warn(`[${serviceName}] Kafka connection failed (${err.message}), retrying in 2s...`);
          if (retries === 0) throw err;
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    return producer;
  }

  async function publish(topic, key, env) {
    const prod = await getProducer();
    await prod.send({
      topic,
      messages: [
        {
          key: key !== undefined && key !== null ? String(key) : null,
          value: JSON.stringify(env)
        }
      ]
    });
    console.log(`[${serviceName}] -> ${topic} ${env.event_type || env.eventType} ${key}`);
  }

  return { publish, envelope };
}

let defaultPublisher = null;

export async function publish(topic, key, env) {
  if (!defaultPublisher) {
    defaultPublisher = createPublisher();
  }
  return defaultPublisher.publish(topic, key, env);
}
