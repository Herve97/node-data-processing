const { Kafka } = require("kafkajs");
const stompit = require("stompit");
const async = require("async");

// Configuration for the Kafka brokers
const kafkaConfig = {
  brokers: [" 192.168.93.72:9092"],
};

// Create Kafka producer
const kafkaProducer = new Kafka({
  clientId: "rail_app_producer",
  ...kafkaConfig,
}).producer();

// Connect the Kafka producer
const initKafkaProducer = async () => {
  await kafkaProducer.connect();
  console.log("Producer connected successfully");
};

// Initialize Kafka producer
initKafkaProducer();

const connectOptions = {
  host: "publicdatafeeds.networkrail.co.uk",
  port: 61618,
  connectHeaders: {
    "heart-beat": "15000,15000",
    "client-id": "",
    host: "/",
    login: "<YOUR USERNAME FOR networkrail.co.uk>",
    passcode: "<YOUR PASSWORD>",
  },
};

const reconnectOptions = {
  initialReconnectDelay: 10,
  maxReconnectDelay: 30000,
  useExponentialBackOff: true,
  maxReconnects: 30,
  randomize: false,
};

const connectionManager = new stompit.ConnectFailover(
  [connectOptions],
  reconnectOptions
);

connectionManager.connect((error, client, reconnect) => {
  if (error) {
    console.log("Terminal error, gave up reconnecting");
    return;
  }

  client.on("error", (error) => {
    console.log("Connection lost. Reconnecting...");
    reconnect();
  });

  const headers = {
    destination: "/topic/TRAIN_MVT_ALL_TOC",
    "activemq.subscriptionName": "somename-train_mvt",
    ack: "client-individual",
  };

  client.subscribe(headers, (error, message) => {
    if (error) {
      console.log("Subscription failed:", error.message);
      return;
    }

    message.readString("utf-8", (error, body) => {
      if (error) {
        console.log("Failed to read a message", error);
        return;
      }

      if (body) {
        try {
          const data = JSON.parse(body);

          async.each(data, (item, next) => {
            const timestamp = new Date().toISOString();

            if (item.header) {
              if (item.header.msg_type === "0001") {
                // Train Activation
                const stanox =
                  item.body.tp_origin_stanox ||
                  item.body.sched_origin_stanox ||
                  "N/A";
                console.log(
                  timestamp,
                  "- Train",
                  item.body.train_id,
                  "activated at stanox",
                  stanox
                );

                // Send the message to Kafka
                sendToKafka("train_activation", {
                  timestamp,
                  trainId: item.body.train_id,
                  stanox,
                });
              } else if (item.header.msg_type === "0002") {
                // Train Cancellation
                const stanox = item.body.loc_stanox || "N/A";
                const reasonCode = item.body.canx_reason_code || "N/A";
                console.log(
                  timestamp,
                  "- Train",
                  item.body.train_id,
                  "cancelled. Cancellation Reason:",
                  reasonCode,
                  "at stanox",
                  stanox
                );

                // Send the message to Kafka
                sendToKafka("train_cancellation", {
                  timestamp,
                  trainId: item.body.train_id,
                  stanox,
                  reasonCode,
                });
              }
            }

            next();
          });
        } catch (e) {
          console.log("Failed to parse JSON", e);
        }
      }

      client.ack(message);
    });
  });
});

async function sendToKafka(topic, message) {
  try {
    // Use KafkaJS producer to send message to Kafka
    await kafkaProducer.send({
      topic,
      messages: [
        {
          value: JSON.stringify(message),
        },
      ],
    });

    console.log(`Message sent to Kafka topic "${topic}":`, message);
  } catch (error) {
    console.error("Error sending message to Kafka:", error.message);
  }
}
