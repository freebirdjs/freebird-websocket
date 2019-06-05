/* eslint-env mocha */
const _ = require('busyman')
const should = require('should')

const port = process.env.PORT || 5000
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

fb = new FbConstr()

describe('Constructor Check', () => {
  wsClient = new WsClient()

  it('WsClient()', () => {
    should(wsClient._wsClient).be.null()
    should(wsClient._auth).be.false()
    should(wsClient._connected).be.false()
    should(wsClient._nextTransId).be.Function()
  })
})

describe('Signature Check', () => {
  it('start(addr, options, authData)', () => {
    // (function () { wsClient.start('ws://localhost:' + port, {}); }).should.not.throw();
    // (function () { wsClient.start('ws://localhost:' + port, {}, {}); }).should.not.throw();

    (function () { wsClient.start({}, {}) }).should.throw();
    (function () { wsClient.start([], {}) }).should.throw();
    (function () { wsClient.start(123, {}) }).should.throw();
    (function () { wsClient.start(true, {}) }).should.throw();
    (function () { wsClient.start(undefined, {}) }).should.throw();
    (function () { wsClient.start(`ws://localhost:${port}`, []) }).should.throw();
    (function () { wsClient.start(`ws://localhost:${port}`, 123) }).should.throw();
    (function () { wsClient.start(`ws://localhost:${port}`, true) }).should.throw();
    (function () { wsClient.start(`ws://localhost:${port}`, undefined) }).should.throw();
    (function () { wsClient.start(`ws://localhost:${port}`, 'xxx') }).should.throw();
    (function () { wsClient.start(`ws://localhost:${port}`, {}, []) }).should.throw();
    (function () { wsClient.start(`ws://localhost:${port}`, {}, 123) }).should.throw();
    (function () { wsClient.start(`ws://localhost:${port}`, {}, true) }).should.throw();
    (function () { wsClient.start(`ws://localhost:${port}`, {}, undefined) }).should.throw();
    (function () { wsClient.start(`ws://localhost:${port}`, {}, 'xxx') }).should.throw()
  })

  it('sendReq(subsys, cmd, args, callback)', () => {
    (function () { wsClient.sendReq('xxx', 'xxx', {}, () => {}) }).should.not.throw();

    (function () { wsClient.sendReq({}, 'xxx', {}, () => {}) }).should.throw();
    (function () { wsClient.sendReq([], 'xxx', {}, () => {}) }).should.throw();
    (function () { wsClient.sendReq(123, 'xxx', {}, () => {}) }).should.throw();
    (function () { wsClient.sendReq(true, 'xxx', {}, () => {}) }).should.throw();
    (function () { wsClient.sendReq(undefined, 'xxx', {}, () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', {}, {}, () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', [], {}, () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', 123, {}, () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', true, {}, () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', undefined, {}, () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', [], () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', 123, () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', true, () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', undefined, () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', 'xxx', () => {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', {}, {}) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', {}, []) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', {}, 123) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', {}, true) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', {}, undefined) }).should.throw();
    (function () { wsClient.sendReq('xxx', 'xxx', {}, 'xxx') }).should.throw()
  })
})

describe('Functional Check', () => {
  it('start()', (done) => {
    server = http.createServer()
    server.listen(port)

    wsServer = new WsServer(fb)
    wsServer.start(server)

    wsClient.on('open', () => {
      if (wsClient._connected && wsClient._auth) done()
    })
    wsClient.start(`ws://localhost:${port}`, {})
  })

  it('sendReq()', (done) => {
    wsClient.sendReq('dev', 'write', { value: 'kitchen' }, (err, rsp) => {
      should(err).be.null()
      if (rsp.status === 1) done()
    })
  })

  it('stop()', (done) => {
    let checkFlag = false

    wsClient.on('close', (status) => {
      if (_.isNull(wsClient._wsClient) && wsClient._auth === false && wsClient._connected === false) checkFlag = true

      if (status === 100 && checkFlag) {
        wsServer.stop()
        done()
      }
    })
    wsClient.stop()
  })
})
