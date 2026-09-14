/**
 * Synthesizes a pleasant dual-tone airport/service bell chime using Web Audio API.
 * Fundamental: 830Hz, Overtones: 1050Hz, 1320Hz.
 * Exponential decay over 1.2 seconds.
 * 100% reliable, zero network latency, zero external asset dependency.
 */
let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

// Automatically unlock AudioContext on first user click or keydown
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
  }
  window.addEventListener('click', unlock, { once: false, passive: true })
  window.addEventListener('keydown', unlock, { once: false, passive: true })
}

export function playBellNotification() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    // 1. Fundamental tone (830Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(830, now)
    osc1.frequency.exponentialRampToValueAtTime(820, now + 0.9)
    gain1.gain.setValueAtTime(0.28, now)
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)

    // 2. Harmonic chime overtone (1050Hz)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1050, now)
    osc2.frequency.exponentialRampToValueAtTime(1040, now + 0.9)
    gain2.gain.setValueAtTime(0.22, now)
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)

    // 3. Shimmer overtone (1320Hz, short burst)
    const osc3 = ctx.createOscillator()
    const gain3 = ctx.createGain()
    osc3.type = 'sine'
    osc3.frequency.setValueAtTime(1320, now)
    gain3.gain.setValueAtTime(0.12, now)
    gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
    osc3.connect(gain3)
    gain3.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)
    osc3.start(now)

    osc1.stop(now + 1.2)
    osc2.stop(now + 1.2)
    osc3.stop(now + 0.5)
  } catch (err) {
    console.warn('[BellSound] Audio play failed:', err)
  }
}
