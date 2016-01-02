'use strict';

var http = require('http');
var net = require('net');
var urlParser = require('url');
var fs = require('fs');

var REGEX_HOST_PORT = /^([^:]+)(:([0-9]+))?$/;

var parseHostAddress = function (hostAddress, defaultPort) {
    var host = hostAddress;
    var port = defaultPort;

    var result = REGEX_HOST_PORT.exec(hostAddress);
    if (result != null) {
        host = result[1];
        if (result[2] != null) {
            port = result[3];
        }
    }

    return ([host, port]);
};

function requestHandler(req, res) {
    var urlParts = urlParser.parse(req.url, true);

    console.log(req.method, req.url);

    var reqHeaders = req.headers;
    var options = {
        hostname: reqHeaders.host,
        method: req.method,
        path: urlParts.pathname
    };

    delete reqHeaders['host'];
    delete reqHeaders['user-agent'];
    options['headers'] = reqHeaders;

    var proxyReq = http.request(options, function (targetRes) {
        res.statusCode = targetRes.statusCode;

        // Log it
        res.setHeader('proxy-by', 'http-proxy-server');

        Object.getOwnPropertyNames(targetRes.headers).forEach(ele => {
            res.setHeader(ele, targetRes.headers[ele]);
        });

        targetRes.on('data', function (chunk) {
            res.write(chunk);
        });
        targetRes.on('end', function () {
            res.end();
        });
    });

    proxyReq.on('error', function (e) {
        console.log(e);
        res.statusCode = 500;
        res.write(e.message);
        res.end();
    });

    if (req.method === 'POST' || req.method === 'PUT') {
        req.on('data', function (chunk) {
            proxyReq.write(chunk);
        });
        req.on('end', function () {
            proxyReq.end();
        });
    } else {
        proxyReq.end();
    }
}

function connectHandler(req, socket, headBody) {
    var hostPort = parseHostAddress(req.url, 443);
    var host = hostPort[0];
    var port = parseInt(hostPort[1]);

    // Log it
    console.log('CONNECT %s:%d', host, port);

    var proxySocket = new net.Socket();
    proxySocket.connect(port, host, function () {
        proxySocket.write(headBody);
        socket.write("HTTP/" + req.httpVersion + " 200 Connection established\r\n\r\n");
    });

    proxySocket.on('data', function (chunk) {
        socket.write(chunk);
    });

    proxySocket.on('end', function () {
        socket.end();
    });

    proxySocket.on('error', function () {
        socket.write("HTTP/" + req.httpVersion + " 500 Connection error\r\n\r\n");
        socket.end();
    });

    socket.on('data', function (chunk) {
        proxySocket.write(chunk);
    });

    socket.on('end', function () {
        proxySocket.end();
    });

    socket.on('error', function () {
        proxySocket.end();
    });
}

var proxyServer = http.createServer(requestHandler);
proxyServer.listen(8080);
// 监听HTTPS协议的CONNECT事件
proxyServer.on('connect', connectHandler);

// pac文件服务
http.createServer(function (req, res) {
    var urlParts = urlParser.parse(req.url);
    if (urlParts.pathname === '/proxy_on.pac') {
        var rs = fs.createReadStream('./proxy_on.pac');
        rs.pipe(res);
    } else {
        res.statusCode = '404';
        res.end('不存在目标资源');
    }
}).listen(8081);
