import PublicSiteLayout from '../components/PublicSiteLayout'
import Reveal from '../components/Reveal'
import { Separator } from '@/components/ui/separator'

// Written around the 13 information privacy principles in the Privacy Act 2020.
const SCHOOL = 'Ormiston Senior'
const PRIVACY_CONTACT = 'st24269@ormiston.school.nz'

const collected = [
  ['Identity', 'Name, preferred name, student number, year level, and school email address.'],
  ['Photograph', 'A student photo, where the school supplies one, used to confirm identity at the reader and in class registers.'],
  ['RFID card', 'The unique identifier (UID) of the card issued to a student, and its status — active, replaced, lost, or deactivated.'],
  ['Attendance', 'Scan time, room, class, session, and the resulting status (present, late, absent, excused), including manual changes made by a teacher.'],
  ['Account', 'Email address and role for staff and student logins, and authentication records held by our authentication provider.'],
  ['Audit', 'A record of sensitive administrative actions — who changed a student record, a card, or an attendance entry, and when.'],
]

const principles = [
  {
    id: 'why',
    heading: 'Why we collect it, and how',
    ipp: 'IPPs 1–4',
    paragraphs: [
      `${SCHOOL} collects this information for one purpose: to record and manage attendance, which the school is required to keep. It is not collected for marketing, profiling, or any purpose unrelated to attendance.`,
      'Information is collected directly from the student or their family where possible, and otherwise from the school\'s existing student records. Collection is limited to what attendance actually requires — Tago does not track location outside the moment a card is presented to a classroom reader, and it does not record audio or video.',
      'Scanning a card at a classroom reader is the act of being marked present. Students are told what the readers are for, and a teacher can always mark attendance manually instead.',
    ],
  },
  {
    id: 'identifiers',
    heading: 'RFID cards as unique identifiers',
    ipp: 'IPP 13',
    paragraphs: [
      'Each RFID card carries a unique identifier. It is assigned only because attendance cannot be matched to a student without it, and it is not the student\'s national student number or any identifier assigned by another agency.',
      'Full card UIDs are masked in student-facing views. A lost or stolen card can be deactivated so it no longer registers a scan, and a replacement can be issued without changing any other record.',
    ],
  },
  {
    id: 'security',
    heading: 'How it is stored and protected',
    ipp: 'IPP 5',
    paragraphs: [
      'Access is restricted by role. Students see only their own attendance. Teachers see only the classes they take. Administrative functions — managing students, cards, readers, and accounts — are limited to staff with an admin role.',
      'Accounts are authenticated with email and password, database access is constrained by row-level security policies, and classroom readers authenticate to the system with their own API keys rather than a shared password. Administrative actions are written to an audit log.',
    ],
  },
  {
    id: 'offshore',
    heading: 'Storage outside New Zealand',
    ipp: 'IPP 12',
    paragraphs: [
      'Tago uses Supabase for its database and authentication. Depending on the region the school selects, this information may be stored on servers outside New Zealand.',
      `Before this system is used with real student data, ${SCHOOL} should confirm the hosting region and satisfy itself that the provider is subject to privacy safeguards comparable to the Privacy Act 2020, as IPP 12 requires for cross-border disclosure.`,
    ],
  },
  {
    id: 'use',
    heading: 'How it is used and shared',
    ipp: 'IPPs 10–11',
    paragraphs: [
      'Attendance information is used to mark rolls, show students their own records, produce attendance reports for staff, and flag unusual scans for review.',
      `It is not sold, and it is not shared with third parties for their own purposes. It may be disclosed within ${SCHOOL} to staff who need it for attendance or pastoral reasons, to a student's parents or guardians in line with school policy, and to the Ministry of Education or other agencies where the school is legally required to report attendance.`,
    ],
  },
  {
    id: 'retention',
    heading: 'How long it is kept',
    ipp: 'IPP 9',
    paragraphs: [
      `Attendance records are kept for as long as ${SCHOOL} is required to keep them under the Public Records Act 2005 and the school's own retention and disposal schedule, and no longer.`,
      'Card assignments are closed off when a card is deactivated or a student leaves. Login accounts are disabled when a student or staff member leaves the school.',
    ],
  },
  {
    id: 'access',
    heading: 'Seeing and correcting your information',
    ipp: 'IPPs 6–8',
    paragraphs: [
      'You have the right to ask whether we hold personal information about you, to see it, and to ask us to correct it if it is wrong. Students can see their own attendance status, history, and card details in the student portal at any time.',
      `To request anything further, or to ask for a correction, contact ${PRIVACY_CONTACT}. Under the Privacy Act 2020 we must respond as soon as reasonably practicable and no later than 20 working days after receiving the request.`,
      'If we do not agree to make a correction, you can ask us to attach a statement of the correction you sought, and we will keep that statement with the record.',
    ],
  },
  {
    id: 'breach',
    heading: 'If something goes wrong',
    ipp: 'Part 6',
    paragraphs: [
      `If a privacy breach happens and it is likely to cause serious harm, ${SCHOOL} must notify the Office of the Privacy Commissioner and the people affected as soon as practicable, as required by the notifiable breach scheme.`,
    ],
  },
  {
    id: 'complaints',
    heading: 'Complaints',
    ipp: null,
    paragraphs: [
      `If you think your privacy has been interfered with, please raise it with ${PRIVACY_CONTACT} first so the school can try to resolve it.`,
      'If you are not satisfied with the response, you can complain to the Office of the Privacy Commissioner at privacy.org.nz, by email to enquiries@privacy.org.nz, or by phone on 0800 803 909.',
    ],
  },
]

