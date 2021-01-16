#include "esp_camera.h"

#include <FS.h>  
#include <SPIFFS.h>
#include <ArduinoJson.h>

#define CAMERA_MODEL_AI_THINKER
#include "camera_pins.h"

#include <WiFiManager.h>         // https://github.com/tzapu/WiFiManager

#define WEBSERVER_H  //to resolve wifimanager and ESPAsyncWebServer conflict
#include <ESPAsyncWebServer.h>

#include <ArduinoOTA.h>

// create namespace because of wifimanager and ESPAsyncWebServer and esp_http_client libraries conflict (defined same constants)
namespace esp_client {
  #include "esp_http_client.h"

  class Client
   {
    public:
      Client(String serverUrl, const char* boundary, String authHeader) {
        _client = NULL;
        _serverUrl = serverUrl;
        _boundary = boundary;
        _authHeader = authHeader;
      }
      
      void close_connection() {
        esp_err_t err = esp_http_client_close(_client);
        esp_http_client_cleanup(_client);
        _client = NULL;
        if (err == ESP_OK) {
          Serial.println("Connection closed.");
        } else {
          Serial.println("Connection closed with error.");
        }
      }
      
      void open_connection() {
        esp_http_client_config_t config = {
          .url = _serverUrl.c_str()
        };
        _client = esp_http_client_init(&config);
        esp_err_t res = esp_http_client_open(_client, -1);
        while (res != ESP_OK) {
          Serial.println("Cannot open a connection: retrying...");
          res = esp_http_client_open(_client, -1);
          if (res != ESP_OK) {
            Serial.println("Still cannot open a connection... delaying");
            delay(1000);
          }
        }
        Serial.println("Connection opened.");
      }
      
      void reset_connection() {
        close_connection();
        open_connection();
      }

      void reset_connection(String serverUrl, String authHeader) {
        _serverUrl = serverUrl;
        _authHeader = authHeader;
        close_connection();
        open_connection();
      }
      
      void client_write_full(uint8_t * buf, size_t len) {
        char chunk_length[20];
        itoa((int) len + 18, chunk_length, 16);
        int length_size = strlen(chunk_length);
      
        int res = -1;
        while (res == -1) {
          res = esp_http_client_write(_client, chunk_length, length_size); // length
          if (res == -1) {
            Serial.println("Cannot write length... repeating");
            reset_connection();
            continue;
          }
          res = esp_http_client_write(_client, "\r\n", 2);
          if (res == -1) {
            Serial.println("Cannot write length separator... repeating");
            reset_connection();
            continue;
          }
          res = esp_http_client_write(_client, (const char *)buf, len); // data
          if (res == -1) {
            Serial.println("Cannot write data... repeating");
            reset_connection();
            continue;
          }
          res = esp_http_client_write(_client, _boundary, 18); // data
          if (res == -1) {
            Serial.println("Cannot write boundary... repeating");
            reset_connection();
            continue;
          }
          res = esp_http_client_write(_client, "\r\n", 2);
          if (res == -1) {
            Serial.println("Cannot write final separator... repeating");
            reset_connection();
            continue;
          }
        }
      }
      
    void send_capture() {
      camera_fb_t * fb = NULL;
      int64_t fr_start = esp_timer_get_time();
    
      if (_client == NULL) {
        open_connection();
      }
      esp_http_client_set_header(_client, "Authentication", _authHeader.c_str());
      fb = esp_camera_fb_get();
      if (!fb) {
        ESP_LOGE(TAG, "Camera capture failed");
        return;
      }
    
      if (fb->format == PIXFORMAT_JPEG) {
        client_write_full(fb->buf, fb->len);
      } else {
        Serial.println("Wrong format set!");
        delay(100000);
      }
    
      esp_camera_fb_return(fb);
    
      int64_t fr_end = esp_timer_get_time();
    
      uint32_t kb = (uint32_t)(fb->len / 1024);
      uint32_t ms = (uint32_t)((fr_end - fr_start) / 1000);
      Serial.print("Sent: ");
      Serial.print(kb);
      Serial.print("KB ");
      Serial.print(ms);
      Serial.println("MS");
    }

    private:
      esp_http_client_handle_t _client;
      String _serverUrl;
      String _authHeader;
      const char* _boundary;
    };
}

