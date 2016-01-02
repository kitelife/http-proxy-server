'use strict';

var http = require('http');
var https = require('https');
var urlParser = require('url');
var fs = require('fs');

function callback(req, res) {
    var urlParts = urlParser.parse(req.url, true);
    var reqHeaders = req.headers;

    var options = {
        hostname: reqHeaders.host,
        method: req.method,
        path: urlParts.pathname
    };

    delete reqHeaders['host'];
    delete reqHeaders['user-agent'];
    options['headers'] = reqHeaders;

    var targetProtocolModule;
    if (urlParts.protocol === 'http:') {
        targetProtocolModule = http;
    } else {
        targetProtocolModule = https;
    }

    var proxyReq = targetProtocolModule.request(options, function (targetRes) {
        res.statusCode = targetRes.statusCode;

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

var httpProxy = http.createServer(callback);

httpProxy.listen(8080);

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