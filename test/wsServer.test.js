/* eslint-env mocha */
const _ = require('busyman')
const ws = require('ws')
const util = require('util')
const { EventEmitter } = require('events')
const should = require('should')

const port = process.env.PORT || 5001
const http = require('http')
const WsServer = require('../lib/wsServer')
const WsClient = require('../lib/wsClient')

let server
let wsServer
let wsClient
let fb
const FbConstr = function () {
  this.authorize = function (a, b) { b(null, true) }
  this.authenticate = function (a, b, c) { c(null, true) }
  this.dev = {}

  this.find = function () {}
}

util.inherits(FbConstr, EventEmitter)
fb = new FbConstr()

describe('Constructor Check', () => {
  it('WsServer()', () => {
    wsServer = new WsServer(fb)

    should(wsServer._freebird).be.equal(fb)
    should(wsServer._wsServer).be.null()
    should(wsServer._wsClients).be.deepEqual([])
  })
})

describe('Signature Check', () => {
  it('start()', () => {
    (function () { wsServer.start() }).should.throw();
    (function () { wsServer.start({}) }).should.throw();
    (function () { wsServer.start([]) }).should.throw();
    (function () { wsServer.start(123) }).should.throw();
    (function () { wsServer.start(true) }).should.throw();
    (function () { wsServer.start('abc') }).should.throw()
  })

  it('receiveFreebirdEvent()', () => {
    (function () { wsServer.receiveFreebirdEvent({}, {}) }).should.throw();
    (function () { wsServer.receiveFreebirdEvent([], {}) }).should.throw();
    (function () { wsServer.receiveFreebirdEvent(123, {}) }).should.throw();
    (function () { wsServer.receiveFreebirdEvent(true, {}) }).should.throw();
    (function () { wsServer.receiveFreebirdEvent('abc', {}) }).should.throw();
    (function () { wsServer.receiveFreebirdEvent('devError', []) }).should.throw();
    (function () { wsServer.receiveFreebirdEvent('devError', 123) }).should.throw();
    (function () { wsServer.receiveFreebirdEvent('devError', true) }).should.throw();
    (function () { wsServer.receiveFreebirdEvent('devError', 'abc') }).should.throw()
  })
})

describe('Functional Check', () => {
  it('start()', (done) => {
    server = http.createServer()
    server.listen(port)

    wsServer.start(server)

    if (wsServer._wsServer instanceof ws.Server) done()
  })

  it('isRunning()', () => {
    wsServer.isRunning().should.be.true()
  })

  it('_initClient()', (done) => {
    /** * test authenticate success ** */
    wsClient = new WsClient()
    wsClient.start(`ws://localhost:${port}`, {})

    wsClient.on('open', () => {
      const connClient = wsServer._wsClients[0].client
      if (connClient instanceof ws && connClient._auth) done()
    })

    /** * test authenticate error ** */
    // wsServer._fb.authenticate = function (a, b, c) { c(null, false); }
    // wsClient = new WsClient();
    // wsClient.start('ws://localhost:' + port, {});

    // wsServer._wsServer.on('connection', function () {
    //     wsClient.on('close', function (status, data) {
    //         if (status === 3001 && _.isEqual(wsServer._wsClients, []))
    //             done();
    //     });
    // });
  })

  it('_reqHdlr()', function (done) {
    this.timeout(3000)
    wsClient.sendReq('dev', 'write', { value: 'kitchen' }, (err, rspCode) => {
      should(err).be.null()
      if (rspCode.status === 1) done()
    })
  })

  it('_sendRsp()', (done) => {
    const reqMsg = {
      __intf: 'REQ',
      subsys: 'dev',
      seq: 5,
      id: 6,
      cmd: 'write',
      args: { value: 'kitchen' }
    }

    wsClient._wsClient.on('message', (msg) => {
      const rspMsg = {
        __intf: 'RSP',
        subsys: 'dev',
        seq: 5,
        id: 6,
        cmd: 'write',
        status: 3,
        data: 'unavailable'
      }

      if (_.isEqual(JSON.parse(msg), rspMsg)) done()
    })
    wsServer._sendRsp(wsServer._wsClients[0].client, reqMsg, 3, 'unavailable')
  })

  it('_sendInd()', (done) => {
    // const nc = {
    //   dump () { return { name: 'ble-core' } }
    // }
    const data = {
      netcore: 'ble-core',
      duration: 100
    }

    wsClient.on('permitJoining', (msg) => {
      const indMsg = {
        subsys: 'net',
        id: null,
        data
      }

      if (_.isEqual(msg, indMsg)) done()
    })

    wsServer.receiveFreebirdEvent('permitJoin', data)
  })

  it('stop()', () => {
    wsServer.stop()
    should(wsServer._wsServer).be.null()
    should(wsServer._wsClients).be.deepEqual([])
  })
})
