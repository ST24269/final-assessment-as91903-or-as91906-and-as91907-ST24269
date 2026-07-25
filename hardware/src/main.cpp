/*
 * ESP32-S3 + RC522 RFID Reader - Tago Attendance Integration
 * =============================================================
 *
 * Wiring:
 *   RC522 SDA (SS) -> GPIO10
 *   RC522 SCK      -> GPIO12
 *   RC522 MOSI     -> GPIO11
 *   RC522 MISO     -> GPIO13
 *   RC522 RST      -> GPIO9
 *   RC522 GND      -> GND
 *   RC522 3.3V     -> 3.3V
 *
 *   Buzzer +       -> GPIO4
 *   Buzzer -       -> GND
 */

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include "config.h"
#include "network.h"
#include "storage.h"
#include "wifi_manager.h"

#define RC522_SS_PIN     10
#define RC522_RST_PIN    9
#define RC522_SCK_PIN    12
#define RC522_MOSI_PIN   11
#define RC522_MISO_PIN   13

MFRC522 rfid(RC522_SS_PIN, RC522_RST_PIN);
NetworkManager* network = nullptr;
OfflineStorage storage;

String lastUID = "";
unsigned long lastScanTime = 0;

// Starts FALSE (not "already active") so the very first successful scan
// of a boot cycle always announces the session-start chime, instead of
// only firing after a prior failure.
bool sessionKnownActive = false;

// =======================
// BUZZER FEEDBACK
// Every pattern below is deliberately a different rhythm/length so none
// of them can be confused with each other, even on a simple on/off
// active buzzer with no pitch control.
// =======================

void initBuzzer() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
}

void beep(int duration) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(duration);
  digitalWrite(BUZZER_PIN, LOW);
}

// Attendance marked. One short, single beep.
void beepSuccess() {
  beep(150);
}

// Same card tapped twice within DEBOUNCE_MS. Two quick beeps, short
// gap, two more quick beeps - as requested.
void beepDuplicateTap() {
  beep(70);
  delay(60);
  beep(70);
  delay(150);   // short gap between the two pairs
  beep(70);
  delay(60);
  beep(70);
}

// Card not recognised / server rejected it (not a session issue). One
// long steady buzz - unmistakably different from everything else, and
// impossible to confuse with the short success beep.
void beepUnknownCard() {
  beep(500);
}

// No active session for this room. Two medium, evenly-spaced beeps -
// calm rhythm since this isn't the card's fault.
void beepNoSession() {
  beep(250);
  delay(200);
  beep(250);
}

// No WiFi / server unreachable, cached for later. Long-short.
void beepCached() {
  beep(200);
  delay(100);
  beep(70);
}

// Class session has just started. Five-beep fanfare - more beeps than
// any other tone, so it's unmistakable.
void beepSessionStarted() {
  beep(80);
  delay(70);
  beep(80);
  delay(70);
  beep(80);
  delay(70);
  beep(120);
  delay(90);
  beep(200);
}

// Startup chirp.
void beepBootOK() {
  beep(50);
  delay(80);
  beep(50);
  delay(80);
  beep(120);
}

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

bool initRFID() {
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

bool initStorage() {
  if (!storage.begin()) {
    Serial.println("ERROR: Failed to initialize storage");
    return false;
  }

  int pendingCount = storage.getPendingCount();
  Serial.printf("Storage initialized. %d pending scans in queue.\n", pendingCount);
  return true;
}

/**
 * Process a scanned card. Each ScanResult maps to exactly ONE buzzer
 * tone - no shared code paths, so an unknown-card tone can never bleed
 * into a later approved tap.
 */
void processScan(const String& uidString, const String& timestamp) {
  if (!network->isWiFiConnected()) {
    Serial.println("WiFi not connected, caching scan for later");
    storage.saveScan(uidString, timestamp);
    beepCached();
    return;
  }

  ScanResult result = network->sendScan(uidString, timestamp);

  switch (result) {
    case ScanResult::SUCCESS:
    case ScanResult::DUPLICATE:
      beepSuccess();
      if (!sessionKnownActive) {
        beepSessionStarted();
        sessionKnownActive = true;
      }
      break;

    case ScanResult::NO_SESSION:
      Serial.println("No active session - not caching, ready for next tap");
      beepNoSession();
      sessionKnownActive = false;
      break;

    case ScanResult::UNKNOWN_CARD:
      Serial.println("Unknown/rejected card - not caching, ready for next tap");
      beepUnknownCard();
      break;

    case ScanResult::NETWORK_ERROR:
      Serial.println("Network error, caching for offline retry");
      storage.saveScan(uidString, timestamp);
      beepCached();
      break;
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

  initBuzzer();
  printBootConfig();
  setupWiFi();

  if (!initRFID()) {
    while (1) delay(1000);
  }

  if (!initStorage()) {
    while (1) delay(1000);
  }

  network = new NetworkManager(SERVER_URL, READER_API_KEY, READER_ID, FIRMWARE_VERSION);
  network->begin();

  beepBootOK();

  Serial.println();
  Serial.println("Ready. Tap a card on the reader...");
  Serial.println("========================================");
}

void loop() {
  if (network) {
    network->update();

    if (network->needsHeartbeat(HEARTBEAT_INTERVAL_MS)) {
      network->sendHeartbeat();
    }

    if (network->isWiFiConnected() && storage.getPendingCount() > 0
        && network->canRetryUploadNow()) {
      network->uploadCachedScans(storage);
    }
  }

  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String uidString = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uidString += "0";
    uidString += String(rfid.uid.uidByte[i], HEX);
  }
  uidString.toUpperCase();

  Serial.print("Card UID: ");
  Serial.println(uidString);

  unsigned long now = millis();
  if (uidString == lastUID && (now - lastScanTime) < DEBOUNCE_MS) {
    Serial.println("Debounce: same card tapped too soon");
    beepDuplicateTap();
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(500);
    return;
  }

  lastUID = uidString;
  lastScanTime = now;

  processScan(uidString, "");

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(500);
}