const { Kafka } = require("kafkajs");

exports.kafka = new Kafka({
  clientId: "my-app",
  brokers: [" 192.168.93.72:9092"],
});

async function init() {
  const admin = exports.kafka.admin();
  console.log("Admin connecting...");
  await admin.connect();
  console.log("Admin Connection Success...");

  console.log("Creating Topics [train_activation, train_cancellation]");
  await admin.createTopics({
    topics: [
      { topic: "train_activation", numPartitions: 2 },
      { topic: "train_cancellation", numPartitions: 2 },
    ],
  });
  console.log("Topics Created Success [train_activation, train_cancellation]");

  console.log("Disconnecting Admin..");
  await admin.disconnect();
}

init();
