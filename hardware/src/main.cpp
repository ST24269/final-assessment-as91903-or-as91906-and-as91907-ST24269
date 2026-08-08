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
 *
 *   Blue LED +     -> GPIO5 -> 220ohm resistor -> LED anode
 *   Blue LED -     -> GND
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

// =======================
// TAP DEBOUNCE / ESCALATION
// =======================
String lastUID = "";
unsigned long lastTapTime = 0;
uint8_t tapCountInBurst = 0;
unsigned long currentDebounceMs = DEBOUNCE_MS;
bool alertSentForBurst = false;

const unsigned long MAX_DEBOUNCE_MS = 30000;
const uint8_t ALERT_TAP_THRESHOLD = 3;

bool sessionKnownActive = false;

// =======================
// BUZZER + LED FEEDBACK
// =======================
// The blue LED is driven in lock-step with the buzzer inside beep(), so
// every existing feedback pattern (beepSuccess, beepUnknownCard,
// beepNotEnrolled, etc.) automatically gets a matching visual flash with
// zero changes needed at each call site.

void initBuzzer() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
}

void initLed() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
}

void beep(int duration) {
  digitalWrite(BUZZER_PIN, HIGH);
  digitalWrite(LED_PIN, HIGH);
  delay(duration);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
}

// Fires immediately on power-on, before WiFi/RFID/storage init - confirms
// the device is alive even if WiFi setup takes a while.
void beepPoweredOn() {
  beep(100);
}

void beepSuccess() {
  beep(150);
}

void beepDuplicateTap() {
  beep(70);
  delay(60);
  beep(70);
  delay(150);
  beep(70);
  delay(60);
  beep(70);
}

void beepUnknownCard() {
  beep(500);
}

void beepNoSession() {
  beep(250);
  delay(200);
  beep(250);
}

// Distinct from beepUnknownCard/beepNoSession: three short beeps means
// "this card is recognised, but not enrolled in the class currently
// running" - previously this incorrectly played beepSuccess() instead,
// making a rejected tap sound identical to a successful one.
void beepNotEnrolled() {
  beep(90);
  delay(90);
  beep(90);
  delay(90);
  beep(90);
}

void beepCached() {
  beep(200);
  delay(100);
  beep(70);
}

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
      // No class running, so nothing to mark - but the tap isn't wasted,
      // just look the card up and print who it belongs to instead.
      network->sendCardLookup(uidString);
      break;

    case ScanResult::NOT_ENROLLED:
      Serial.println("Card recognised but not enrolled in the active class - not caching, ready for next tap");
      beepNotEnrolled();
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

  initBuzzer();
  initLed();
  beepPoweredOn();

  Serial.println();
  Serial.println("========================================");
  Serial.println("ESP32-S3 + RC522 - Tago Attendance");
  Serial.println("========================================");
  Serial.println();

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
      bool wasActive = network->isSessionActiveFromHeartbeat();
      network->sendHeartbeat();
      bool nowActive = network->isSessionActiveFromHeartbeat();

      if (!wasActive && nowActive) {
        beepSessionStarted();
        sessionKnownActive = true;
      } else if (wasActive && !nowActive) {
        sessionKnownActive = false;
      }
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

  if (uidString == lastUID && (now - lastTapTime) < currentDebounceMs) {
    tapCountInBurst++;
    Serial.printf("Debounce: same card tapped again (%d in this burst), wait extended\n", tapCountInBurst);

    beepDuplicateTap();

    currentDebounceMs = min(currentDebounceMs * 2, MAX_DEBOUNCE_MS);
    lastTapTime = now;

    if (tapCountInBurst >= ALERT_TAP_THRESHOLD && !alertSentForBurst && network->isWiFiConnected()) {
      network->sendSuspiciousActivityAlert(uidString, tapCountInBurst);
      alertSentForBurst = true;
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(500);
    return;
  }

  lastUID = uidString;
  lastTapTime = now;
  tapCountInBurst = 1;
  currentDebounceMs = DEBOUNCE_MS;
  alertSentForBurst = false;

  processScan(uidString, "");

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(500);
}