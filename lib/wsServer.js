var _ = require('lodash'),
    WebsocketServer = require('ws').Server;

var wsServerEvtHdlrs = {};

function WsServer (fb) {
    if (!fb) throw new Error('freebird should be given when new WsServer()');

    var self = this;

    this._fb = fb;
    this._wsServer = null;
    this._wsClients = [];

    this._authenticate = function (wsClient, data, cb) {
        cb(null, true);                 // function (err, success)
    };

    this._authorize = function (wsClient, cb) {
        cb(null, true);                 // function (err, success)
    };

    this._authenticate = _.isFunction(fb.authenticate) ? fb.authenticate : this._authenticate;
    this._authorize = _.isFunction(fb.authorize) ? fb.authorize : this._authorize;

    this._onConnection = function (wsClient) {
        self._initClient(wsClient);     // register client inside
    };

    this._onError = function(err) {
        console.log('WsServer error: ' + err);
    };
}

/***********************************************************************/
/*** Public Methods                                                  ***/
/***********************************************************************/
WsServer.prototype.isRunning = function () {
    return !_.isNull(this._wsServer);
};

WsServer.prototype.start = function (server) {
    if (this.isRunning())
        return this;

    this._wsServer = new WebsocketServer({ server: server });
    this._wsServer.on('connection', this._onConnection);
    this._wsServer.on('error', this._onError);

    return this;
};

WsServer.prototype.stop = function () {
    if (!this.isRunning())
        return this;

    try {
        this._wsServer.close();

        this._wsServer.removeListener('connection', this._onConnection);
        this._wsServer.removeListener('error', this._onError);

        this._wsServer = null;
        this._wsClients = [];
        // each item: [ { client: wsClient, listeners: { message: lsn, close: lsn, error: lsn } }, ... ]
    } catch (err) {
        console.log('WsServer close error: ' + err);
    }

    return this;
};

WsServer.prototype.receiveFreebirdEvent = function (evtName, msg) {
    var hdlr;

    if (!_.isString(evtName))
        throw new Error('evtName must be a string.');

    if (!_.isObject(msg) || _.isArray(msg))
        throw new Error('msg must be an object.');

    hdlr = wsServerEvtHdlrs[evtName];

    if (_.isFunction(hdlr))
        throw new Error('handler of ' + evtName + ' not support.');

    hdlr(this, msg);
};

/***********************************************************************/
/*** Protected Methods                                               ***/
/***********************************************************************/
WsServer.prototype._registerClient = function (wsClient, listeners) {
    var regSuccess = true,
        isThere = this._wsClients.find(function (c) {
            return c.client === wsClient;
        });

    if (!isThere) {
        this._wsClients.push({
            client: wsClient,
            listeners: listeners
        });
    } else {
        regSuccess = false;
    }

    return regSuccess;
};

WsServer.prototype._unregisterClient = function (wsClient) {
    var removed,
        removedClient;

    removed = _.remove(this._wsClients, function (c) {
        return c.client === wsClient;
    });

    if (removed.length) {
        removedClient = removed[0];
        _.forEach(removedClient.listeners, function (lsn, evt) {
            if (_.isFunction(lsn))
                removedClient.removeListener(evt, lsn);
        });
    }

    return removed.length ? true : false;   // unregSuccess
};

WsServer.prototype._initClient = function (wsClient) {
    var self = this,
        regSuccess = false,
        clientLsns = {
            error: null,
            close: null,
            message: null
        };

    wsClient._auth = false; // tag for authentication checked

    clientLsns.error = function (err) {
        console.log('wsClient error: ' + err.message);
    };

    clientLsns.close = function () {
        console.log('client is closed');
        self._unregisterClient(wsClient);   // remove client and it listeners
    };

    clientLsns.message = function (msg) {
        try {
            msg = JSON.parse(msg);

            if (msg.type === 'authenticate') {
                self._authenticate(wsClient, msg.data, function (err, success) {
                    if (err) {
                        wsClient.emit('error', err);
                        wsClient.close(3001);
                    } else if (success) {
                        wsClient._auth = true;
                        wsClient.send(JSON.stringify({ type: 'authenticated', data: true }));
                    } else if (!success) {
                        wsClient.send(JSON.stringify({ type: 'authenticated', data: false }));
                        wsClient.emit('error', new Error('Authentication failure'));
                        wsClient.close(3001);
                    }
                });
            } else if (msg.__intf === 'REQ') {
                if (wsClient._auth) {
                    self._reqHdlr(wsClient, msg);
                } else {
                    // [TODO] rspCode add 'unauthenticated'?
                }
            }
        } catch (e) {
            // ignored invalid msg
        }
    };

    regSuccess = this._registerClient(wsClient, clientLsns);

    if (regSuccess) {
        // attach listeners
        _.forEach(clientLsns, function (lsn, evt) {
            if (_.isFunction(lsn))
                wsClient.on(evt, lsn);
        });
    }
};

