/*
 * Tago RFID Reader - Network Module
 * ==================================
 */

#ifndef NETWORK_H
#define NETWORK_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"
#include "storage.h"

enum class ScanResult {
  SUCCESS,        // attendance marked
  DUPLICATE,      // already recorded (HTTP 409) - treated as success
  NO_SESSION,     // no active session for this room - retrying won't help
  UNKNOWN_CARD,   // card not recognised / rejected by server - retrying won't help
  NETWORK_ERROR   // couldn't reach server / timeout - worth caching + retrying
};

class NetworkManager {
private:
  bool isConnected;
  unsigned long lastHeartbeat;
  uint8_t currentBackoff;
  bool heartbeatPending;

  unsigned long lastUploadAttempt;
  unsigned long uploadRetryIntervalMs;

  const char* serverUrl;
  const char* readerApiKey;
  const char* readerId;
  const char* firmwareVersion;

  // Decide whether a server error message is about the session being
  // inactive vs. the card itself being unrecognised.
  bool errorMentionsSession(const String& errMsg) {
    String lower = errMsg;
    lower.toLowerCase();
    return lower.indexOf("session") != -1;
  }

public:
  NetworkManager(
    const char* srvUrl,
    const char* apiKey,
    const char* rdrId,
    const char* fwVersion
  ) : serverUrl(srvUrl),
      readerApiKey(apiKey), readerId(rdrId), firmwareVersion(fwVersion),
      isConnected(false), lastHeartbeat(0),
      currentBackoff(0), heartbeatPending(false),
      lastUploadAttempt(0), uploadRetryIntervalMs(8000) {}

