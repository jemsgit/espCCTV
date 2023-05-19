# espCCTV

Simple CCTV based on ESP32-CAM and Node.JS

This ESP32 firmware allows you to:
- setup config via post request with basic authentication and store it filesystem of controller
- update firmware wifeless using Arduino OTA
- select wifi point to connect without device flashing

In this firmware ESPAsyncWebServer and esp_http_client conflicts has resolved with namespaces feature.

NodeJS server saves captured data and make video file with ffmpeg. Also it serves files so you can view and download it through web site.

## Usage
### ESP32

For ESP32-CAM upload sketch esp_configurable_float_fps.ino

### Server

Install FFMPEG for you distributive

Go to imageServer

`npm i`

`npm start`