WsServer.prototype._reqHdlr = function (wsClient, reqMsg) {
    var self = this;

    this._authorize(wsClient, function (err, success) {
        var wsApi;

        if (err) {
            wsClient.emit('error', err);
            self._sendRsp(wsClient, reqMsg, 7, err.message);
        } else if (success) {
            wsApi = self._fb.findWsApi(reqMsg.subsys, reqMsg.cmd);

            if (!_.isFunction(wsApi)) {
                self._sendRsp(wsClient, reqMsg, 1);
            } else {
                wsApi(reqMsg.args, function (err, result) {
                    if (err)
                        self._sendRsp(wsClient, reqMsg, 1);
                    else
                        self._sendRsp(wsClient, reqMsg, 0, result);
                });
            }
        } else if (!success) {
            self._sendRsp(wsClient, reqMsg, 7, 'Authorize failure.');
        }
    });
};

WsServer.prototype._sendRsp = function(wsClient, reqMsg, rspCode, rspData) {
    reqMsg.__intf = 'RSP';
    reqMsg.status = rspCode;
    reqMsg.data = rspData;

    delete reqMsg.args;

    wsClient.send(JSON.stringify(reqMsg));
};

WsServer.prototype._sendInd = function (subsys, type, data, id) {
    var self = this,
        indMsg = {
            __intf: 'IND',
            subsys: subsys,
            type: type,
            id: (id) ? id : null,
            data: data
        };

    if (!this.isRunning()) {
        this.emit('error', new Error('WsServer is stopped.'));
    } else {
        _.forEach(self._wsClients, function (wsClient) {
            self._authorize(wsClient, function (err, success) {
                if (err)
                    wsClient.emit('error', err);
                else if (success)
                    wsClient.send(JSON.stringify(indMsg));
            });
        });
    }
};

/***********************************************************************/
/*** Event Handlers                                                  ***/
/***********************************************************************/
wsServerEvtHdlrs.ncError = function (wsServer, msg) {
    wsServer._sendInd('net', 'error', msg);
};

wsServerEvtHdlrs.devError = function (wsServer, msg) {
    wsServer._sendInd('dev', 'error', msg.error, msg.id);
};

wsServerEvtHdlrs.gadError = function (wsServer, msg) {
    wsServer._sendInd('gad', 'error', msg.error, msg.id);
};

wsServerEvtHdlrs.started = function (wsServer, msg) {
    wsServer._sendInd('net', 'started', msg);
};

wsServerEvtHdlrs.stopped = function (wsServer, msg) {
    wsServer._sendInd('net', 'stopped', msg);
};

wsServerEvtHdlrs.enabled = function (wsServer, msg) {
    wsServer._sendInd('net', 'enabled', msg);
};

wsServerEvtHdlrs.disabled = function (wsServer, msg) {
    wsServer._sendInd('net', 'disabled', msg);
};

wsServerEvtHdlrs.permitJoin = function (wsServer, msg) {
    wsServer._sendInd('net', 'permitJoining', msg);
};

wsServerEvtHdlrs.devIncoming = function (wsServer, msg) {
    wsServer._sendInd('dev', 'devIncoming', msg.data, msg.id);
};

wsServerEvtHdlrs.devLeaving = function (wsServer, msg) {
    wsServer._sendInd('dev', 'devLeaving', null, msg.id);
};

wsServerEvtHdlrs.netChanged = function (wsServer, msg) {
    wsServer._sendInd('dev', 'netChanged', msg.data, msg.id);
};

wsServerEvtHdlrs.statusChanged = function (wsServer, msg) {
    wsServer._sendInd('dev', 'statusChanged', msg.data, msg.id);
};

wsServerEvtHdlrs.devAttrsChanged = function (wsServer, msg) {
    wsServer._sendInd('dev', 'attrsChanged', msg.data, msg.id);
};

wsServerEvtHdlrs.devPropsChanged = function (wsServer, msg) {
    wsServer._sendInd('dev', 'propsChanged', msg.data, msg.id);
};

wsServerEvtHdlrs.devReporting = function (wsServer, msg) {
    wsServer._sendInd('dev', 'attrsReport', msg.data, msg.id);
};

wsServerEvtHdlrs.gadIncoming = function (wsServer, msg) {
    wsServer._sendInd('gad', 'gadIncoming', msg.data, msg.id);
};

wsServerEvtHdlrs.gadLeaving = function (wsServer, msg) {
    wsServer._sendInd('gad', 'gadLeaving', null, msg.id);
};

wsServerEvtHdlrs.panelChanged = function (wsServer, msg) {
    wsServer._sendInd('gad', 'panelChanged', msg.data, msg.id);
};

wsServerEvtHdlrs.gadAttrsChange = function (wsServer, msg) {
    wsServer._sendInd('gad', 'attrsChanged', msg.data, msg.id);
};

wsServerEvtHdlrs.gadPropsChanged = function (wsServer, msg) {
    wsServer._sendInd('gad', 'propsChanged', msg.data, msg.id);
};

wsServerEvtHdlrs.gadReporting = function (wsServer, msg) {
    wsServer._sendInd('gad', 'attrsReport', msg.data, msg.id);
};

wsServerEvtHdlrs.bannedDevIncoming = function (msg) {
    wsServer._sendInd('net', 'bannedDevIncoming', msg);
};

wsServerEvtHdlrs.bannedDevReporting = function (msg) {
    wsServer._sendInd('net', 'bannedDevReporting', msg);
};

wsServerEvtHdlrs.bannedGadIncoming = function (msg) {
    wsServer._sendInd('net', 'bannedGadIncoming', msg);
};

wsServerEvtHdlrs.bannedGadReporting = function (msg) {
    wsServer._sendInd('net', 'bannedGadReporting', msg);
};

module.exports = WsServer;
