/* jshint node: true */

const _ = require('busyman')
const proving = require('proving')
const WebsocketServer = require('ws').Server

const RSPCODE = require('./constants').RSP_CODE

const evtInfos = {
  ncError: { subsys: 'net', indType: 'error' },
  netReady: { subsys: 'net', indType: 'ready' },
  started: { subsys: 'net', indType: 'started' },
  stopped: { subsys: 'net', indType: 'stopped' },
  enabled: { subsys: 'net', indType: 'enabled' },
  disabled: { subsys: 'net', indType: 'disabled' },
  permitJoin: { subsys: 'net', indType: 'permitJoining' },
  bannedDevIncoming: { subsys: 'net', indType: 'bannedDevIncoming' },
  bannedDevReporting: { subsys: 'net', indType: 'bannedDevReporting' },
  bannedGadIncoming: { subsys: 'net', indType: 'bannedGadIncoming' },
  bannedGadReporting: { subsys: 'net', indType: 'bannedGadReporting' },
  devError: { subsys: 'dev', indType: 'error' },
  devIncoming: { subsys: 'dev', indType: 'devIncoming' },
  devLeaving: { subsys: 'dev', indType: 'devLeaving' },
  netChanged: { subsys: 'dev', indType: 'netChanged' },
  statusChanged: { subsys: 'dev', indType: 'statusChanged' },
  devPropsChanged: { subsys: 'dev', indType: 'propsChanged' },
  devAttrsChanged: { subsys: 'dev', indType: 'attrsChanged' },
  devReporting: { subsys: 'dev', indType: 'attrsReport' },
  gadError: { subsys: 'gad', indType: 'error' },
  gadIncoming: { subsys: 'gad', indType: 'gadIncoming' },
  gadLeaving: { subsys: 'gad', indType: 'gadLeaving' },
  panelChanged: { subsys: 'gad', indType: 'panelChanged' },
  gadPropsChanged: { subsys: 'gad', indType: 'propsChanged' },
  gadAttrsChanged: { subsys: 'gad', indType: 'attrsChanged' },
  gadReporting: { subsys: 'gad', indType: 'attrsReport' }

}

function WsServer (freebird) {
  proving.defined(freebird, 'freebird should be given when new WsServer()')

  const self = this

  this._freebird = freebird
  this._wsServer = null
  this._wsClients = []

  this._authenticate = function (wsClient, data, cb) {
    setImmediate(() => {
      cb(null, true) // function (err, success)
    })
  }

  this._authorize = function (wsClient, cb) {
    setImmediate(() => {
      cb(null, true) // function (err, success)
    })
  }

  this._authenticate = _.isFunction(freebird.authenticate) ? freebird.authenticate : this._authenticate
  this._authorize = _.isFunction(freebird.authorize) ? freebird.authorize : this._authorize

  this._onConnection = function (wsClient) {
    self._initClient(wsClient) // register client inside
  }

  this._onError = function (err) {
    console.log(`WsServer error: ${err}`)
  }
}

/** ******************************************************************** */
/** * Public Methods                                                  ** */
/** ******************************************************************** */
WsServer.prototype.isRunning = function () {
  return !_.isNull(this._wsServer)
}

WsServer.prototype.start = function (server) {
  if (this.isRunning()) return this

  this._wsServer = new WebsocketServer({ server })
  this._wsServer.on('connection', this._onConnection)
  this._wsServer.on('error', this._onError)

  return this
}

WsServer.prototype.stop = function () {
  if (!this.isRunning()) return this

  try {
    this._wsServer.close()

    this._wsServer.removeListener('connection', this._onConnection)
    this._wsServer.removeListener('error', this._onError)

    this._wsServer = null
    this._wsClients = []
    // each item: [ { client: wsClient, listeners: { message: lsn, close: lsn, error: lsn } }, ... ]
  } catch (err) {
    console.log(`WsServer close error: ${err}`)
  }

  return this
}

WsServer.prototype.receiveFreebirdEvent = function (evtName, msg) {
  let evtInfo

  proving.string(evtName, 'evtName must be a string.')
  proving.object(msg, 'msg must be an object.')

  evtInfo = evtInfos[evtName]

  proving.defined(evtInfo, `event of ${evtName} not support.`)

  wsServerEvtHdlr(this, evtInfo.subsys, evtInfo.indType, msg)
}

/** ******************************************************************** */
/** * Protected Methods                                               ** */
/** ******************************************************************** */
WsServer.prototype._registerClient = function (wsClient, listeners) {
  const isThere = this._wsClients.find(c => c.client === wsClient)

  if (!isThere) {
    this._wsClients.push({
      client: wsClient,
      listeners
    })
  }

  return !isThere
}

