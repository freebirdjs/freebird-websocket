var WsClient = require('../lib/wsClient'),
	WsServer = require('../lib/wsServer'),
	should = require('should');

describe('Constructor Check', function () {
	var wsClient = new WsClient();

	it('WsClient()', function () {
        should(wsClient._wsClient).be.null();
        should(wsClient._auth).be.false();
        should(wsClient._connected).be.false();
        should(wsClient._nextTransId).be.Function();
	});
});

describe('Functional Check', function () {
	it('start()', function () {
		
	});

	it('stop()', function () {

	});

	it('sendReq()', function () {

	});
})