/*
 * Tago RFID Reader - Network Module
 * ==================================
 * Handles HTTP requests with exponential backoff.
 * NOTE: WiFi connection itself is handled by WiFiManager (see wifi_manager.h),
 * which runs before this class is constructed. This class assumes WiFi is
 * already connected and just monitors/uses it.
 */

#ifndef NETWORK_H
#define NETWORK_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"
#include "storage.h"

class NetworkManager {
private:
  bool isConnected;
  unsigned long lastHeartbeat;
  unsigned long lastReconnectAttempt;
  uint8_t currentBackoff;
  bool heartbeatPending;

  // Configuration
  const char* serverUrl;
  const char* readerApiKey;
  const char* readerId;
  const char* firmwareVersion;

public:
  NetworkManager(
    const char* srvUrl,
    const char* apiKey,
    const char* rdrId,
    const char* fwVersion
  ) : serverUrl(srvUrl),
      readerApiKey(apiKey), readerId(rdrId), firmwareVersion(fwVersion),
      isConnected(false), lastHeartbeat(0), lastReconnectAttempt(0),
      currentBackoff(0), heartbeatPending(false) {}

  void begin() {
    // WiFi is already connected by WiFiManager (setupWiFi() in main.cpp)
    // before this object is created, so just confirm status here.
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
    // WiFi.setAutoReconnect(true) is set by WiFiManager, so the radio
    // handles reconnects itself; this just tracks status for callers.
    isConnected = (WiFi.status() == WL_CONNECTED);
  }

  bool isWiFiConnected() {
    return WiFi.status() == WL_CONNECTED;
  }

  // Send heartbeat to server
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

      // Check if there are pending scans to upload
      StaticJsonDocument<512> respDoc;
      deserializeJson(respDoc, response);

      if (respDoc["pending_scans_count"].is<int>()) {
        int pendingCount = respDoc["pending_scans_count"].as<int>();
        if (pendingCount > 0) {
          Serial.printf("Server indicates %d pending scans to upload\n", pendingCount);
        }
      }

      return true;
    }

    Serial.printf("Heartbeat failed: HTTP %d\n", httpCode);
    return false;
  }

  // Check if heartbeat is needed
  bool needsHeartbeat(unsigned long intervalMs) {
    return (millis() - lastHeartbeat) > intervalMs;
  }

  // Send a single scan to server with exponential backoff
  bool sendScan(const String& uid, const String& timestamp, bool isRetry = false) {
    if (!isWiFiConnected()) {
      Serial.println("WiFi not connected, cannot send scan");
      return false;
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

Serial.println("================================");
Serial.println("URL:");
Serial.println(url);

Serial.println("BODY:");
Serial.println(body);
Serial.println("================================");

unsigned long startTime = millis();
int httpCode = http.POST(body);
String response = http.getString();
unsigned long duration = millis() - startTime;

    Serial.printf("HTTP %d, Response time: %lu ms\n", httpCode, duration);

    if (httpCode == 201 || httpCode == 200) {
      StaticJsonDocument<512> respDoc;
      deserializeJson(respDoc, response);

      if (respDoc["success"] == true) {
        Serial.println(">>> ATTENDANCE MARKED <<<");
        Serial.printf("Student: %s, Status: %s\n",
          respDoc["student"].as<String>().c_str(),
          respDoc["status"].as<String>().c_str());
        currentBackoff = 0;  // Reset backoff on success
        http.end();
        return true;
      } else {
        Serial.printf("Server rejected: %s\n", respDoc["error"].as<String>().c_str());
      }
    } else if (httpCode == 409) {
      // Duplicate - not an error
      Serial.println("Scan already recorded");
      currentBackoff = 0;
      http.end();
      return true;
    } else {
Serial.printf("Scan failed: HTTP %d\n", httpCode);
Serial.println("Server response:");
Serial.println(response);    }

    http.end();

    // Implement exponential backoff
    if (currentBackoff == 0) {
      currentBackoff = 1000;
    } else {
      currentBackoff = min(currentBackoff * 2, 60000);
    }

    return false;
  }

  // Upload cached scans in bulk
  bool uploadCachedScans(OfflineStorage& storage) {
    if (!isWiFiConnected()) {
      return false;
    }

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
    http.setTimeout(30000);

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

      // Remove successfully uploaded scans
      if (respDoc["results"].is<JsonArray>()) {
        JsonArray results = respDoc["results"].as<JsonArray>();
        int i = 0;
        for (JsonObject scan : scans) {
          if (i < results.size()) {
            String status = results[i]["status"].as<String>();
            if (status == "success" || status == "skipped") {
              storage.markUploaded(
                scan["rfid_card_uid"].as<String>(),
                scan["scanned_at"].as<String>()
              );
            } else {
              storage.incrementAttempts(
                scan["rfid_card_uid"].as<String>(),
                scan["scanned_at"].as<String>()
              );
            }
          }
          i++;
        }
      }

      // Clean up scans that failed too many times
      storage.cleanupFailedScans(5);

      return true;
    }

    Serial.printf("Bulk upload failed: HTTP %d\n", httpCode);
    Serial.printf("Server response: %s\n", response.c_str());
    return false;
  }

  // Get current backoff delay
  unsigned long getBackoffDelay() {
    return currentBackoff;
  }

  // Check if there's a pending heartbeat
  bool hasPendingHeartbeat() {
    return heartbeatPending;
  }

  // Get WiFi signal strength
  int getSignalStrength() {
    return WiFi.RSSI();
  }
};

#endif // NETWORK_H