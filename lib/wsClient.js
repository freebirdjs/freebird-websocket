/* jshint node: true */

const util = require('util')
const { EventEmitter } = require('events')
const WebSocket = require('ws')
const _ = require('busyman')
const proving = require('proving')

const RSPCODE = require('./constants').RSP_CODE

const REQ_TIMEOUT_SEC = 10

function WsClient () {
  let transId = 0

  this._wsClient = null
  this._auth = false
  this._connected = false

  this._nextTransId = function () {
    if (transId > 255) transId = 0
    return transId++
  }
}

util.inherits(WsClient, EventEmitter)

WsClient.prototype.isRunning = function () {
  return !_.isNull(this._wsClient)
}

WsClient.prototype.start = function (addr, options, authData) {
  const self = this
  let startSuccess = false
  const authMsg = {
    type: 'authenticate',
    data: authData
  }

  if (this.isRunning()) return startSuccess

  if (arguments.length === 2) {
    authData = options
    options = {}
  }

  proving.string(addr, 'addr must ba a string')
  proving.object(options, 'options must ba an object')
  proving.object(authData, 'authData must ba an object')

  this._wsClient = new WebSocket(addr, options)

  this._wsClient.onopen = function () {
    self._connected = true
    self._wsClient.send(JSON.stringify(authMsg))
  }

  this._wsClient.onclose = function (event) {
    self._connected = false
    self.emit('close', event.code, event.reason)
  }

  this._wsClient.onerror = function (event) {
    self.emit('error', event)
  }

  this._wsClient.onmessage = function (event) {
    let msg
    let type
    let evt

    try {
      msg = JSON.parse(event.data)
    } catch (e) {
      return //  ignore bad message
    }

    if (msg.type === 'authenticated' && msg.data === true) { // authentication result = true
      self._auth = true
      self.emit('open')
    } else if (msg.__intf === 'RSP') {
      evt = `${msg.subsys}_${msg.cmd}:${msg.seq}`
      self.emit(evt, msg.status, msg.data)
    } else if (msg.__intf === 'IND') {
      type = msg.type
      delete msg.__intf
      delete msg.type
      self.emit(type, msg)
    }
  }

  startSuccess = true
  return startSuccess
}

WsClient.prototype.stop = function () {
  let stopSuccess = false

  if (!this.isRunning()) return stopSuccess

  this._wsClient.terminate()

  this._wsClient.onopen = function () {}
  this._wsClient.onclose = function () {}
  this._wsClient.onmessage = function () {}
  this._wsClient.onerror = function () {}

  this._wsClient = null
  this._auth = false
  this._connected = false
  this.emit('close', 100, 'User closed.')

  stopSuccess = true
  return stopSuccess
}

WsClient.prototype.sendReq = function (subsys, cmd, args, callback) {
  const self = this
  let evt
  const reqMsg = {
    __intf: 'REQ',
    subsys,
    seq: self._nextTransId(),
    id: (args.id) ? args.id : null,
    cmd,
    args
  }
  let errMsg
  let rspListener

  proving.string(subsys, 'subsys must ba a string')
  proving.string(cmd, 'cmd must ba a string')
  proving.object(args, 'args must ba an object')
  proving.fn(callback, 'callback must ba a function')

  if (!this.isRunning()) errMsg = 'wsClient is not running.'
  else if (!this._connected) errMsg = 'wsClient connection is closed.'
  else if (!this._auth) errMsg = 'wsClient is not authenticated.'

  if (errMsg) {
    setImmediate(() => {
      callback(new Error(errMsg))
    })
  } else {
    evt = `${subsys}_${cmd}:${reqMsg.seq}`

    rspListener = function (status, data) {
      callback(null, { status, data })
    }

    // [TODO] timeout seconds? how to define a reasonable time
    setTimeout(() => {
      self.emit(evt, RSPCODE.TIMEOUT, {}) // { status: 'timeout', data: {} }
    }, REQ_TIMEOUT_SEC * 1000)

    this.once(evt, rspListener)
    this._wsClient.send(JSON.stringify(reqMsg))
  }
}

module.exports = WsClient
