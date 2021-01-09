const fs = require('fs');
const path = require('path');
const { spawn } = require("child_process");

const imageFolder = 'images';
const videoFolder = 'videos';
const videoDurationInSeconds = 10*60;
const maxFoldersCount = 5;
const imageNameLength = 7;

let currentIndex = 0;
let currentFolder = '';

subscribeOnCaptureEnd(processVideo);

createNewDir().then(function(res){
  currentFolder = res;
  cleanUpOldDataImages();
  cleanUpOldDataVideo();
})

function cleanUpOldDataVideo() {
  cleanUpOldData(videoFolder);
}

function cleanUpOldDataImages() {
  cleanUpOldData(imageFolder);
}

function cleanUpOldData(folder) {
  let folders = getFolders(folder);
  console.log(folders)
  if(folders.length > maxFoldersCount) {
    foldersToDelete = folders.slice(0, folders.length - maxFoldersCount);
    for(i = 0; i < foldersToDelete.length; i++) {
      let dir = foldersToDelete[i];
      fs.rmdir(path.resolve(__dirname, folder + '/' + dir), { recursive: true }, (err) => {
        if (err) {
            throw err;
        }
        console.log(`${dir} is deleted!`);
      });
    }
  }
}

function getFolders(folder) {
  let dirs = fs.readdirSync(path.resolve(__dirname, folder), { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort((a, b) => { return a - b });
  return dirs;
}

async function saveCapture(data) {
  console.log('capture');
  await writeFile(data);
  currentIndex++;
  console.log(currentIndex);
}

function subscribeOnCaptureEnd(cb) {
  setTimeout(async function() {
    await cb();
    subscribeOnCaptureEnd(cb);
  }, videoDurationInSeconds * 1000);
}

async function processVideo() {
  makeVideo(currentFolder);
  cleanUpOldDataImages();
  cleanUpOldDataVideo();
  await createNewDir();
  currentIndex = 0;
}

function makeVideo(folder) {
  let fps = 1;
  let files = fs.readdirSync(path.resolve(__dirname, imageFolder, folder));
  if(!files.length) {
    clearDirectoryImages(folder);
    clearDirectoryVideos(folder);
    return;
  }
  fps = files.length / videoDurationInSeconds;
  console.log('fps calculation');
  console.log(fps);
  if(fps < 1) {
    fps = 1;
  }
  const scrap = spawn('ffmpeg', ['-framerate', fps.toString(), '-i', imageFolder + '/' + folder + '/%7d.jpeg', '-vcodec', 'libx264', '-pix_fmt', 'yuv420p', videoFolder + '/' + folder + '/result.mp4'])
  scrap.stdout.on("data", data => {
    console.log(`stdout: ${data}`);
  });

  scrap.stderr.on("data", data => {
    console.log(`stderr: ${data}`);
  });
  scrap.on("close", () => {
    clearDirectoryImages(folder);
  });
  scrap.on("error", () => {
    //clearDirectoryImages(folder);
  });
}

function clearDirectoryImages(directoryPath) {
  fs.rmdir(path.resolve(__dirname, imageFolder, directoryPath), { recursive: true }, (err) => {
    if(err) {
      console.error(err)
    }
  })
}

function clearDirectoryVideos(directoryPath) {
  fs.rmdir(path.resolve(__dirname, videoFolder, directoryPath), { recursive: true }, (err) => {
    if(err) {
      console.error(err)
    }
  })
}

function createNewDir() {
  let date = Date.now().toString()
  let promise = new Promise(function(res, rej) {
    fs.mkdir(path.resolve(__dirname, imageFolder, date), function() {
      currentFolder = date;
      fs.mkdir(path.resolve(__dirname, videoFolder, date), function() {
        res(currentFolder)
      })
    })
  })
  return promise;
}

function getActualVideos() {
  return getFolders(videoFolder).filter((folder) => folder !== currentFolder);
}

function getVideoById(folderId) {
  return fs.createReadStream(path.resolve(__dirname, videoFolder, folderId, 'result.mp4'));
}

function writeFile(data) {
  let promise = new Promise(function(res, rej) {
    fs.writeFile(path.resolve(__dirname, imageFolder, currentFolder, addZeros(currentIndex) + '.jpeg'), data, 'binary', function(err){
      if (err) throw err
      res()
    })
  })
  return promise;
}

function addZeros(index) {
  let numberLenght = index.toString().length;
  let name = ''
  for(i = 0; i < imageNameLength - numberLenght; i++) {
    name +='0';
  }
  return name + index.toString();
}

module.exports ={
  saveCapture,
  getActualVideos,
  getVideoById
}