# iothub-timer-server-node
The consumer side of an IoTHub timing solution as a node server

## Setup

run the following command from a terminal window in the project folder

```bash
$ npm install
```

create a file named ```.env``` in the project folder with contents like the following

```
IOT_HUB_CONNECTIONSTRING=HostName=myiothub.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=mysharedaccesskey=
```

## Running

run the following command from a terminal window in the project folder

```bash
$ node index.js
```


