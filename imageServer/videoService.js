const fs = require('fs');
const path = require('path');
const { spawn } = require("child_process");

const imageFolder = 'images';
const maxImagesCount = 600;
const maxFoldersCount = 5;
let currentIndex = 0;
let currentFolder = '';

createNewDir().then(function(res){
  currentFolder = res;
  cleanUpOldData()
})

async function saveCapture(data) {
  if(currentIndex > maxImagesCount) {
    makeVideo(currentFolder);
    cleanUpOldData();
    await createNewDir();
    currentIndex = 0;
  }
  await writeFile(data);
  currentIndex++;
}

function makeVideo(folder) {
  const scrap = spawn('ffmpeg', ['-i', imageFolder + '/' + folder + '/%d.jpeg', '-r', '1', '-vcodec', 'libx264', '-pix_fmt', 'yuv420p', 'images/' + folder + '/result.mp4'])
  scrap.stdout.on("data", data => {
    console.log(`stdout: ${data}`);
  });

  scrap.stderr.on("data", data => {
    console.log(`stderr: ${data}`);
  });
  scrap.on("close", () => {
    clearDirectoryImages(imageFolder + '/' + folder);
  });
  scrap.on("error", () => {
    clearDirectoryImages(imageFolder + '/' + folder);
  });
}

function clearDirectoryImages(directoryPath) {
  fs.readdir(directoryPath, { withFileTypes: true }, function (err, files) {
    if (err) {
        return console.log('Unable to scan directory: ' + err);
    } 
    files.forEach(function (file) {
        if(file.name.endsWith('.jpg') || file.name.endsWith('.jpeg')){
          fs.unlink(path.resolve(directoryPath, file.name))
        }
    });
});
}

function getActualVideos() {
  return getFolders().filter((folder) => folder !== currentFolder);
}

function getVideoById(folderId) {
  return fs.createReadStream(path.resolve(__dirname, imageFolder, folderId, 'result.mp4'));
}

function cleanUpOldData() {
  let folders = getFolders();
  if(folders.length > maxFoldersCount) {
    foldersToDelete = folders.slice(0, folders.length - maxFoldersCount);
    for(i = 0; i < foldersToDelete.length; i++) {
      let dir = foldersToDelete[i];
      fs.rmdir(imageFolder + '/' + dir, { recursive: true }, (err) => {
        if (err) {
            throw err;
        }
        console.log(`${dir} is deleted!`);
      });
    }
  }
}

function getFolders() {
  let dirs = fs.readdirSync(imageFolder, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .sort((a, b) => { return a - b });
  return dirs;
}

function writeFile(data) {
  let promise = new Promise(function(res, rej) {
    fs.writeFile(path.resolve(__dirname, imageFolder, currentFolder, currentIndex + '.jpeg'), data, 'binary', function(err){
      if (err) throw err
      res()
    })
  })
  return promise;
}

function createNewDir() {
  let date = Date.now().toString()
  let promise = new Promise(function(res, rej) {
    fs.mkdir(path.resolve(__dirname, imageFolder, date), function() {
      currentFolder = date;
      res(currentFolder)
    })
  })
  return promise;
}

module.exports ={
  saveCapture,
  getActualVideos,
  getVideoById
}