# Tago

Tago is an RFID-based classroom attendance system I built to replace manual roll calls. A student
taps their existing school ID card against a reader mounted on the classroom door, the tap gets
checked against a live, teacher-verified class session, and the result shows up on a teacher's
dashboard immediately. There's no paper sheet, no reading names out loud, and no gap between when
something actually happened and when it's recorded.

I want to explain why this exists before I get into how it works, because the reasoning behind it
shaped almost every decision I made while building it.

## Why I built this

Manual attendance is one of those problems that's easy to overlook precisely because it isn't
dramatic. It's just a few minutes lost at the start of every class, every day, across every room in
the school, and because no single instance of it feels urgent, it's the kind of thing that nobody
gets around to actually fixing.

I didn't want to guess at what the real pain points were, so before I wrote a line of code, I ran a
survey. I got 22 responses across students, teachers, and parents, and two things came back louder
than everything else. The first was proxy tagging, one student tapping in for a friend who wasn't
actually there. The second was teacher accountability, the fact that whoever's name is attached to
a session is the person legally answering for that attendance record if it's ever questioned later.
Over 60% of the people I surveyed told me they'd personally experienced an attendance error at some
point, which is a genuinely high number for something as basic as knowing whether a student was in
the room.

Those two findings are the reason Tago isn't just "tap a card, get a checkmark." Every single scan
has to resolve against a session that's real, currently open, and tied to a teacher who actually
verified it. A tap with no open session behind it doesn't create an attendance record at all. That
one rule runs through the entire system, the database schema, the backend logic, and the firmware
on the reader itself.

## How it works

A teacher starts a session from the dashboard rather than from the physical reader. That session
gets checked against the room and the timetable, so it only actually opens for a class that's meant
to be running there at that time. Students then tap their card at the reader for that specific room.
The reader authenticates itself to the backend using its own key, separate from any human login, and
forwards the scan. Present and late get calculated automatically against a buffer a teacher can
configure themselves, rather than a single hardcoded number that doesn't account for the fact that
different subjects and rooms run differently in practice.

The dashboard updates live as scans come in, no refresh, no polling on a timer, just a new row
appearing the moment a tap happens. If a reader loses Wi-Fi partway through a class, it doesn't lose
the scans that happen during that outage. They get cached locally on the device and synced
automatically the moment the connection comes back, without anyone needing to notice anything went
wrong in the first place.

One thing worth explaining directly, because it wasn't my original plan, is that sessions are bound
to the room, not to a physical teacher tap. Early on, I planned for a teacher to open a session by
tapping their own card at the same reader students use. Once I actually started building that
version, the problems with it became obvious in a way they hadn't been on paper, a cover teacher
doesn't have a card tied to someone else's class, and reflashing a reader every time a room
assignment changes isn't something I wanted to be doing by hand across a whole school. Moving
session control onto the dashboard instead solved the same underlying problem the original design
was trying to solve, verified session context, just through a mechanism that actually holds up once
cover teachers and room changes are a normal part of how a school actually runs.

## What's actually built

The reader itself runs on an ESP32-S3 with an RC522 RFID module, written in C++. It's deliberately
kept as simple as I could make it, all of the real decision-making, session logic, status
calculation, validation, lives on the backend rather than on the device, because redeploying backend
code takes seconds and reflashing every physical reader in a building does not. The reader caches
scans locally when it can't reach the server and retries automatically with a backoff timer, and it
sends a heartbeat every thirty seconds so the system always knows whether it's actually still
working, rather than only finding out once a class's attendance data goes missing.

The backend is Node and Express, and I want to be upfront that this wasn't the original plan either,
I started with an earlier setup in a different language and rewrote it once I realised how much
value there was in keeping the backend and frontend in the same ecosystem, sharing the same query
patterns and the same way of reasoning about access control instead of maintaining two separate
mental models for the same system. The backend validates its own configuration at startup rather
than just trusting it, actively checking that the database key it's been given is the right kind of
key before it lets the app run at all, which catches the single most damaging mistake I could make
before it ever reaches a real user.

The database is PostgreSQL through Supabase, and every table has Row Level Security enabled on top
of the role checks already happening in the backend. I want to be specific about why that's not
redundant, the backend already enforces roles through its own middleware, but the frontend also
queries Supabase directly in several places rather than always going through the backend API, and
for those calls the backend's role check never runs at all. Row Level Security is the only thing
standing between a signed-in student's browser and another student's data in that situation, so
having both layers is genuine defence in depth, not the same protection written twice for no reason.

The frontend is React and Vite, split into role-scoped dashboards for teachers, students, and
admins, plus a completely separate public site with its own visual design, since a marketing page
and a tool someone uses forty times a day shouldn't look or feel like the same thing. Attendance
updates push to the dashboard live through Supabase's realtime feature rather than through polling,
because a teacher actively watching a class shouldn't have to manually refresh to see who's arrived.

## Beyond basic attendance

A few things exist in this system that go past just recording a tap. Emergency roll call is
completely separate from normal class attendance, because a fire drill or a lockdown asks a
different question entirely, not "who's in this specific class right now" but "is every student in
the building accounted for, regardless of what class they're supposed to be in." That needed its own
tables and its own live view rather than being bolted onto the existing session and attendance
structure.

There's also a formal appeals process, because a student marked absent by mistake previously had no
way to dispute it beyond hoping a teacher would notice and manually fix a row with no record of why
it changed. Every appeal now carries a full trail, what was disputed, what was requested instead,
who decided it, and when.

I also built a dedicated project management board rather than using a generic tool, live and
publicly viewable at rfid-project-board.vercel.app, broken into categories, hardware, software,
research, ethics and legal, and project management, with every task carrying not just a title but
the actual reasoning behind it and a breakdown of the concrete steps involved.

## Testing and security

I ran an independent security audit on this system rather than just assuming the pieces I'd used
were secure because they were built on established tools. That audit found two real issues, a debug
endpoint that was returning internal error detail to anyone who could trigger a failure on it, and
an endpoint that was exposing a reader's authentication key to any teacher account rather than just
admins, which would have let a teacher forge attendance scans for a room that wasn't theirs. Both
were fixed and retested specifically, not just patched and assumed to be fine.

Testing more broadly covered functional behaviour, boundary conditions around the present and late
threshold, hardware and network failure modes like a reader losing Wi-Fi mid-scan, and a real
classroom trial with an actual teacher and actual students using the system exactly as it would be
used in practice, not as a demo. I've documented all of this in more depth elsewhere rather than
compressing it down here, because I think the specific bugs I found and how I fixed them are more
honest evidence of real testing than a general claim that testing happened.

## Where things stand

The core system is built and working end to end, the firmware, the backend, the database, and the
dashboard are all in place and actually talking to each other, not separate pieces that happen to
sit in the same repository. I've been upfront in the project's evidence reports about what's still
genuinely unfinished rather than presenting this as a flawless, closed project, because I think that
honesty is worth more than a polished summary that quietly leaves out the parts still in progress.
