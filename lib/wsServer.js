var _ = require('lodash'),
    WebsocketServer = require('ws').Server;

function WsServer (fb) {
    if (!fb) throw new Error('freebird should be given when new WsServer()');

    this._fb = fb;
    this._wsServer = null;
    this._wsClients = [];
}

/***********************************************************************/
/*** Public Methods                                                  ***/
/***********************************************************************/
WsServer.prototype.start = function (server) {
    var self = this;

    this._wsServer = new WebsocketServer({server});

    // add freebird event listener
    this._fb.on('permitJoin', this.onPermitJoin.bind(this));
    this._fb.on('netChanged', this.onNetChanged.bind(this));
    this._fb.on('statusChanged', this.onStatusChanged.bind(this));
    this._fb.on('devIncoming', this.onDevIncoming.bind(this));
    this._fb.on('devLeaving', this.onDevLeaving.bind(this));
    this._fb.on('gadIncoming', this.onGadIncoming.bind(this));
    this._fb.on('gadLeaving', this.onGadLeaving.bind(this));
    this._fb.on('attrReport', this.onAttrReport.bind(this));
    this._fb.on('devAttrsChanged', this.onDevAttrsChanged.bind(this));
    this._fb.on('gadAttrsChanged', this.onGadAttrsChanged.bind(this));

    this._wsServer.on('connection', function (wsClient) {
        self._initClient(wsClient);
    });

    this._wsServer.on('error', function(err) {
        console.log('WsServer error: ' + err);
    });

    return this;
}

WsServer.prototype.stop = function () {
    try {
        this._wsServer.close();

        this._wsServer = null;
        this._wsClients = [];

        // remove freebird event listener
        this._fb.removeListener('permitJoin', this.onPermitJoin.bind(this));
        this._fb.removeListener('netChanged', this.onNetChanged.bind(this));
        this._fb.removeListener('statusChanged', this.onStatusChanged.bind(this));
        this._fb.removeListener('devIncoming', this.onDevIncoming.bind(this));
        this._fb.removeListener('devLeaving', this.onDevLeaving.bind(this));
        this._fb.removeListener('gadIncoming', this.onGadIncoming.bind(this));
        this._fb.removeListener('gadLeaving', this.onGadLeaving.bind(this));
        this._fb.removeListener('attrReport', this.onAttrReport.bind(this));
        this._fb.removeListener('devAttrsChanged', this.onDevAttrsChanged.bind(this));
        this._fb.removeListener('gadAttrsChanged', this.onGadAttrsChanged.bind(this));
    } catch (err) {
        console.log('WsServer close error: ' + err);
    }

    return this;
}

WsServer.prototype.isRunning = function () {
    return !_.isNull(this._wsServer);
}

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
        delete self._wsClients[_.indexOf(self._wsClients, wsClient)];
    });

    wsClient.on('error', function (err) {
        console.log('wsClient error: ' + err)
    });
}

WsServer.prototype._reqHdlr = function (wsClient, reqMsg) {
    var self = this,
        subsys,
        cmd;

    this._fb.authorize(wsClient, function (err, success) {
        if (success) {
            subsys = reqMsg.subsys;
            cmd = reqMsg.cmd;

            if (!_.isFunction(self._fb[subsys][cmd])) {
                self._sendRsp(wsClient, reqMsg, 1, subsys + '.' + cmd + ' is not support.');
            } else {
                // [TODO] how to pass args to API, and converse result to rspData
                self._fb[subsys][cmd](reqMsg.args);
            }
        } else if (err) {
            self._sendRsp(wsClient, reqMsg, 7, err.message);
        } else {
            self._sendRsp(wsClient, reqMsg, 7, 'Authorize failure.');
        }
    });
}

WsServer.prototype._sendRsp = function(wsClient, reqMsg, rspCode, rspData) {
    reqMsg.__intf = 'RSP';
    reqMsg.status = rspCode;
    reqMsg.data = rspData;

    delete reqMsg.args;

    wsClient.send(JSON.stringify(reqMsg));
}

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
}

/***********************************************************************/
/*** Event Handlers                                                  ***/
/***********************************************************************/
WsServer.prototype.onPermitJoin = function (nc, timeLeft) { 
    var data = {
        netcore: nc.dump().name,
        leftTime: timeLeft
    }

    this._sendInd('net', 'permitJoining', data);
}

WsServer.prototype.onNetChanged = function (dev, netDelta) {
    var data = {
        address: null,
        status: null
    };
    // [TODO]
    this._sendInd('dev', 'netChanged', data, dev.getId());
}

WsServer.prototype.onStatusChanged = function (dev, status) {
    this._sendInd('dev', 'statusChanged', {status: status}, dev.getId());
}

WsServer.prototype.onDevIncoming = function (dev) {
    var newDev = dev.dump(),
        gads = [];

    _.forEach(newDev.gads, function (gad) {
        gads.push(gad.gadId);
    });
    _.forEach(newDev.attrs, function (attr, attrKey) {
        newDev[attrKey] = attr;
    });

    newDev.gads = gads;
    delete newDev.lastTime;
    delete newDev.maySleep;
    delete newDev.attrs;

    this._sendInd('dev', 'devIncoming', newDev, newDev.id);
}

WsServer.prototype.onDevLeaving = function (dev) {
    this._sendInd('dev', 'devLeaving', {id: dev.getId()}, dev.getId());
}

WsServer.prototype.onGadIncoming = function (gad) {
    var newGad = gad.dump();

    newGad.name = newGad.attrs.name;
    newGad.description = newGad.attrs.description;

    delete newGad.attrs.name;
    delete newGad.attrs.description;

    this._sendInd('gad', 'gadIncoming', newGad, newGad.id);
}

WsServer.prototype.onGadLeaving = function (gad) {
    this._sendInd('gad', 'gadLeaving', {id: gad.getId()}, gad.getId());
}

WsServer.prototype.onAttrReport = function (gad, attr) {
    this._sendInd('gad', 'attrReport', attr, gad.getId());
}

WsServer.prototype.onDevAttrsChanged = function (dev, delta) {
    this._sendInd('dev', 'attrsChanged', delta, dev.getId());
}

WsServer.prototype.onGadAttrsChanged = function (gad, delta) {
    this._sendInd('gad', 'attrsChanged', delta, gad.getId());
}

module.exports = WsServer;
