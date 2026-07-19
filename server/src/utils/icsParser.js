/*
 * Tago Onboarding - ICS Timetable Parser
 * ========================================
 * KAMAR gives every student their own unique .ics feed URL. This pulls
 * one down, expands the recurring weekly VEVENTs, and returns rows shaped
 * for the timetable_slots table.
 *
 * Requires: npm install node-ical
 */

const ical = require('node-ical')

const DAY_CODE_TO_INDEX = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 }

/**
 * Fetch and parse a student's ICS feed into timetable rows.
 * Returns [{ subject_name, day_of_week, start_time, end_time, room, teacher_name }]
 */
async function fetchStudentTimetable(icsUrl) {
  if (!icsUrl) return []

  let data
  try {
    data = await ical.async.fromURL(icsUrl)
  } catch (error) {
    throw new Error(`Failed to fetch/parse ICS feed: ${error.message}`)
  }

  const slots = []

  for (const key of Object.keys(data)) {
    const event = data[key]
    if (event.type !== 'VEVENT') continue

    const summary = (event.summary || '').toString().trim()
    if (!summary) continue

    const { subjectName, teacherName } = splitSummary(summary)
    const room = (event.location || '').toString().trim() || null
    const startTime = toTimeString(event.start)
    const endTime = toTimeString(event.end)

    if (!startTime || !endTime) continue

    // Recurring weekly class (the normal case for a school timetable)
    if (event.rrule) {
      const byDay = extractByDay(event.rrule)
      if (byDay.length > 0) {
        for (const dayCode of byDay) {
          const dayIndex = DAY_CODE_TO_INDEX[dayCode]
          if (dayIndex === undefined) continue
          slots.push({
            subject_name: subjectName,
            teacher_name: teacherName,
            room,
            day_of_week: dayIndex,
            start_time: startTime,
            end_time: endTime,
          })
        }
        continue
      }
    }

    // One-off / non-recurring event: use the day of DTSTART
    const dayIndex = jsDayToMondayIndex(event.start.getDay())
    slots.push({
      subject_name: subjectName,
      teacher_name: teacherName,
      room,
      day_of_week: dayIndex,
      start_time: startTime,
      end_time: endTime,
    })
  }

  return dedupeSlots(slots)
}

// KAMAR SUMMARY fields are commonly "SubjectName - TeacherInitials" or just "SubjectName".
// Adjust this split if your school's export format differs.
function splitSummary(summary) {
  const parts = summary.split(' - ')
  if (parts.length >= 2) {
    return { subjectName: parts[0].trim(), teacherName: parts.slice(1).join(' - ').trim() }
  }
  return { subjectName: summary, teacherName: null }
}

function extractByDay(rrule) {
  // node-ical's rrule.options.byweekday gives numeric weekday objects (0=Mon in rrule.js)
  const options = rrule.origOptions || rrule.options
  if (!options || !options.byweekday) return []

  const RRULE_INDEX_TO_CODE = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
  const byweekday = Array.isArray(options.byweekday) ? options.byweekday : [options.byweekday]

  return byweekday
    .map((entry) => {
      // entry can be a plain number (rrule.js weekday) or an object with .weekday
      const idx = typeof entry === 'number' ? entry : entry?.weekday
      return RRULE_INDEX_TO_CODE[idx]
    })
    .filter(Boolean)
}

function jsDayToMondayIndex(jsDay) {
  // JS: 0=Sun..6=Sat -> our schema: 0=Mon..6=Sun
  return (jsDay + 6) % 7
}

function toTimeString(date) {
  if (!date) return null
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}:00`
}

function dedupeSlots(slots) {
  const seen = new Set()
  return slots.filter((slot) => {
    const key = `${slot.subject_name}|${slot.day_of_week}|${slot.start_time}|${slot.end_time}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

module.exports = { fetchStudentTimetable }