export default function PrivacyPolicyPage() {
  return (
    <PublicSiteLayout>
      <main className="vivid-main vivid-docs">
        <section className="vivid-doc-hero">
          <Reveal as="p" className="vivid-eyebrow">
            Privacy Act 2020
          </Reveal>
          <Reveal as="h1" className="vivid-display-sm" delay={60}>
            Privacy Policy
          </Reveal>
          <Reveal as="p" className="vivid-body" delay={120}>
            How the Tago attendance system collects, uses, and protects personal information.
          </Reveal>
        </section>

        <div className="vivid-notice" role="note">
          <strong>Draft — not legal advice.</strong> This statement follows the structure of
          the Privacy Act 2020, but {SCHOOL} is the agency responsible under the Act. The
          retention schedule and the Supabase hosting region still need to be confirmed, and
          the whole statement reviewed by someone qualified, before it is relied on.
        </div>

        <div className="vivid-doc-layout">
          <aside className="vivid-doc-nav" aria-label="Policy sections">
            <a href="#collected">What we collect</a>
            {principles.map(({ id, heading }) => (
              <a key={id} href={`#${id}`}>
                {heading}
              </a>
            ))}
          </aside>

          <article className="vivid-docs-main">
            <section className="vivid-doc-section" id="collected">
              <h2 className="vivid-doc-heading">What personal information we collect</h2>
              <Separator className="vivid-rule" />
              <div className="vivid-doc-body">
                <div className="vivid-data-table" role="table" aria-label="Information collected">
                  {collected.map(([kind, detail]) => (
                    <div className="vivid-data-row" role="row" key={kind}>
                      <strong role="cell">{kind}</strong>
                      <span role="cell">{detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {principles.map(({ id, heading, ipp, paragraphs }) => (
              <section className="vivid-doc-section" id={id} key={id}>
                <h2 className="vivid-doc-heading">
                  {heading}
                  {ipp && <span className="vivid-doc-tag">{ipp}</span>}
                </h2>
                <Separator className="vivid-rule" />
                <div className="vivid-doc-body">
                  {paragraphs.map((text) => (
                    <p key={text.slice(0, 40)}>{text}</p>
                  ))}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>
    </PublicSiteLayout>
  )
}
