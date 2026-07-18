/*
 * Tago RFID Reader - Network Module
 * ==================================
 * Handles WiFi connection with auto-reconnect and HTTP requests with exponential backoff.
 */

#ifndef NETWORK_H
#define NETWORK_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"

class NetworkManager {
private:
  bool isConnected;
  unsigned long lastHeartbeat;
  unsigned long lastReconnectAttempt;
  uint8_t currentBackoff;
  bool heartbeatPending;

  // Configuration
  const char* ssid;
  const char* password;
  const char* serverUrl;
  const char* readerApiKey;
  const char* readerId;
  const char* firmwareVersion;

public:
  NetworkManager(
    const char* wifiSsid,
    const char* wifiPassword,
    const char* srvUrl,
    const char* apiKey,
    const char* rdrId,
    const char* fwVersion
  ) : ssid(wifiSsid), password(wifiPassword), serverUrl(srvUrl),
      readerApiKey(apiKey), readerId(rdrId), firmwareVersion(fwVersion),
      isConnected(false), lastHeartbeat(0), lastReconnectAttempt(0),
      currentBackoff(0), heartbeatPending(false) {}

  void begin() {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);
    connect();
  }

  void connect() {
    if (WiFi.status() == WL_CONNECTED) {
      isConnected = true;
      currentBackoff = 0;
      Serial.println("WiFi already connected");
      return;
    }

    Serial.printf("Connecting to WiFi: %s\n", ssid);
    WiFi.begin(ssid, password);

    // Wait for connection with timeout
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
      delay(500);
      Serial.print(".");
      attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      isConnected = true;
      currentBackoff = 0;
      Serial.println();
      Serial.printf("WiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
      isConnected = false;
      Serial.println();
      Serial.println("WiFi connection failed!");
      lastReconnectAttempt = millis();
    }
  }

  void disconnect() {
    WiFi.disconnect();
    isConnected = false;
  }

  void update() {
    // Handle WiFi status
    if (WiFi.status() != WL_CONNECTED) {
      isConnected = false;

      // Attempt reconnection periodically
      if (millis() - lastReconnectAttempt > WIFI_RECONNECT_DELAY) {
        Serial.println("WiFi lost, attempting reconnect...");
        connect();
        lastReconnectAttempt = millis();
      }
    } else {
      isConnected = true;
    }
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

      if (respDoc.containsKey("pending_scans_count")) {
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
    doc["timestamp"] = timestamp;

    String body;
    serializeJson(doc, body);

    Serial.printf("Sending scan: %s at %s\n", uid.c_str(), timestamp.c_str());

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
    }

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
    doc["reader_api_key"] = readerApiKey;
    JsonArray scansArray = doc.createNestedArray("scans");

    for (JsonObject scan : scans) {
      JsonObject s = scansArray.add<JsonObject>();
 scan["rfid_card_uid"].as<String>()
scan["scanned_at"].as<String>()
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
      if (respDoc.containsKey("results")) {
        JsonArray results = respDoc["results"].as<JsonArray>();
        int i = 0;
        for (JsonObject scan : scans) {
          if (i < results.size()) {
            String status = results[i]["status"].as<String>();
            if (status == "success" || status == "skipped") {
              storage.markUploaded(
scan["rfid_card_uid"].as<String>()
scan["scanned_at"].as<String>()
              );
            } else {
              storage.incrementAttempts(
scan["rfid_card_uid"].as<String>()
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