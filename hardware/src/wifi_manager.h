/*
 * WiFi Manager - Captive Portal Provisioning
 * =============================================
 * On first boot (or if saved credentials fail), spins up an AP called
 * "Attendify_Setup". A teacher connects to it, opens 192.168.4.1,
 * selects the school WiFi from a scanned list, and enters the password.
 * Credentials are then saved to flash (NVS) and the device reboots
 * and connects automatically on every subsequent boot.
 */

#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include <WiFiManager.h>

#define RESET_WIFI_PIN 0   // BOOT button on most ESP32-S3 DevKitC-1 boards

inline void setupWiFi() {
  pinMode(RESET_WIFI_PIN, INPUT_PULLUP);

  WiFiManager wm;
  wm.setConfigPortalTimeout(180); // portal gives up after 3 min if nobody configures it

  // Hold BOOT button during power-on to wipe saved credentials and re-provision
  if (digitalRead(RESET_WIFI_PIN) == LOW) {
    Serial.println("BOOT held on startup -> clearing saved WiFi credentials");
    wm.resetSettings();
  }

  wm.setAPCallback([](WiFiManager* myWM) {
    Serial.println("========================================");
    Serial.println("No saved WiFi. Config portal started.");
    Serial.println("Connect to WiFi network: Attendify_Setup");
    Serial.println("Then browse to: 192.168.4.1");
    Serial.println("========================================");
  });

  bool connected = wm.autoConnect("Tago_Setup");

  if (!connected) {
    Serial.println("Failed to connect within timeout, restarting...");
    delay(1000);
    ESP.restart();
  }

  Serial.print("WiFi connected. IP address: ");
  Serial.println(WiFi.localIP());
}

#endif