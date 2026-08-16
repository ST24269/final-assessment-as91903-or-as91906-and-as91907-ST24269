# Tago

Tago is an RFID-based classroom attendance system. A student taps their card at a reader mounted
on the classroom door, the tap is checked against a live class session, and the result appears on
a teacher's dashboard in real time. It replaces manual roll calls with a system that logs
attendance automatically, keeps a full audit trail, and gives students and staff a formal channel
to correct an error rather than relying on a teacher's memory or a paper sheet.

## Why this exists

A stakeholder survey run early in this project, 22 responses across students, teachers, and
parents, found that proxy tagging (one student tapping in for another) and teacher legal
accountability for attendance records were the two problems that mattered most to the people who'd
actually use a system like this. Over 60% of respondents reported experiencing an attendance error
at least once. That survey shaped the core design decision in this project: a scan is only ever
valid against a verified, currently-open class session, not just a card and a reader.

## How it works

A teacher starts a session from the dashboard. The session is resolved against the room and the
timetable, so it only opens for a class that's actually scheduled to run there and then. Students
tap their card at the reader for that room, the reader authenticates itself with its own API key,
and the scan is checked against the open session. Present and late are calculated automatically
against a configurable buffer. Attendance updates on the teacher's dashboard live, without a
refresh. If a reader loses Wi-Fi, scans are cached on-device and synced automatically once
connectivity returns.

Sessions are bound to the room rather than to a physical teacher tap. This was a deliberate change
from an earlier design that required the timetabled teacher to physically tap their own card to
open a session. The room-centric model handles cover teachers, room swaps, and timetable changes
without needing to touch any physical hardware.

## Architecture

| Layer | Technology |
|---|---|
| Reader firmware | ESP32-S3 + RC522, C++ (PlatformIO), ArduinoJson, WiFiManager |
| Backend | Node.js + Express |
| Database | PostgreSQL via Supabase, with Row Level Security enabled on every table |
| Auth | Supabase Auth (bearer JWT for people, API key for hardware) |
| Frontend | React + Vite, Supabase Realtime for live updates |
| Testing | Playwright (automated visual regression) |
| Hosting | Vercel (frontend), Railway-style container hosting (backend) |

Reader feedback is buzzer and LED only. An on-device display was attempted and cut during
development after it couldn't be made to work reliably; feedback about a scan's outcome is
communicated through sound and light, not a screen.

## Repository structure

```
.
├── .github/
├── dashboard/            React/Vite frontend — teacher, student, and admin dashboards,
│                         plus a separate public marketing site
├── hardware/              ESP32-S3 firmware (PlatformIO)
├── server/
│   └── src/               Express backend — routes, middleware, database migrations
└── README.md
```

Project management for this build is tracked on a separate, purpose-built Kanban board rather than
a generic tool, live at **https://rfid-project-board.vercel.app/**, filterable by task category and
searchable by title.

## Security

- Every database table has Row Level Security enabled, in addition to role-based access control
  enforced at the API layer, so there are two independent checks on every request rather than one.
- CORS is enforced as an explicit origin allowlist, not a wildcard.
- All 5xx error responses are scrubbed of internal detail before reaching the client; every
  request is tagged with an ID for server-side debugging.
- Rate limiting is applied per-route, tuned separately for the password-reset endpoint, the scan
  endpoint, and general API traffic.
- The system underwent an independent security audit covering authentication, authorisation, API
  key handling, and RLS policy coverage. Findings and their resolutions are documented in the
  project's evidence reports rather than summarised here.

## Privacy

The reader stores only a card UID, never a name, year level, or photo. Identity is resolved
server-side only after the reader has authenticated. The system includes a privacy policy page
structured around the New Zealand Privacy Act 2020's information privacy principles, since it
processes attendance data belonging to minors.

## Standards

This project is assessment evidence for:

- **AS91902** — database design, structure, and integrity
- **AS91906** — complex programming techniques (ESP32 firmware)
- **AS91907** — complex processes used to plan, test, and refine a digital technologies outcome

## Status

The core system is built and functioning: reader firmware, backend, database, and dashboard are
all in place and connected end to end. Testing has covered functional behaviour, boundary
conditions, hardware and network failure modes, and an independent security audit, along with a
classroom trial with a real teacher and students. Known remaining limitations are documented in
the project's evidence reports rather than hidden.
