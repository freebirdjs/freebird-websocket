#ws-client
<br />

WebSocket client library for webApp client developer

<br />

## Table of Contents  

1. [Usage](#Usage)  
2. [APIs](#APIs) 
3. [Events](#Events)

<a name="Usage"></a>
## 1. Usage  

To use ws-client, you need to require **freebird-websocket** module and get websocket client constructor to new an instance. Just need to use `start()` method to let websocket client start running.

```javascript
var WsClient = require('freebird-websocket').Client;
	wsClient = new WsClient();

wsClient.start('ws://192.168.1.103:3000', {});
```

<br />

<a name="APIs"></a>
## 2. APIs and Events  

* [isRunning()](#API_isRun)
* [start()](#API_start)
* [stop()](#API_stop)
* [sendReq()](#API_sendReq)

*************************************************
<a name="API_isRun"></a>
### .isRunning()

Check whether the websocket client is running.

**Arguments:** 

- (*none*)

**Returns**

- (*Boolean*): true or false 

```javascript
if (wsClient.isRunning()) {
    // wsClient is running
    // you can send request here
} else {
    // wsClient is stop running
};
```

*************************************************
<a name="API_start"></a>
### .start(addr[, options], authData)

Start running websocket client, and sent authentication data to server to do authenticate.

**Arguments:**

1. `addr` (*String*): host address
2. `option` (*Object*): An object to set up the websocket client. Please refer to [ws.md](https://github.com/websockets/ws/blob/master/doc/ws.md#new-wswebsocketaddress-protocols-options) to see more detail about options.
3. `authData` (*Object*): Authenticate data. It can contain any information you would like to authenticate.

**Returns**

- (*Boolean*): true or false 

**Example**
```javascript
var options = {
        host: 'http://192.168.1.103'
    },
    authData = {
        username: 'xxx',
        password: 'xxxxxx'
    };

wsClient.start('ws://192.168.1.103:3000', options, authData);
```

*************************************************
<a name="API_stop"></a>
### .stop()

Stop running websocket client, and close the socket.

**Arguments:** 

- (*none*)

**Returns**

- (*Boolean*): true or false 

```javascript
wsClient.stop();
```

*************************************************
<a name="API_sendReq"></a>
### .sendReq(subSys, cmd, args, callback)

Client sends to Server to request something or to ask the server to perform an operation.

**Arguments:** 

1. `subSys` (*String*): Only 3 types accepted. They are 'net', 'dev', and 'gad' to denote which subsystem is this message going to.
2. `cmd` (*String*): Command Identifier corresponding to the API name. It can be found in the Command Name field of the [Request Data Model](https://github.com/simenkid/freebird-web-client-server-spec/blob/master/spec.md#RequestData).
3. `args` (*Object*):     A value-object that contains command arguments. Please see section [Request Data Model](https://github.com/simenkid/freebird-web-client-server-spec/blob/master/spec.md#RequestData) to learn more about the args data object.
4. `callback` (*Function*): `function (err, result) {}`. Get called when server respond to client with the results of the client asking for.
    * `'err'` (*Error*): Error object.
    * `'result'` (*Object*): result is an object of `{ status, data }`. `status` is corresponding to [RSP Status Code](https://github.com/simenkid/freebird-web-client-server-spec/blob/master/spec.md#4-rsp-status-code). `data` is a response data object, you can refer to [Response Data Model](https://github.com/simenkid/freebird-web-client-server-spec/blob/master/spec.md#response-1) to see more detail.


**Returns**

- (*none*)

**Example**

```javascript
wsClient.sendReq('net', 'getAllDevIds', {ncName: 'ble-core'}, function(err, result) {
    if (err) {
        console.log(err);
    } else {
        console.log(result);

	// result equal to 
        // {
        //     status: 0,
        //     data: {
        //         ids: [1, 5, 8, 15, 27]
        //     }
        // }
    }    
});
```

<br />

<a name="Events"></a>
## 3. Event

The wsClient will fire event when receiving an indication from websocket server side.

### .on(evtType, function(msg) {...})

* `evtType` (*String*): Event type. It is same with the [Indication types](https://github.com/simenkid/freebird-web-client-server-spec/blob/master/spec.md#IndTypes)
* `msg` (*Object*): It is a message object with properties `'subsys'`, `'id'` and `'data'`
	* `subsys` (*String*): They are 'net', 'dev', and 'gad' to denote which subsystem is this indication coming from.
	* `id` (*Number*): Id of the sender. id is meaningless if `subsys === 'net'`. id is **device id** if `subsys === 'dev'`. id is **gadget id** if `subsys === 'gad'`
	* `data` (*Object*): Data along with the indication. Please see section [Indication Data Model](https://github.com/simenkid/freebird-web-client-server-spec/blob/master/spec.md#IndicationData) to learn more about the indication data format.