WsServer.prototype._unregisterClient = function (wsClient) {
  let removed
  let removedClient

  removed = _.remove(this._wsClients, c => c.client === wsClient)

  if (removed.length) {
    removedClient = removed[0]
    _.forEach(removedClient.listeners, (lsn, evt) => {
      if (_.isFunction(lsn)) removedClient.client.removeListener(evt, lsn)
    })
  }

  return !!removed.length // unregSuccess
}

WsServer.prototype._initClient = function (wsClient) {
  const self = this
  let regSuccess = false
  const clientLsns = {
    error: null,
    close: null,
    message: null
  }

  wsClient._auth = false // tag for authentication checked

  clientLsns.error = function (err) {
    console.log(`wsClient error: ${err.message}`)
  }

  clientLsns.close = function () {
    console.log('client is closed')
    self._unregisterClient(wsClient) // remove client and it listeners
  }

  clientLsns.message = function (msg) {
    try {
      msg = JSON.parse(msg)
      if (msg.type === 'authenticate') {
        self._authenticate(wsClient, msg.data, (err, success) => {
          if (err) {
            wsClient.emit('error', err)
            wsClient.close(3001)
          } else if (success) {
            wsClient._auth = true
            wsClient.send(JSON.stringify({ type: 'authenticated', data: true }))
          } else if (!success) {
            wsClient.send(JSON.stringify({ type: 'authenticated', data: false }))
            wsClient.emit('error', new Error('Authentication failure'))
            wsClient.close(3001)
          }
        })
      } else if (msg.__intf === 'REQ') {
        if (wsClient._auth) {
          self._reqHdlr(wsClient, msg)
        } else {
          // [TODO] rspCode add 'unauthenticated'?
        }
      }
    } catch (e) {
      // ignored invalid msg
    }
  }

  regSuccess = this._registerClient(wsClient, clientLsns)

  if (regSuccess) {
    // attach listeners
    _.forEach(clientLsns, (lsn, evt) => {
      if (_.isFunction(lsn)) wsClient.on(evt, lsn)
    })
  }
}

WsServer.prototype._reqHdlr = function (wsClient, reqMsg) {
  const self = this

  this._authorize(wsClient, (err, success) => {
    let wsApi

    if (err) {
      wsClient.emit('error', err)
      self._sendRsp(wsClient, reqMsg, RSPCODE.UNAUTHORIZED, err.message)
    } else if (success) {
      wsApi = self._freebird.find('wsApi', reqMsg.subsys, reqMsg.cmd)

      if (!_.isFunction(wsApi)) {
        self._sendRsp(wsClient, reqMsg, RSPCODE.FAIL)
      } else {
        wsApi(reqMsg.args, (err, result) => {
          if (err) self._sendRsp(wsClient, reqMsg, RSPCODE.FAIL)
          else self._sendRsp(wsClient, reqMsg, RSPCODE.SUCCESS, result)
        })
      }
    } else if (!success) {
      self._sendRsp(wsClient, reqMsg, RSPCODE.UNAUTHORIZED, 'Authorize failure.')
    }
  })
}

WsServer.prototype._sendRsp = function (wsClient, reqMsg, rspCode, rspData) {
  reqMsg.__intf = 'RSP'
  reqMsg.status = rspCode
  reqMsg.data = rspData

  delete reqMsg.args

  wsClient.send(JSON.stringify(reqMsg))
}

WsServer.prototype._sendInd = function (subsys, type, data, id) {
  const self = this
  const indMsg = {
    __intf: 'IND',
    subsys,
    type,
    id: (id) || null,
    data
  }

  if (!this.isRunning()) {
    this._wsServer.emit('error', new Error('WsServer is stopped.'))
  } else {
    _.forEach(self._wsClients, (wsClient) => {
      self._authorize(wsClient, (err, success) => {
        const { client } = wsClient

        if (err) client.emit('error', err)
        else if (success) client.send(JSON.stringify(indMsg))
      })
    })
  }
}

/** ******************************************************************** */
/** * Event Handlers                                                  ** */
/** ******************************************************************** */
function wsServerEvtHdlr (wsServer, subsys, indType, msg) {
  if (subsys === 'net') {
    wsServer._sendInd(subsys, indType, msg)
  } else if (indType === 'error') wsServer._sendInd(subsys, indType, msg.error, msg.id)
  else if (indType === 'devLeaving' || indType === 'gadLeaving') wsServer._sendInd(subsys, indType, null, msg.id)
  else wsServer._sendInd(subsys, indType, msg.data, msg.id)
}

module.exports = WsServer