  void begin() {
    isConnected = (WiFi.status() == WL_CONNECTED);
    if (isConnected) {
      Serial.printf("NetworkManager ready. IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
      Serial.println("NetworkManager started but WiFi is not connected!");
    }
  }

  void disconnect() {
    WiFi.disconnect();
    isConnected = false;
  }

  void update() {
    isConnected = (WiFi.status() == WL_CONNECTED);
  }

  bool isWiFiConnected() {
    return WiFi.status() == WL_CONNECTED;
  }

  bool sendHeartbeat() {
    if (!isWiFiConnected()) {
      heartbeatPending = true;
      return false;
    }

    HTTPClient http;
    String url = String(serverUrl) + "/api/readers/" + readerId + "/heartbeat";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["api_key"] = readerApiKey;
    doc["firmware_version"] = firmwareVersion;
    doc["mac_address"] = WiFi.macAddress();
    doc["ip_address"] = WiFi.localIP().toString();

    String body;
    serializeJson(doc, body);

    int httpCode = http.POST(body);
    String response = http.getString();
    http.end();

    if (httpCode == 200) {
      Serial.println("Heartbeat sent successfully");
      lastHeartbeat = millis();
      heartbeatPending = false;
      return true;
    }

    Serial.printf("Heartbeat failed: HTTP %d\n", httpCode);
    return false;
  }

  bool needsHeartbeat(unsigned long intervalMs) {
    return (millis() - lastHeartbeat) > intervalMs;
  }

  // Sends a single scan and classifies exactly why it failed, so
  // main.cpp can play the correct, unambiguous buzzer tone and decide
  // whether caching it is even worthwhile.
  ScanResult sendScan(const String& uid, const String& timestamp) {
    if (!isWiFiConnected()) {
      Serial.println("WiFi not connected, cannot send scan");
      return ScanResult::NETWORK_ERROR;
    }

    HTTPClient http;
    String url = String(serverUrl) + "/api/attendance/scan";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(10000);

    StaticJsonDocument<256> doc;
    doc["rfid_card_uid"] = uid;
    doc["reader_api_key"] = readerApiKey;
    if (timestamp.length() > 0) {
      doc["timestamp"] = timestamp;
    }

    String body;
    serializeJson(doc, body);

    Serial.printf("Sending scan: %s at %s\n", uid.c_str(), timestamp.c_str());

    int httpCode = http.POST(body);
    String response = http.getString();
    http.end();

    Serial.printf("HTTP %d - %s\n", httpCode, response.c_str());

    if (httpCode == 200 || httpCode == 201) {
      StaticJsonDocument<512> respDoc;
      deserializeJson(respDoc, response);

      if (respDoc["success"] == true) {
        Serial.println(">>> ATTENDANCE MARKED <<<");
        currentBackoff = 0;
        return ScanResult::SUCCESS;
      }

      String errMsg = respDoc["error"].as<String>();
      Serial.printf("Server rejected: %s\n", errMsg.c_str());
      return errorMentionsSession(errMsg) ? ScanResult::NO_SESSION : ScanResult::UNKNOWN_CARD;
    }

    if (httpCode == 409) {
      Serial.println("Scan already recorded");
      currentBackoff = 0;
      return ScanResult::DUPLICATE;
    }

    if (httpCode == 400 || httpCode == 403 || httpCode == 404 || httpCode == 422) {
      // Any of these client-error codes mean the server actively looked
      // at the request and said no - figure out whether it's a session
      // problem or a card problem from the message text.
      StaticJsonDocument<512> respDoc;
      deserializeJson(respDoc, response);
      String errMsg = respDoc["error"].as<String>();
      return errorMentionsSession(errMsg) ? ScanResult::NO_SESSION : ScanResult::UNKNOWN_CARD;
    }

    // Anything else (5xx, 0, timeout) is a genuine network/server fault,
    // worth retrying.
    if (currentBackoff == 0) {
      currentBackoff = 1;
    } else {
      currentBackoff = min((int)currentBackoff * 2, 60);
    }
    return ScanResult::NETWORK_ERROR;
  }

  bool canRetryUploadNow() {
    return (millis() - lastUploadAttempt) >= uploadRetryIntervalMs;
  }

  bool uploadCachedScans(OfflineStorage& storage) {
    if (!isWiFiConnected()) {
      return false;
    }

    lastUploadAttempt = millis();

    DynamicJsonDocument scansDoc = storage.getPendingScans();
    JsonArray scans = scansDoc.as<JsonArray>();

    if (scans.size() == 0) {
      return true;
    }

    Serial.printf("Uploading %d cached scans...\n", scans.size());

    HTTPClient http;
    String url = String(serverUrl) + "/api/attendance/bulk-upload";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(15000);

    StaticJsonDocument<4096> doc;
    doc["reader_id"] = readerId;
    doc["api_key"] = readerApiKey;
    JsonArray scansArray = doc.createNestedArray("scans");

    for (JsonObject scan : scans) {
      JsonObject s = scansArray.add<JsonObject>();
      s["rfid_card_uid"] = scan["rfid_card_uid"].as<String>();
      s["scanned_at"] = scan["scanned_at"].as<String>();
    }

    String body;
    serializeJson(doc, body);

    int httpCode = http.POST(body);
    String response = http.getString();
    http.end();

    if (httpCode == 200 || httpCode == 201) {
      StaticJsonDocument<512> respDoc;
      deserializeJson(respDoc, response);

      int successCount = respDoc["success_count"].as<int>();
      Serial.printf("Bulk upload: %d/%d successful\n", successCount, scans.size());

      if (respDoc["results"].is<JsonArray>()) {
        JsonArray results = respDoc["results"].as<JsonArray>();
        int i = 0;
        for (JsonObject scan : scans) {
          if (i < results.size()) {
            String status = results[i]["status"].as<String>();
            if (status == "success" || status == "skipped") {
              storage.markUploaded(scan["rfid_card_uid"].as<String>(), scan["scanned_at"].as<String>());
            } else {
              storage.incrementAttempts(scan["rfid_card_uid"].as<String>(), scan["scanned_at"].as<String>());
            }
          }
          i++;
        }
      }

      storage.cleanupFailedScans(5);
      return true;
    }

    Serial.printf("Bulk upload failed: HTTP %d - %s\n", httpCode, response.c_str());
    return false;
  }

  unsigned long getBackoffDelay() { return currentBackoff; }
  bool hasPendingHeartbeat() { return heartbeatPending; }
  int getSignalStrength() { return WiFi.RSSI(); }
};

#endif // NETWORK_H