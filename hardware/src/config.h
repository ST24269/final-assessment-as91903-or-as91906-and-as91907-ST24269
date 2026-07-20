/*
 * Tago RFID Reader - Configuration
 * =================================
 * All configuration constants for the ESP32 reader.
 * Edit this file to configure your reader.
 */

// =======================
// WIFI CONFIGURATION
// =======================
// #define WIFI_SSID              "N4L Wi-Fi"
 // #define WIFI_PASSWORD          "st24269"

// =======================
// SERVER CONFIGURATION
// =======================
#define SERVER_URL             "http://192.168.6.202:3001"  // Your server IP and port// =======================
// READER IDENTITY
// =======================
// Generate a unique API key for each reader and register it in the admin panel
#define READER_API_KEY         "GGUUZ9FNL9R3Q2QMRGNDEX8C"
#define READER_ID              "cc3f6c24-9b71-4bda-a8fb-0508fbccd2e8"      // UUID from readers table

// =======================
// FIRMWARE INFO
// =======================
#define FIRMWARE_VERSION       "1.1.0"
#define DEVICE_NAME            "Tago RFID Reader"

// =======================
// TIMING CONFIGURATION
// =======================
#define DEBOUNCE_MS            3000        // Minimum time between same card scans
#define HEARTBEAT_INTERVAL_MS  30000       // Heartbeat interval (30 seconds)
#define WIFI_RECONNECT_DELAY   5000        // Delay before retrying WiFi connection
#define HTTP_TIMEOUT_MS        10000       // HTTP request timeout

// =======================
// RETRY CONFIGURATION
// =======================
#define MAX_RETRY_ATTEMPTS     5           // Max retries for failed HTTP requests
#define INITIAL_BACKOFF_MS    1000        // Initial backoff delay (1 second)
#define MAX_BACKOFF_MS        60000       // Max backoff delay (60 seconds)

// =======================
// STORAGE CONFIGURATION
// =======================
#define MAX_CACHED_SCANS       100         // Max offline scans to store