const char* boundary = "FRAME-BOUNDARY-123";
String authHeader = "Basic base64"; //user:password in base64

String serverUrl = "http://192.168.0.100:3000/capture"; //target url
char* http_username = "user"; //auth for esp settings server
char* http_password = "password"; //auth for esp settings server

esp_client::Client *ESP_CLIENT;
AsyncWebServer server(80);

void handleBody(AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
  if (request->url() == "/settings") {
    if(!request->authenticate(http_username, http_password))
      return request->requestAuthentication();
    StaticJsonDocument<1024> doc;
    Serial.printf("[REQUEST]\t%s\r\n", (const char*)data);
    DeserializationError error = deserializeJson(doc, (char*) data);
    if(!error) {
      request->send_P(200, "text/plain", "Ok");
      const char* url = doc["url"];
      const char* auth = doc["authtoken"];
      serverUrl = String(url);
      authHeader = String(auth);
      saveConfig(serverUrl, authHeader);
      ESP_CLIENT->reset_connection(serverUrl, authHeader);
    } else {
      request->send_P(400, "text/plain", "Bad request");
    }
  }
}

bool saveConfig(String url, String token) {
    File file = SPIFFS.open("/config.json", "w");
    DynamicJsonDocument doc(1024);
    doc["url"] = url;
    doc["authtoken"] = token;
    serializeJson(doc, file);
    file.close();
    return true;
}

void createDefaultConfig() {
  saveConfig(serverUrl,authHeader);
}

bool loadConfig() {
  File configFile = SPIFFS.open("/config.json", "r");
  if (!configFile) {
    Serial.println("Failed to open config file");
    return false;
  }

  size_t size = configFile.size();
  if (size > 1024) {
    Serial.println("Config file size is too large");
    return false;
  }

  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, configFile);
  if (error) {
    Serial.println("Failed to parse config file");
    Serial.println(error.c_str());
    return false;
  }

  const char* url = doc["url"];
  const char* auth = doc["authtoken"];
  serverUrl = String(url);
  authHeader = String(auth);

  return true;
}

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  Serial.println();
  bool success = SPIFFS.begin(true);
  if (success) {
    Serial.println("File system mounted with success");
  } else {
     Serial.println("Error mounting the file system");
  }

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  //init with high specs to pre-allocate larger buffers
  if (psramFound()) {
    config.frame_size = FRAMESIZE_UXGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_UXGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

#if defined(CAMERA_MODEL_ESP_EYE)
  pinMode(13, INPUT_PULLUP);
  pinMode(14, INPUT_PULLUP);
#endif

  // camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    return;
  }

  sensor_t * s = esp_camera_sensor_get();
  //initial sensors are flipped vertically and colors are a bit saturated
  if (s->id.PID == OV3660_PID) {
    s->set_vflip(s, 1);//flip it back
    s->set_brightness(s, 1);//up the blightness just a bit
    s->set_saturation(s, -2);//lower the saturation
  }
  //drop down frame size for higher initial frame rate
  //s->set_framesize(s, FRAMESIZE_QVGA);

#if defined(CAMERA_MODEL_M5STACK_WIDE)
  s->set_vflip(s, 1);
  s->set_hmirror(s, 1);
#endif
  if(!loadConfig()) {
    createDefaultConfig();
  }
  WiFiManager wifiManager;
  wifiManager.autoConnect("AutoConnectAP");
  
  ESP_CLIENT = new esp_client::Client(serverUrl, boundary, authHeader);

  server.onRequestBody(handleBody);
  server.begin();

  delay(2000);

  ArduinoOTA.onStart([]() {
    Serial.println("Start");
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\nEnd");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) Serial.println("Auth Failed");
    else if (error == OTA_BEGIN_ERROR) Serial.println("Begin Failed");
    else if (error == OTA_CONNECT_ERROR) Serial.println("Connect Failed");
    else if (error == OTA_RECEIVE_ERROR) Serial.println("Receive Failed");
    else if (error == OTA_END_ERROR) Serial.println("End Failed");
  });
  ArduinoOTA.begin();
}

void loop() {
  ArduinoOTA.handle();
  ESP_CLIENT->send_capture();
}
