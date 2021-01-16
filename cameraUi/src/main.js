const host = '0.0.0.0';
const port = 3000;

function loadLastVideos() {
  fetch(`${host}:${port}/videoList`)
    .then((response) => {
      return response.json();
    })
    .then((data) => {
      console.log(data);
      updateLinkList(data);
    });
}

function updateLinkList(links) {
  let html = '';
  links.map(function(link){
    let text = (new Date(parseInt(link, 10))).toLocaleString()
    let htmlLink = '<a href="' + host + ':' + port + '/video?id=' + link + '" target="_blank" filename="' + link +'.mp4">' + text + '</a>';
    html += htmlLink;
  })
  document.querySelector('#links').innerHTML = html;
}

document.addEventListener('DOMContentLoaded', function(){
  loadLastVideos();
})