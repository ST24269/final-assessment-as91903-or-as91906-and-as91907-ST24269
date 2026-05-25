# RFID Classroom Attendance System

**Ormiston Senior College — 2026**  
**AS91907 · AS91906 · AS91903**

This project replaces manual roll calls with an RFID card-tap system. Students tap their existing school ID card at a reader mounted on the classroom door. The system links the scan to a teacher-verified session, updates a live dashboard in real time, and syncs the finalised record to KAMAR — no paper, no manual entry.

The project is split across three assessed components that each cover a distinct part of the build.

---

## Assessment breakdown

| Standard | Title | This project's coverage |
|---|---|---|
| AS91907 | Use advanced techniques to develop a database | PostgreSQL schema, REST API, RBAC, audit logging, KAMAR sync |
| AS91906 | Use complex processes to develop a digital technologies outcome | React teacher dashboard, student portal, real-time WebSocket updates, proxy-flag detection |
| AS91903 | Develop a physical computing outcome | ESP32 firmware, RC522/PN532 RFID reader, SSD1306 OLED display, LED/buzzer circuit |

---

## The problem

Manual attendance recording at OSC takes roughly three minutes per teacher per day and carries an error rate of 1–3%. Over 60% of survey respondents reported experiencing an attendance error at least once a month. From Term 1 2026, schools must also log Attendance Management Plan responses for every student who hits an absence threshold — the compliance burden has gone up while the tools haven't changed. The Ministry of Education has acknowledged a 10% gap between school-reported attendance and its own calculated figures.

---

## How it works

1. A teacher taps their RFID card at the classroom reader to open a session. The system cross-references the teacher's UID against the timetable and room to confirm the class context.
2. Students tap in as they arrive. Each scan is logged against that verified session.
3. Taps that arrive before the teacher opens the session are held as *pending* and automatically upgraded to *present* once the teacher taps in.
4. The teacher dashboard updates in real time via WebSocket. Alerts fire for students absent more than 10 minutes.
5. When the teacher closes the session, the finalised records sync to KAMAR automatically.
6. Teachers retain a manual override at all times. The system supports their legal attendance obligation — it does not replace it.

---

## AS91903 — Physical computing (ESP32 firmware and electronics)

The reader unit is built on an ESP32 microcontroller with an RC522 RFID module, a small OLED display, and indicator LEDs. One unit mounts at each classroom door.

### Circuit wiring

| Connection | Pin |
|---|---|
| RC522 SDA | GPIO 5 |
| RC522 SCK | GPIO 18 |
| RC522 MOSI | GPIO 23 |
| RC522 MISO | GPIO 19 |
| RC522 VCC | 3.3V (not 5V) |
| SSD1306 OLED SDA | GPIO 21 |
| SSD1306 OLED SCL | GPIO 22 |
| Green LED | GPIO 2 → 220Ω → GND |
| Red LED | GPIO 4 → 220Ω → GND |

### Firmware behaviour

- On card tap: reads the UID, constructs a JSON payload `{uid, room_id, timestamp}`, sends an HTTPS POST to `/api/scan`
- HTTP 200 response: green LED flashes, OLED shows "Recorded"
- HTTP 401/403 response: red LED, OLED shows "Not registered" or "Card deactivated"
- Network failure: amber LED, scan saved to SD card locally and replayed to the API on reconnect
- On session open (teacher tap): OLED shows class name and period

### Components

