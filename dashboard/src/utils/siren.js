// Plays a wailing emergency-siren tone for the given duration using Web
// Audio - no audio asset needed. A sawtooth wave gives it the harsher,
// buzzy edge of a real siren speaker rather than a soft sine warble, swept
// slowly (2s per up/down cycle) like a fire/civil-defence wail rather than
// a fast police "yelp". Browsers block audio without a prior user gesture,
// so this can silently no-op on a page nobody has interacted with yet;
// that's acceptable here since it's a secondary alert on top of the
// visible red emergency banner, not the only signal.
export function playEmergencySiren(durationMs = 10000) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return

    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    const LOW_HZ = 400
    const HIGH_HZ = 1000
    const CYCLE_SECONDS = 2

    oscillator.type = 'sawtooth'
    oscillator.connect(gain)
    gain.connect(context.destination)

    const startTime = context.currentTime
    const endTime = startTime + durationMs / 1000

    // Quick fade in/out instead of a hard on/off, so the siren doesn't
    // click at the start and end.
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(0.16, startTime + 0.08)
    gain.gain.setValueAtTime(0.16, Math.max(startTime + 0.08, endTime - 0.15))
    gain.gain.linearRampToValueAtTime(0, endTime)

    oscillator.frequency.setValueAtTime(LOW_HZ, startTime)
    for (let time = startTime; time < endTime; time += CYCLE_SECONDS) {
      oscillator.frequency.linearRampToValueAtTime(HIGH_HZ, time + CYCLE_SECONDS / 2)
      oscillator.frequency.linearRampToValueAtTime(LOW_HZ, time + CYCLE_SECONDS)
    }

    oscillator.start(startTime)
    oscillator.stop(endTime)
    oscillator.onended = () => {
      gain.disconnect()
      oscillator.disconnect()
      context.close().catch(() => {})
    }

    context.resume?.().catch(() => {})
  } catch {
    // Audio is a secondary alert, not the source of truth - never let a
    // playback failure interrupt the emergency workflow.
  }
}
