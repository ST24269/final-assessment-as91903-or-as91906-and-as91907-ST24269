/*
 * ESP32-S3 + RC522 RFID Reader - Tago Attendance Integration
 * =============================================================
 * Reads card UIDs over SPI, sends to Tago backend via HTTP POST.
 *
 * Wiring:
 *   RC522 SDA (SS) -> GPIO10
 *   RC522 SCK      -> GPIO12
 *   RC522 MOSI     -> GPIO11
 *   RC522 MISO     -> GPIO13
 *   RC522 RST      -> GPIO9
 *   RC522 IRQ      -> not connected
 *   RC522 GND      -> GND
 *   RC522 3.3V     -> 3.3V
 *
 * Responsibilities:
 *   - Initialize hardware (SPI, RC522)
 *   - Provision + connect to WiFi via captive portal (WiFiManager)
 *   - Initialize storage and network managers
 *   - Run main event loop for card detection
 */

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include "config.h"
#include "network.h"
#include "storage.h"
#include "wifi_manager.h"
// =======================
// HARDWARE PIN MAPPING
// =======================
#define RC522_SS_PIN     10
#define RC522_RST_PIN    9
#define RC522_SCK_PIN    12
#define RC522_MOSI_PIN   11
#define RC522_MISO_PIN   13

// Global instances
MFRC522 rfid(RC522_SS_PIN, RC522_RST_PIN);
NetworkManager* network = nullptr;
OfflineStorage storage;

// Application state
String lastUID = "";
unsigned long lastScanTime = 0;

/**
 * Print device configuration on boot for verification
 */
void printBootConfig() {
  Serial.println("========================================");
  Serial.println("Device Configuration (from config.h)");
  Serial.println("========================================");
  Serial.printf("Device:       %s\n", DEVICE_NAME);
  Serial.printf("Firmware:     %s\n", FIRMWARE_VERSION);
  Serial.printf("Reader ID:    %s\n", READER_ID);
  Serial.printf("Server URL:   %s\n", SERVER_URL);
  Serial.println("========================================");
}

/**
 * Initialize hardware - RC522 RFID reader
 */
bool initRFID() {
  // Initialize SPI and RC522
  SPI.begin(RC522_SCK_PIN, RC522_MISO_PIN, RC522_MOSI_PIN, RC522_SS_PIN);
  rfid.PCD_Init();
  delay(50);

  byte version = rfid.PCD_ReadRegister(rfid.VersionReg);
  Serial.print("RC522 version register: 0x");
  Serial.println(version, HEX);

  if (version == 0x00 || version == 0xFF) {
    Serial.println("ERROR: RC522 not responding. Check wiring and power.");
    return false;
  }

  Serial.println("RC522 initialised OK.");
  return true;
}

/**
 * Initialize storage (NVS/Preferences)
 */
bool initStorage() {
  if (!storage.begin()) {
    Serial.println("ERROR: Failed to initialize storage");
    return false;
  }

  int pendingCount = storage.getPendingCount();
  if (pendingCount > 0) {
    Serial.printf("Storage initialized. %d pending scans in queue.\n", pendingCount);
  } else {
    Serial.println("Storage initialized. No pending scans.");
  }
  return true;
}

/**
 * Process a scanned card - send to server or cache offline
 */
void processScan(const String& uidString, const String& timestamp) {
  // Try to send immediately if WiFi is available
  if (network->isWiFiConnected()) {
    bool success = network->sendScan(uidString, timestamp);
    if (!success) {
      // Failed to send, cache for later
      Serial.println("Failed to send, caching for offline retry");
      storage.saveScan(uidString, timestamp);
    }
  } else {
    // No WiFi, cache immediately
    Serial.println("WiFi not connected, caching scan for later");
    storage.saveScan(uidString, timestamp);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("========================================");
  Serial.println("ESP32-S3 + RC522 - Tago Attendance");
  Serial.println("========================================");
  Serial.println();

  // Print configuration for verification
  printBootConfig();

  // Provision + connect WiFi via captive portal (blocks until connected)
  setupWiFi();

  // Initialize RFID hardware
  if (!initRFID()) {
    while (1) delay(1000);
  }

  // Initialize storage
  if (!initStorage()) {
    while (1) delay(1000);
  }

  // Initialize network manager.
  // WiFi is already connected by setupWiFi() above, so SSID/password are
  // no longer read from config.h - only server/auth details are needed.
  network = new NetworkManager(
    SERVER_URL,
    READER_API_KEY,
    READER_ID,
    FIRMWARE_VERSION
  );
  network->begin();

  Serial.println();
  Serial.println("Ready. Tap a card on the reader...");
  Serial.println("========================================");
}

void loop() {
  // Update network (handle reconnects, heartbeats)
  if (network) {
    network->update();

    // Send heartbeat periodically
    if (network->needsHeartbeat(HEARTBEAT_INTERVAL_MS)) {
      network->sendHeartbeat();
    }

    // Try to upload any pending cached scans
    if (network->isWiFiConnected() && storage.getPendingCount() > 0) {
      network->uploadCachedScans(storage);
    }
  }

  // Check for new card
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  // Build UID string
  String uidString = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uidString += "0";
    uidString += String(rfid.uid.uidByte[i], HEX);
  }
  uidString.toUpperCase();

  Serial.print("Card UID: ");
  Serial.println(uidString);

  // Debounce: ignore if same UID within DEBOUNCE_MS
  unsigned long now = millis();
  if (uidString == lastUID && (now - lastScanTime) < DEBOUNCE_MS) {
    Serial.println("Debounce: Ignored (same card tapped too soon)");
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(500);
    return;
  }

  // Update last scan tracking
  lastUID = uidString;
  lastScanTime = now;

  // Generate timestamp
  char timestamp[32];
  snprintf(timestamp, sizeof(timestamp), "%lu", now / 1000);

  // Process the scan
  processScan(uidString, timestamp);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(500);
}