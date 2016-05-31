var WsClient = require('../lib/wsClient'),
    WsServer = require('../lib/wsServer'),
    _ = require('lodash'),
    ws = require('ws'),
    should = require('should'),
    port = process.env.PORT || 5000,
    http = require('http');

var server,
    wsServer,
    wsClient,
    fb,
    fbConstr = function () {
        this.authorize = function (a, b) { b(null, true); };
        this.authenticate = function (a, b, c) { c(null, true); };
        this.dev = {};

        this.findWsApi = function () {};
    };

fb = new fbConstr();

server = http.createServer();
server.listen(port);

wsServer = new WsServer(fb);
wsServer.start(server);
