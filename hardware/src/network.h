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
  SUCCESS,
  DUPLICATE,
  NO_SESSION,
  UNKNOWN_CARD,
  NOT_ENROLLED,
  NETWORK_ERROR
};

class NetworkManager {
private:
  bool isConnected;
  unsigned long lastHeartbeat;
  uint8_t currentBackoff;
  bool heartbeatPending;

  unsigned long lastUploadAttempt;
  unsigned long uploadRetryIntervalMs;

  bool lastKnownSessionActive;
  bool lastKnownEmergencyActive;

  const char* serverUrl;
  const char* readerApiKey;
  const char* readerId;
  const char* firmwareVersion;

  bool errorMentionsSession(const String& errMsg) {
    String lower = errMsg;
    lower.toLowerCase();
    return lower.indexOf("session") != -1;
  }

  bool errorMentionsEnrolment(const String& errMsg) {
    String lower = errMsg;
    lower.toLowerCase();
    return lower.indexOf("not enrolled") != -1;
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
      lastUploadAttempt(0), uploadRetryIntervalMs(8000),
      lastKnownSessionActive(false), lastKnownEmergencyActive(false) {}

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

  // Sends a heartbeat and, if the server includes a session_active field
  // in the response, updates our local view of whether a session is live
  // for this reader's room - lets main.cpp detect a session starting
  // without needing a card tap first.
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

      StaticJsonDocument<512> respDoc;
      deserializeJson(respDoc, response);

      if (respDoc["session_active"].is<bool>()) {
        lastKnownSessionActive = respDoc["session_active"].as<bool>();
      }

      if (respDoc["emergency_active"].is<bool>()) {
        lastKnownEmergencyActive = respDoc["emergency_active"].as<bool>();
      }

      return true;
    }

    Serial.printf("Heartbeat failed: HTTP %d\n", httpCode);
    return false;
  }

  bool isSessionActiveFromHeartbeat() {
    return lastKnownSessionActive;
  }

  bool isEmergencyActiveFromHeartbeat() {
    return lastKnownEmergencyActive;
  }

  bool needsHeartbeat(unsigned long intervalMs) {
    return (millis() - lastHeartbeat) > intervalMs;
  }

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

    // 409 covers several distinct rejections from the backend: an actual
    // duplicate tap, "already marked present", "not enrolled in this
    // class", and "reader not assigned to a room". These are NOT the same
    // situation and must not all be reported to the person tapping as a
    // plain success beep - only genuine duplicates should sound like that.
    if (httpCode == 409) {
      StaticJsonDocument<512> respDoc;
      deserializeJson(respDoc, response);
      String errMsg = respDoc["error"].as<String>();
      Serial.printf("Server rejected (409): %s\n", errMsg.c_str());

      if (errorMentionsEnrolment(errMsg)) {
        return ScanResult::NOT_ENROLLED;
      }

      if (errorMentionsSession(errMsg)) {
        return ScanResult::NO_SESSION;
      }

      Serial.println("Scan already recorded");
      currentBackoff = 0;
      return ScanResult::DUPLICATE;
    }

    if (httpCode == 400 || httpCode == 403 || httpCode == 404 || httpCode == 422) {
      StaticJsonDocument<512> respDoc;
      deserializeJson(respDoc, response);
      String errMsg = respDoc["error"].as<String>();
      return errorMentionsSession(errMsg) ? ScanResult::NO_SESSION : ScanResult::UNKNOWN_CARD;
    }

    if (currentBackoff == 0) {
      currentBackoff = 1;
    } else {
      currentBackoff = min((int)currentBackoff * 2, 60);
    }
    return ScanResult::NETWORK_ERROR;
  }

  // Alerts the server that the same card was tapped repeatedly in a
  // short burst. NOTE: "/api/attendance/flag" is a placeholder route -
  // confirm this matches your actual backend endpoint.
  bool sendSuspiciousActivityAlert(const String& uid, int tapCount) {
    if (!isWiFiConnected()) return false;

    HTTPClient http;
    String url = String(serverUrl) + "/api/attendance/flag";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["reader_api_key"] = readerApiKey;
    doc["rfid_card_uid"] = uid;
    doc["reason"] = "repeated_rapid_taps";
    doc["tap_count"] = tapCount;

    String body;
    serializeJson(doc, body);
    int httpCode = http.POST(body);
    http.end();

    Serial.printf("Suspicious activity alert sent: HTTP %d\n", httpCode);
    return httpCode == 200 || httpCode == 201;
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

  // Called when a tap comes back NO_SESSION - since there's no class
  // running, we can't mark attendance, but we can still say who tapped.
  // Prints straight to Serial since this board has no screen. Returns
  // false on any failure - main.cpp just falls back to the normal
  // "no session" beep in that case.
  bool sendCardLookup(const String& uid) {
    if (!isWiFiConnected()) return false;

    HTTPClient http;
    String url = String(serverUrl) + "/api/attendance/lookup";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(8000);

    StaticJsonDocument<256> doc;
    doc["rfid_card_uid"] = uid;
    doc["reader_api_key"] = readerApiKey;

    String body;
    serializeJson(doc, body);

    int httpCode = http.POST(body);
    String response = http.getString();
    http.end();

    if (httpCode != 200) {
      Serial.printf("Lookup failed: HTTP %d - %s\n", httpCode, response.c_str());
      return false;
    }

    // 1024 should be plenty for a student + their class list, bump this
    // up if a student ever ends up enrolled in a ton of classes.
    StaticJsonDocument<1024> respDoc;
    if (deserializeJson(respDoc, response)) {
      Serial.println("Lookup response didn't parse as JSON");
      return false;
    }

    Serial.println("---- CARD LOOKUP ----");
    Serial.printf("Name:       %s\n", respDoc["full_name"] | "Unknown");
    Serial.printf("Student ID: %s\n", respDoc["student_number"] | "-");

    if (respDoc["year_level"].is<int>()) {
      Serial.printf("Year:       %d\n", respDoc["year_level"].as<int>());
    } else {
      Serial.println("Year:       -");
    }

    Serial.printf("Kainga:     %s\n", respDoc["kainga"] | "-");
    Serial.printf("LA teacher: %s\n", respDoc["la_teacher_name"] | "-");

    if (respDoc["classes"].is<JsonArray>()) {
      JsonArray classes = respDoc["classes"].as<JsonArray>();
      Serial.printf("Classes (%d):\n", classes.size());
      for (JsonObject classItem : classes) {
        const char* room = classItem["room"] | "";
        if (strlen(room) > 0) {
          Serial.printf("  - %s (%s), Room %s\n", classItem["name"] | "Class", classItem["subject"] | "Subject", room);
        } else {
          Serial.printf("  - %s (%s)\n", classItem["name"] | "Class", classItem["subject"] | "Subject");
        }
      }
    }
    Serial.println("----------------------");

    return true;
  }

  unsigned long getBackoffDelay() { return currentBackoff; }
  bool hasPendingHeartbeat() { return heartbeatPending; }
  int getSignalStrength() { return WiFi.RSSI(); }
};

#endif // NETWORK_H