var _ = require('lodash'),
    WebsocketServer = require('ws').Server;

var wsServerEvtHdlrs = {};

function WsServer (fb) {
    if (!fb) throw new Error('freebird should be given when new WsServer()');

    var self = this;

    this._fb = fb;
    this._wsServer = null;
    this._wsClients = [];

    this._onConnection = function (wsClient) {
        self._initClient(wsClient);
    };
    this._onError = function(err) {
        console.log('WsServer error: ' + err);
    };
}

/***********************************************************************/
/*** Public Methods                                                  ***/
/***********************************************************************/
WsServer.prototype.start = function (server) {
    var self = this;

    if (this.isRunning()) return;

    this._wsServer = new WebsocketServer({server: server});
    this._wsServer.on('connection', this._onConnection);
    this._wsServer.on('error', this._onError);

    return this;
};

WsServer.prototype.stop = function () {
    if (!this.isRunning()) return;

    try {
        this._wsServer.close();

        this._wsServer.removeListener('connection', this._onConnection);
        this._wsServer.removeListener('error', this._onError);

        this._wsServer = null;
        this._wsClients = [];
    } catch (err) {
        console.log('WsServer close error: ' + err);
    }

    return this;
};

WsServer.prototype.isRunning = function () {
    return !_.isNull(this._wsServer);
};

WsServer.prototype.callFbEvtHdlr = function (evtName, msg) {
    var self = this,
        hdlr = wsServerEvtHdlrs[evtName];

    if (typeof evtName !== 'string')
        throw new Error('evtName must be a string.');

    if (typeof msg !== 'object')
        throw new Error('msg must be an object.');

    if (typeof hdlr !== 'function')
        throw new Error('handler of ' + evtName + ' not support.');

    hdlr(self, msg);
};

/***********************************************************************/
/*** Protected Methods                                               ***/
/***********************************************************************/
WsServer.prototype._initClient = function (wsClient) {
    var self = this;

    wsClient.on('message', function (msg) {

        msg = JSON.parse(msg);

        if (msg.type === 'authenticate') {
            wsClient._auth = false;
            self._fb.authenticate(wsClient, msg.data, function (err, success) {
                if (success) {
                    wsClient._auth = true;
                    wsClient.send(JSON.stringify({type: 'authenticated'}));

                    if (!_.includes(self._wsClients, wsClient))
                        self._wsClients.push(wsClient);
                } else if (err) {
                    wsClient.close(3001, err);
                } else {
                    wsClient.close(3001, 'Authentication failure');
                }
            });
        } else if (msg.__intf === 'REQ') {
            if (wsClient._auth) {
                self._reqHdlr(wsClient, msg);
            } else {
                // [TODO] rspCode add 'unauthenticated'?
            }
        }
    });

    wsClient.on('close', function () {
        console.log('client is closed');
        delete self._wsClients[_.indexOf(self._wsClients, wsClient)];
    });

    wsClient.on('error', function (err) {
        console.log('wsClient error: ' + err);
    });
};

WsServer.prototype._reqHdlr = function (wsClient, reqMsg) {
    var self = this;

    this._fb.authorize(wsClient, function (err, success) {
        var wsApi;

        if (success) {
            // TODO, 
            wsApi = self._fb.findWsApi(reqMsg.subsys, reqMsg.cmd);

            if (!wsApi) {
                self._sendRsp(wsClient, reqMsg, 1);
            } else {
                wsApi(reqMsg.args, function (err, result) {
                    if (err) {
                        self._sendRsp(wsClient, reqMsg, 1);
                    } else {
                        self._sendRsp(wsClient, reqMsg, 0, result);
                    }
                });
            }
        } else if (err) {
            self._sendRsp(wsClient, reqMsg, 7, err.message);
        } else {
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

    if (!this.isRunning()) 
        throw new Error('WsServer is stop running');

    _.forEach(self._wsClients, function (wsClient) {
        self._fb.authorize(wsClient, function (err, success) {
            if (success) {
                wsClient.send(JSON.stringify(indMsg));
            }
        });
    });
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
