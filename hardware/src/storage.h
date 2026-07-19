/*
 * Tago RFID Reader - Offline Storage
 * ===================================
 * Stores scans locally when WiFi/server is unavailable.
 * Uses Preferences (NVS) for simple key-value storage.
 *
 * Responsibilities:
 *   - Manage NVS/Preferences for persistent storage
 *   - Queue scans when offline
 *   - Track pending uploads
 *   - Cleanup failed uploads
 */

#ifndef STORAGE_H
#define STORAGE_H

#include <Arduino.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "config.h"

// MAX_CACHED_SCANS is now defined in config.h

struct CachedScan {
  String rfid_card_uid;
  String scanned_at;  // ISO 8601 timestamp
  uint8_t attempts;
};

class OfflineStorage {
private:
  Preferences prefs;
  static const char* NAMESPACE;
  static const char* SCANS_KEY;

public:
  OfflineStorage() {}

  bool begin() {
    return prefs.begin(NAMESPACE, false);
  }

  // Save a scan to local storage
  bool saveScan(const String& uid, const String& timestamp) {
    // Get existing scans
    DynamicJsonDocument doc(4096);
    String existing = prefs.getString(SCANS_KEY, "[]");
    DeserializationError error = deserializeJson(doc, existing);
    if (error) {
      // Start fresh if corrupted
      doc.clear();
    }

    JsonArray scans = doc.as<JsonArray>();

    // Check for duplicate (same UID and timestamp)
    for (JsonObject scan : scans) {
      if (scan["rfid_card_uid"].as<String>() == uid && scan["scanned_at"].as<String>() == timestamp) {
        Serial.println("Duplicate scan already cached, skipping");
        return false;
      }
    }

    // Add new scan
    JsonObject newScan = scans.add<JsonObject>();
    newScan["rfid_card_uid"] = uid;
    newScan["scanned_at"] = timestamp;
    newScan["attempts"] = 0;

    // Trim if too many
    while (scans.size() > MAX_CACHED_SCANS) {
      scans.remove(0);
    }

    // Save back
    String output;
    serializeJson(doc, output);
    prefs.putString(SCANS_KEY, output);

    Serial.printf("Cached scan: %s at %s\n", uid.c_str(), timestamp.c_str());
    return true;
  }

  // Get all pending scans
  DynamicJsonDocument getPendingScans() {
    DynamicJsonDocument doc(4096);
    String existing = prefs.getString(SCANS_KEY, "[]");
    DeserializationError error = deserializeJson(doc, existing);
    if (error) {
      doc.clear();
      doc.to<JsonArray>();
    }
    return doc;
  }

  // Mark scans as uploaded (remove them)
  void markUploaded(const String& uid, const String& timestamp) {
    DynamicJsonDocument doc(4096);
    String existing = prefs.getString(SCANS_KEY, "[]");
    DeserializationError error = deserializeJson(doc, existing);
    if (error) return;

    JsonArray scans = doc.as<JsonArray>();

    // Build the filtered result in its own document, so the array
    // actually has a memory pool backing it (a bare JsonArray with
    // no owning JsonDocument silently fails to add elements).
    DynamicJsonDocument newDoc(4096);
    JsonArray newScans = newDoc.to<JsonArray>();

    for (JsonObject scan : scans) {
      if (scan["rfid_card_uid"].as<String>() == uid && scan["scanned_at"].as<String>() == timestamp) {
        // Skip - this scan was uploaded
        continue;
      }
      JsonObject newScan = newScans.add<JsonObject>();
      newScan["rfid_card_uid"] = scan["rfid_card_uid"].as<String>();
      newScan["scanned_at"] = scan["scanned_at"].as<String>();
      newScan["attempts"] = scan["attempts"];
    }

    String output;
    serializeJson(newScans, output);
    prefs.putString(SCANS_KEY, output);
  }

  // Increment attempt count for a scan
  void incrementAttempts(const String& uid, const String& timestamp) {
    DynamicJsonDocument doc(4096);
    String existing = prefs.getString(SCANS_KEY, "[]");
    DeserializationError error = deserializeJson(doc, existing);
    if (error) return;

    JsonArray scans = doc.as<JsonArray>();

    for (JsonObject scan : scans) {
      if (scan["rfid_card_uid"].as<String>() == uid && scan["scanned_at"].as<String>() == timestamp) {
        scan["attempts"] = scan["attempts"].as<uint8_t>() + 1;
      }
    }

    String output;
    serializeJson(doc, output);
    prefs.putString(SCANS_KEY, output);
  }

  // Remove failed scans that exceeded max attempts
  void cleanupFailedScans(uint8_t maxAttempts) {
    DynamicJsonDocument doc(4096);
    String existing = prefs.getString(SCANS_KEY, "[]");
    DeserializationError error = deserializeJson(doc, existing);
    if (error) return;

    JsonArray scans = doc.as<JsonArray>();

    // Same fix as markUploaded(): give the filtered array a real
    // owning document instead of a bare, unbacked JsonArray.
    DynamicJsonDocument newDoc(4096);
    JsonArray newScans = newDoc.to<JsonArray>();

    for (JsonObject scan : scans) {
      if (scan["attempts"].as<uint8_t>() >= maxAttempts) {
        Serial.printf("Removing failed scan after %d attempts: %s\n",
          scan["attempts"].as<uint8_t>(), scan["rfid_card_uid"].as<String>().c_str());
        continue;
      }
      JsonObject newScan = newScans.add<JsonObject>();
      newScan["rfid_card_uid"] = scan["rfid_card_uid"].as<String>();
      newScan["scanned_at"] = scan["scanned_at"].as<String>();
      newScan["attempts"] = scan["attempts"];
    }

    String output;
    serializeJson(newScans, output);
    prefs.putString(SCANS_KEY, output);
  }

  // Get count of pending scans
  int getPendingCount() {
    DynamicJsonDocument doc(4096);
    String existing = prefs.getString(SCANS_KEY, "[]");
    DeserializationError error = deserializeJson(doc, existing);
    if (error) return 0;
    return doc.as<JsonArray>().size();
  }

  // Clear all cached scans
  void clearAll() {
    prefs.putString(SCANS_KEY, "[]");
  }
};

const char* OfflineStorage::NAMESPACE = "tago_reader";
const char* OfflineStorage::SCANS_KEY = "cached_scans";

#endif // STORAGE_H