| Component | Purpose |
|---|---|
| ESP32 WROOM-32 | WiFi-capable microcontroller, local processing |
| RC522 or PN532 | RFID reader module (confirm OSC card frequency first) |
| SSD1306 OLED (0.96") | Tap confirmation display |
| Green + red LEDs | Visual feedback |
| Passive buzzer | Optional audio feedback |
| Micro SD card module | Offline scan caching |

> **Important before ordering hardware:** OSC's student ID cards need to be checked against an NFC scanner (NFC Tools on Android) to confirm they are HF 13.56 MHz. If they are LF 125 kHz, the entire hardware choice changes.

### Libraries used (Arduino IDE)

- `MFRC522` — RFID card reading
- `Adafruit SSD1306` + `Adafruit GFX` — OLED display
- `WiFiClientSecure` — HTTPS communication
- `ArduinoJson` — JSON payload construction

---

## AS91907 — Database (PostgreSQL + REST API)

### Schema

```sql
students    (id UUID, uid VARCHAR UNIQUE, name VARCHAR, year_group INT,
             card_active BOOL DEFAULT true, created_at TIMESTAMPTZ)

teachers    (id UUID, uid VARCHAR UNIQUE, name VARCHAR,
             card_active BOOL, mfa_secret VARCHAR, created_at TIMESTAMPTZ)

rooms       (id VARCHAR, name VARCHAR, building VARCHAR)

sessions    (id UUID, teacher_id FK, room_id FK, period INT,
             started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ, status ENUM(open,closed))

attendance  (id UUID, session_id FK, student_id FK, scanned_at TIMESTAMPTZ,
             status ENUM(present,absent,late,pending,override),
             override_note TEXT, override_by FK)

audit_log   (id UUID, actor_id UUID, actor_role VARCHAR, action VARCHAR,
             target_table VARCHAR, target_id UUID, performed_at TIMESTAMPTZ, ip VARCHAR)
```

`audit_log` is INSERT-only at the database permission level — no row is ever updated or deleted.

### API endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/scan` | Receives `{uid, room_id, timestamp}` from ESP32 |
| POST | `/api/session/open` | Opens a session when teacher taps |
| POST | `/api/session/close` | Closes session and triggers KAMAR sync |
| GET | `/api/session/:id` | Returns session metadata and full attendance list |
| PATCH | `/api/attendance/:id` | Teacher override — updates status and note |
| GET | `/api/student/:id/history` | Returns a student's own attendance history |

### Authentication and access control

- Passwords hashed with bcrypt — never stored in plain text
- JWT tokens issued on login, expire after 8 hours (one school day)
- Refresh token endpoint provided so teachers are not logged out mid-lesson
- TOTP multi-factor authentication mandatory for admin role, recommended for all teachers
- Backup codes generated at MFA setup and stored hashed

Roles:

| Role | Access |
|---|---|
| `student` | Own records only |
| `teacher` | Own sessions and enrolled students |
| `admin` | All data |
| `readonly` | Read-only (future parent portal) |

### KAMAR integration

When a session is closed, `sync_to_kamar(session_id)` formats the finalised attendance records and posts them to KAMAR's API. A mapping table links the RFID system's internal student IDs to KAMAR's identifiers. If the API call fails, a sync-status panel in the admin dashboard shows the error and allows a manual retry. A CSV export fallback is also available.

---

## AS91906 — Software (React frontend)

### Teacher dashboard

- Live session panel: class name, room, period, time elapsed, present count vs expected
- Student list: name, status badge (Present / Absent / Late / Pending), time of last scan — updates in real time via WebSocket
- Alert panel: students absent for more than 10 minutes flagged with a warning banner
- Override modal: click any student → change status → add a note → saved via `PATCH /api/attendance/:id`
- Session controls: open and close session buttons

### Student portal

- Today view: each period shown as a row with class, teacher, room, and live status
- Pending status visible — if a card was tapped before the teacher opened the session, the student can see it is pending rather than absent
- History view: calendar showing attendance percentage per day for the current term
- Warning shown if term attendance drops below 80%
- Dispute button: flags a contested record for teacher review

### Proxy-tagging detection

A nightly cron job checks the past 7 days of attendance for:

- **Double scan** — two different UIDs at the same reader within 4 seconds
- **Perfect record** — 100% attendance with zero late arrivals over 3+ weeks (flagged for spot-check)
- **Ghost scan** — student UID scanned in a room with no open teacher session
- **Impossible travel** — student scanned in two rooms that are more than 2 minutes apart within 2 minutes

Flags are written to a `proxy_flags` table and shown on the admin dashboard. No automated consequences — a human reviews each one.

### Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React + Vite |
| Real-time updates | Socket.io (WebSocket) |
| HTTP client | Axios |
| Charts | Recharts |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Hosting (server) | Railway |
| Hosting (frontend) | Vercel |

---

## Privacy and legal compliance

| Requirement | How the system addresses it |
|---|---|
| Privacy Act 2020 — IPP 3 (data minimisation) | Only UID + timestamp stored. No location data beyond classroom entry. |
| Privacy Amendment Act 2025 — IPP 3A (indirect collection) | Parent and student notices drafted. Distribution required 2 weeks before pilot. |
| Education and Training Act 2020 | Accessibility accommodations documented. Reader height 90–95 cm. Extended-range NFC evaluated for students with limited mobility. |
| Data retention | Records kept for 7 years from end of academic year, then permanently deleted by automated cron job. |
| Security | HTTPS-only, bcrypt passwords, TOTP MFA, RBAC, INSERT-only audit log, encrypted data in transit. |

---

## Repository structure

```
/
├── firmware/
│   ├── rfid_reader.ino        # Core ESP32 firmware
│   └── wifi_config.h          # WiFi credentials — not committed to repo
├── backend/
│   ├── routes/
│   │   ├── scan.js
│   │   ├── session.js
│   │   └── attendance.js
│   ├── middleware/
│   │   └── auth.js            # JWT + RBAC
│   └── db/
│       └── schema.sql
├── frontend/
│   └── src/
│       ├── TeacherDashboard.jsx
│       └── StudentPortal.jsx
├── project-board/             # Kanban board source
│   └── src/App.jsx
└── docs/
    └── RFID_Inquiry_FinalV3.docx   # AS91900 critical inquiry document
```

---

## Project board

Live task board tracking all hardware, software, and electronics tasks:  
**https://rfid-project-board.vercel.app/**

---

## Status

Hardware prototyping and firmware development in progress. Pilot classroom not yet selected. Legal review and IPP 3A parent notices pending before any live deployment.