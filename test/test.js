var WsClient = require('../lib/wsClient'),
    WsServer = require('../lib/wsServer'),
    _ = require('lodash'),
    ws = require('ws'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    should = require('should');
    port = process.env.PORT || 5000,
    http = require('http'),
    express = require('express'),
    app = express();

var server,
    wsServer,
    wsClient,
    fb,
    fbConstr = function () {
        this.authorize = function (a, b) { b(null, true); };
        this.authenticate = function (a, b, c) { c(null, true); };
        this.dev = {};
    };

util.inherits(fbConstr, EventEmitter);
fb = new fbConstr();

app.use(express.static(__dirname + "/"))
server = http.createServer(app)
server.listen(port);

wsServer = new WsServer(fb);
wsServer.start(server);
