var WsClient = require('../lib/wsClient'),
    WsServer = require('../lib/wsServer'),
    _ = require('lodash'),
    util = require('util'),
    EventEmitter = require('events').EventEmitter,
    should = require('should'),
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

app.use(express.static(__dirname + "/"));
server = http.createServer(app);
server.listen(port);
wsServer = new WsServer(fb);
wsServer.start(server);

describe('Constructor Check', function () {
    wsClient = new WsClient();

    it('WsClient()', function () {
        should(wsClient._wsClient).be.null();
        should(wsClient._auth).be.false();
        should(wsClient._connected).be.false();
        should(wsClient._nextTransId).be.Function();
    });
});

describe('Signature Check', function () {
    it('start(addr, options, authData)', function () {
        // (function () { wsClient.start('ws://localhost:' + port, {}); }).should.not.throw();
        // (function () { wsClient.start('ws://localhost:' + port, {}, {}); }).should.not.throw();

        (function () { wsClient.start({}, {}); }).should.throw();
        (function () { wsClient.start([], {}); }).should.throw();
        (function () { wsClient.start(123, {}); }).should.throw();
        (function () { wsClient.start(true, {}); }).should.throw();
        (function () { wsClient.start(undefined, {}); }).should.throw();
        (function () { wsClient.start('ws://localhost:' + port, []); }).should.throw();
        (function () { wsClient.start('ws://localhost:' + port, 123); }).should.throw();
        (function () { wsClient.start('ws://localhost:' + port, true); }).should.throw();
        (function () { wsClient.start('ws://localhost:' + port, undefined); }).should.throw();
        (function () { wsClient.start('ws://localhost:' + port, 'xxx'); }).should.throw();
        (function () { wsClient.start('ws://localhost:' + port, {}, []); }).should.throw();
        (function () { wsClient.start('ws://localhost:' + port, {}, 123); }).should.throw();
        (function () { wsClient.start('ws://localhost:' + port, {}, true); }).should.throw();
        (function () { wsClient.start('ws://localhost:' + port, {}, undefined); }).should.throw();
        (function () { wsClient.start('ws://localhost:' + port, {}, 'xxx'); }).should.throw();
    });

    it('sendReq(subsys, cmd, args, callback)', function () {
        (function () { wsClient.sendReq('xxx', 'xxx', {}, function () {}); }).should.not.throw();

        (function () { wsClient.sendReq({}, 'xxx', {}, function () {}); }).should.throw();
        (function () { wsClient.sendReq([], 'xxx', {}, function () {}); }).should.throw();
        (function () { wsClient.sendReq(123, 'xxx', {}, function () {}); }).should.throw();
        (function () { wsClient.sendReq(true, 'xxx', {}, function () {}); }).should.throw();
        (function () { wsClient.sendReq(undefined, 'xxx', {}, function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', {}, {}, function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', [], {}, function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', 123, {}, function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', true, {}, function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', undefined, {}, function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', [], function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', 123, function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', true, function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', undefined, function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', 'xxx', function () {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', {}, {}); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', {}, []); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', {}, 123); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', {}, true); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', {}, undefined); }).should.throw();
        (function () { wsClient.sendReq('xxx', 'xxx', {}, 'xxx'); }).should.throw();
    });
});

describe('Functional Check', function () {
    it('start()', function (done) {
         wsClient.on('open', function () {
            if (wsClient._connected && wsClient._auth)
                done();
         });
         wsClient.start('ws://localhost:' + port, {});
    });

    it('sendReq()', function (done) {
        wsClient.sendReq('dev', 'write', {value: 'kitchen'}, function (err, rsp) {
            if (rsp.status === 1)
                done();
        });
    });

    it('stop()', function (done) {
        var checkFlag = false;

        wsClient.on('close', function (status) {
            if (_.isNull(wsClient._wsClient) && wsClient._auth === false && wsClient._connected === false) 
                checkFlag = true;

            if (status === 100 && checkFlag)
                done();
        });
        wsClient.stop();
    });
});