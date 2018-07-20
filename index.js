'use strict';

// When running in production, forever doesn't set the working directory
// correctly so we need to adjust it before trying to load files from the
// requires below. Since we know we are run as the node user in production
// this is an easy way to detect that state.
if (process.env.USER === "node") {
  process.chdir("/var/node");
}

require("dotenv").config();
const iothub = require('azure-iothub');
const eventhub = require("azure-event-hubs");
const iotCommon = require("azure-iot-common");
const uuid = require("uuid");

var timings = {};
var stats = {
  D2C: {
    last: 0,
    total: 0,
    count: 0
  },
  ACK: {
    last: 0,
    total: 0,
    count: 0
  }
}

function CloseConnectionsAndExit()
{
  if (iotClient) {
    iotClient.close(() => {
      iotClient = null;
      if (!iotClient && !ehClient) {
        process.exit(1);
      }
    });  
  }
  if (ehClient) {
    ehClient.close().then(() => {
      ehClient = null;
      if (!iotClient && !ehClient) {
        process.exit(1);
      }  
    }, ()=>{
      ehClient = null;
      if (!iotClient && !ehClient) {
        process.exit(1);
      }  
    });
  }
}

var iotClient = iothub.Client.fromConnectionString(process.env.IOT_HUB_CONNECTIONSTRING);
iotClient.open(function (err) {
  if (err) {
    console.log("open failed\n", err);
    failure = err;
    iotClient = null;
    CloseConnectionsAndExit();
  } else {
    iotClient.getFeedbackReceiver((err, receiver) => {
      if (err) {
        console.log("getFeedbackReceiver failed\n", err);
        CloseConnectionsAndExit();
      } else {
        receiver.on("errorReceived", (err) => {
          console.log("errorReceived failed\n", err);
          CloseConnectionsAndExit();
        });

        receiver.on("message", (response) => {
          var now = new Date();
          var response = JSON.parse(response.data.toString())[0];

          if (timings[response.originalMessageId]) {
            stats.ACK.last = now.valueOf() - timings[response.originalMessageId].valueOf();
            stats.ACK.total += stats.ACK.last;
            stats.ACK.count += 1;

            delete timings[response.originalMessageId];
          }
        });
      }
    });
  }
});

var ehClient = null;
  eventhub.EventHubClient.createFromIotHubConnectionString(process.env.IOT_HUB_CONNECTIONSTRING
  ).then(function (result) {
    var onMessage = function (eventData) {
      var now = new Date();

      var msg = Object.assign({
        "messageId": eventData.properties["message_id"],
        "deviceId": eventData.annotations["iothub-connection-device-id"]
      }, eventData.body);

      if (!msg.type || msg.type !== "time") {
        console.log("unexpected message time, skipping");
        return;
      }

      msg.time = new Date(msg.time);
      
      stats.D2C.last = now.valueOf() - msg.time.valueOf();
      stats.D2C.total += stats.D2C.last;
      stats.D2C.count += 1;

      var payload = {
        "type": "status",
        "time": now,
        "id": msg.messageId,
        "D2C": stats.D2C,
        "ACK": stats.ACK
      }

      var id = uuid.v4();
      timings[id] = now;

      var message = new iotCommon.Message(JSON.stringify(payload));
      message.messageId = id;
      message.ack = "full";

      iotClient.send(msg.deviceId, message, (err) => {
        if (err) {
          console.log("iotClient.send failed\n", err);
          CloseConnectionsAndExit();
        }
      });
    },
    onError = function (err) {
      console.log("ehClient failed\n", err);
      CloseConnectionsAndExit();
    },
    options = {
      eventPosition: eventhub.EventPosition.fromEnd(),
      consumerGroup: "$Default"
    },

    ehClient = result;

    ehClient.getPartitionIds().then((partitions) => {  
      partitions.forEach((partition) => {    
          ehClient.receive(partition, onMessage, onError, options);
      });    
    });
  }).catch((err) => {
    console.log("catch\n", err);
    CloseConnectionsAndExit();
  });



