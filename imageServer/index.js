const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');
const videoService = require('./videoService');

const port = 3000 || process.env.PORT;
const host = 'localhost';

const user = '123';
const pass = '234';
const imageFolder = 'images';

function checkAuth(req) {
  let authHeader = req.headers['authorization'];
  if(!authHeader) {
    return false;
  }
  let token = authHeader.split(/\s+/).pop() || '';
  var auth = Buffer.from(token, 'base64').toString(); 
  var parts = auth.split(/:/);
  var username = parts.shift();
  var password = parts.join(':');
  return username === user && password === pass;
}

function notFound(res) {
  res.end('Not found');
}

function getCapture(req, res) {
  let stream = fs.createReadStream(path.resolve(__dirname, 'capture.jpeg'));
  stream.on('open', function () {
    stream.pipe(res);
  });
  stream.on('error', function () {
    respond404(res);
  });
}

function respond404(res) {
  res.statusCode = 404;
  res.end('Not found');
}

function getVideoList(req, res) {
  let list = videoService.getActualVideos();
  res.statusCode = 200;
  res.end(JSON.stringify(list));
}

function getVideo(req, res) {
  let query = url.parse(req.url, true).query;
  if(query.id === undefined) {
    respond404(res);
  }
  const stream = videoService.getVideoById(query.id)
  stream.on('open', function () {
    stream.pipe(res);
    res.setHeader('Content-Type', 'video/mp4')
  });
  stream.on('error', function () {
    respond404(res);
  });
}

function postCapture(req, res) {
  if(!checkAuth(req)){
    res.statusCode = 401;
    res.end('Not authorized');
    return;
  }
  let imagedata = '';
  req.setEncoding('binary');
  req.on('data', function(chunk){
    imagedata += chunk
  })
  req.on('end', function(data){
    videoService.saveCapture(imagedata);
    fs.writeFile(path.resolve(__dirname, imageFolder, 'capture.jpeg'), imagedata, 'binary', function(err){
        if (err) throw err
        res.end('Ok');
    })
  })
  req.on('error', function(){
    console.log('err')
  })
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Request-Method', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET');
	res.setHeader('Access-Control-Allow-Headers', '*');
}

function listener(req, res){
  setCORS(res);
  let url = req.url.split('?')[0];
  if(req.method === 'GET') {
    switch(url) {
      case '/capture':
        getCapture(req, res);
        break;
      case '/videoList':
        getVideoList(req, res);
        break;
      case '/video':
        getVideo(req, res);
        break;
      default:
        notFound(res)
    }
  } else if(req.method === 'POST') {
    switch(url) {
      case '/capture':
        postCapture(req, res);
        break;
      default:
        notFound(res)
    }
  }
}

let server = http.createServer(listener)
server.listen(port, host, () => {
  console.log('listen')
})