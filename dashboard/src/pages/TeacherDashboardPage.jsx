import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowUpRight, ClipboardList, Users } from 'lucide-react'

import { api } from '../api/client'
import SessionPanel from '../components/teacher/SessionPanel'
import NotificationBell from '../components/teacher/NotificationBell'
import TagoLogo from '../components/TagoLogo'
import ThemeToggle from '../components/ThemeToggle'
import ProfileMenu from '../components/ProfileMenu'
import TimetableView from '../components/TimetableView'
import AppealsPanel from '../components/AppealsPanel'
import Card from '../components/Card'

import { startSessionForClass } from '../utils/startSession'


const EMPTY_TIMETABLE = {
  periods: [],
  todayPeriods: [],
  currentClass: null,
  nextClass: null
}


export default function TeacherDashboardPage({ session, profile }) {

  const navigate = useNavigate()

  const [timetable, setTimetable] = useState(EMPTY_TIMETABLE)
  const [timetableLoading, setTimetableLoading] = useState(true)

  const [startError, setStartError] = useState(null)

  const [readers, setReaders] = useState([])
  const [selectedReader, setSelectedReader] = useState('')
  const [pendingPeriod, setPendingPeriod] = useState(null)



  useEffect(() => {

    api.get('/api/timetable/teacher')
      .then((data) => {

        setTimetable(
          data?.error
            ? EMPTY_TIMETABLE
            : {
                ...EMPTY_TIMETABLE,
                periods: Array.isArray(data) ? data : []
              }
        )

        setTimetableLoading(false)

      })

  }, [])



  useEffect(() => {

    async function loadReaders() {

      const data = await api.get('/api/readers')

      if (Array.isArray(data)) {
        setReaders(data)
      }

    }

    loadReaders()

  }, [])



  function handleStartClass(period) {

    const classId =
      period.class_id ||
      period.class?.id


    if (!classId) {

      setStartError(
        'This timetable entry has no linked class.'
      )

      return
    }


    setStartError(null)


    setPendingPeriod({
      ...period,
      class_id: classId
    })

  }



  async function confirmStartSession() {

    if (!pendingPeriod) {

      setStartError(
        'No class selected.'
      )

      return
    }


    if (!selectedReader) {

      setStartError(
        'Please select a classroom reader.'
      )

      return
    }



    const result = await startSessionForClass(
      pendingPeriod.class_id,
      {
        readerId: selectedReader
      }
    )



    if (result.error) {

      setStartError(result.error)

      return
    }



    navigate(
      `/teacher/session/${result.session.id}`
    )

  }




  return (

    <div className="dashboard">


      <header className="dashboard-header">

        <div className="header-brand">

          <TagoLogo
            showWord
            size={18}
            markClassName="header-brand-icon"
          />

        </div>


        <div className="header-right">

          <NotificationBell />

          <ThemeToggle />


          <ProfileMenu
            name={profile?.full_name}
            email={session.user.email}
            role="teacher"
            profileId={profile?.id}
          />

        </div>


      </header>



      <main className="dashboard-main">


        <SessionPanel />



        <Card
          title="Looking for a student?"
          action={
            <Link
              className="btn-ghost"
              to="/teacher/students"
            >
              <Users size={14}/>
              Search students
              <ArrowUpRight size={14}/>
            </Link>
          }
        >
          <p className="table-helper-text">
            Search any student by name, ID, kainga or LA teacher, or scan their card, to see
            their full profile and timetable.
          </p>
        </Card>

        <Card
          title="Reader down, or a card not working?"
          action={
            <Link
              className="btn-ghost"
              to="/teacher/manual-roll"
            >
              <ClipboardList size={14}/>
              Take a manual roll
              <ArrowUpRight size={14}/>
            </Link>
          }
        >
          <p className="table-helper-text">
            Take attendance by hand from the class roster and submit it to admin
            the same way as a normal session - no RFID reader required.
          </p>
        </Card>

        <Card
          title="Covering another class?"
          action={

            <Link
              className="btn-ghost"
              to="/teacher/cover"
            >

              <Users size={14}/>
              Find a teacher to cover
              <ArrowUpRight size={14}/>

            </Link>

          }
        >

          <p className="table-helper-text">
            If you are filling in for another teacher,
            search for them to see and start their classes.
          </p>

        </Card>




        <Card
          title="Appeals for your classes"
          action={

            <Link
              className="btn-ghost"
              to="/teacher/appeals"
            >

              Manage appeals
              <ArrowUpRight size={14}/>

            </Link>

          }
        >

          <AppealsPanel
            mode="teacher"
            compact
            hideResolved
          />

        </Card>



        {
          startError &&
          <p className="portal-error-message">
            {startError}
          </p>
        }



        {
          !timetableLoading &&

          <TimetableView

            periods={timetable.periods}

            todayPeriods={timetable.todayPeriods}

            currentClass={timetable.currentClass}

            nextClass={timetable.nextClass}

            title="Timetable"

            subtitle="Classes assigned to you"

            emptyMessage="No timetable periods are assigned to you yet."

            onStartClass={handleStartClass}

          />

        }




        {
          pendingPeriod &&

          <div className="modal-overlay">

            <div className="modal-card">


              <h3>
                Select classroom reader
              </h3>


              <p>
                Starting:
                {' '}
                {pendingPeriod.subject ||
                 pendingPeriod.class?.name}
              </p>



              <select

                value={selectedReader}

                onChange={(e)=>
                  setSelectedReader(e.target.value)
                }

              >

                <option value="">
                  Select reader
                </option>


                {
                  readers.map(reader => (

                    <option
                      key={reader.id}
                      value={reader.id}
                    >

                      {
                        reader.room ||
                        reader.label ||
                        reader.id
                      }

                    </option>

                  ))
                }


              </select>



              <div>

                <button
                  onClick={confirmStartSession}
                >
                  Start session
                </button>


                <button
                  onClick={()=>{
                    setPendingPeriod(null)
                    setSelectedReader('')
                  }}
                >
                  Cancel
                </button>


              </div>


            </div>

          </div>

        }


      </main>


    </div>

  )

}