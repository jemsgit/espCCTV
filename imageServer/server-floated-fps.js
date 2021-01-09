const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');
const formidable = require('formidable');
const rxjs = require('rxjs');
const operators = require('rxjs/operators');
const videoService = require('./videoService-float-fps');

const port = 3000 || process.env.PORT;
const host = '0.0.0.0';

const user = '123';
const pass = '234';
const imageFolder = 'images';

const BOUNDARY = 'FRAME-BOUNDARY-123';
const BOUNDARY_BUFFER = Buffer.from(BOUNDARY);
const BOUNDARY_LENGTH = BOUNDARY_BUFFER.length

const DEFAULT = fs.readFileSync(path.resolve(__dirname, imageFolder, 'capture.jpeg'))

const subject = new rxjs.BehaviorSubject(DEFAULT);

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

function respond404(res) {
  res.statusCode = 404;
  notFound(res);
}

function notFound(res) {
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
  stream.on('error', function (e) {
    console.log(e)
    respond404(res);
  });
}

function postCaptureStream(req, res) {
  if(!checkAuth(req)){
    //res.statusCode = 401;
    //res.end('Not authorized');
    //return;
  }
  let body = [];
    req.on('error', (err) => {
        console.log('error;', err);
    }).on('data', (chunk) => {
        //console.log('Got frame')
        const boundaryIndex = chunk.indexOf(BOUNDARY_BUFFER)
        const includesBoundary = boundaryIndex !== -1;
        if (includesBoundary) {
            const lastPart = chunk.slice(0, boundaryIndex);

            if (lastPart.length) {
                body.push(lastPart);
            }

            subject.next(Buffer.concat(body))
            videoService.saveCapture(Buffer.concat(body));
            body = [];

            const nextPart = chunk.slice(boundaryIndex + BOUNDARY_LENGTH)

            if (nextPart.length) {
                body.push(nextPart)
            }
        } else {
            body.push(chunk)
        }
    });
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Request-Method', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET');
	res.setHeader('Access-Control-Allow-Headers', '*');
}

function getMjpegCapture(req, res) {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=myboundary',
    'Cache-Control': 'no-cache',
    'Connection': 'close',
    'Pragma': 'no-cache'
  });
// For some reason mjpeg needs to be sent twice initially in order to display first frame
  const subscription = rxjs.concat(subject.pipe(operators.first()), subject).subscribe((buffer) => {
    res.write("--myboundary\r\n");
    res.write("Content-Type: image/jpeg\r\n");
    res.write("Content-Length: " + buffer.length + "\r\n");
    res.write("\r\n");
    res.write(buffer, 'binary');
    res.write("\r\n");
  })
  req.on("close", function() {
      subscription.unsubscribe();
      res.end();
  });

  req.on("end", function() {
      subscription.unsubscribe();
      res.end();
  });
}

function listener(req, res){
  setCORS(res);
  let url = req.url.split('?')[0];
  if(req.method === 'GET') {
    switch(url) {
      case '/capture.mjpeg':
        getMjpegCapture(req, res);
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
        postCaptureStream(req, res);
        break;
      default:
        notFound(res)
    }
  }
}

let server = http.createServer(listener);
server.listen(port, host, () => {
  console.log('listen')
})