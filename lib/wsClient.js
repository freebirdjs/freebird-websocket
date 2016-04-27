var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    WebSocket = require('ws'),
    _ = require('lodash');

function WsClient () {
    var transId = 0;

    this._wsClient = null;
    this._auth = false;
    this._connected = false;

    this._nextTransId = function () {
        if (transId > 255)
            transId = 0;
        return transId++;
    };
}

util.inherits(WsClient, EventEmitter);
 
WsClient.prototype.start = function (addr, options, authData) {
    var self = this,
        authMsg = {
            type: 'authenticate',
            data: authData
        };

    if (this.isRunning()) return;

    if (arguments.length === 2) {
        authData = options;
        options = {};
    }

    if (typeof addr !== 'string')
        throw new Error('addr must ba a string');

    if (typeof options !== 'object' || Array.isArray(options))
        throw new Error('options must ba an object');

    if (typeof authData !== 'object' || Array.isArray(authData))
        throw new Error('authData must ba an object');

    this._wsClient = new WebSocket(addr, options);

    this._wsClient.onopen = function () {
        self._connected = true;
        self._wsClient.send(JSON.stringify(authMsg));
    };

    this._wsClient.onclose = function (event) {
        self._connected = false;
        self.emit('close', event.code, event.reason);
    };

    this._wsClient.onmessage = function (event) {
        var msg = JSON.parse(event.data),
            type;

        if (msg.type === 'authenticated') {
            self._auth = true;
            self.emit('open');
        } else if (msg.__intf === 'RSP') {
            self.emit(msg.subsys + '_' + msg.cmd + ':' + msg.seq, msg.status, msg.data);
        } else if (msg.__intf === 'IND') {

            type = msg.type;

            delete msg.__intf;
            delete msg.type;

            self.emit(type, msg);
        }
    };

    this._wsClient.onerror = function (event) {
        // [TODO]
        this.emit('error', event);
    };
};

WsClient.prototype.stop = function () {
    if (!this.isRunning()) return;

    this._wsClient.terminate();

    this._wsClient.onopen = function () {};
    this._wsClient.onclose = function () {};
    this._wsClient.onmessage = function () {};
    this._wsClient.onerror = function () {};

    this._wsClient = null;
    this._auth = false;
    this._connected = false;
    this.emit('close', 100, 'User closed.');
};

WsClient.prototype.isRunning = function () {
    return !_.isNull(this._wsClient);
};

WsClient.prototype.sendReq = function (subsys, cmd, args, callback) {
    var self = this,
        reqMsg = {
            __intf: 'REQ',
            subsys: subsys,
            seq: self._nextTransId(),
            id: (args.id) ? args.id : null,
            cmd: cmd, 
            args: args
        };

    if (typeof subsys !== 'string')
        throw new Error('subsys must ba a string');

    if (typeof cmd !== 'string')
        throw new Error('cmd must ba a string');

    if (typeof args !== 'object' || Array.isArray(args))
        throw new Error('args must ba a object');

    if (typeof callback !== 'function')
        throw new Error('callback must ba a function');

    if (!this.isRunning()) {
        callback(new Error ('wsClient is not running.'));
    } else if (!this._connected) {
        callback(new Error ('wsClient connection is closed.'));
    } else if (!this._auth) {
        callback(new Error ('wsClient is not authenticated.'));
    } else {
        this._wsClient.send(JSON.stringify(reqMsg));
        this.on(subsys + '_' + cmd + ':' + reqMsg.seq, function (status, data) {
            callback(null, {status: status, data: data});
        });
    }
};

module.exports = WsClient;