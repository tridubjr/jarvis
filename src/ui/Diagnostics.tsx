import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { createSpeaker } from '../lib/tts'

/**
 * The "why can't he hear me / why can't I hear him" panel.
 *
 * Both halves of the voice loop fail silently by nature. Speech recognition
 * that ignores you and speech synthesis that produces no sound look identical
 * from the outside — nothing throws, nothing logs, the interface carries on as
 * though it were working. Every bug in this loop has therefore cost a round
 * trip of guesswork, and that is the actual problem this fixes: it is not a
 * developer toy, it is the instrument that turns "it doesn't work" into a
 * specific, answerable fact.
 *
 * Press D to show it. It polls rather than subscribing, because the two
 * diagnostic records are plain mutable objects written from outside React —
 * that is deliberate, since the whole point is to observe the loop without
 * changing its timing.
 */

type VoiceDiag = {
  running: boolean
  sessions: number
  heard: string
  heardAt: number
  lastError: string
  wakes: number
  mode: string
  dropped: string
  accepted: number
  restarts: number
  idleMs: number
  lastEvent: string
  interim: string
  events: string[]
}

type TtsDiag = {
  engine: string
  spoken: number
  started: number
  failures: number
  lastError: string
  nativeBroken: boolean
  rescued: number
  voice: string
  lastText: string
}

const ago = (t: number) => (t ? `${((Date.now() - t) / 1000).toFixed(1)}s ago` : '—')

function Row({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="diag-row">
      <span className="diag-k">{k}</span>
      <span className={bad ? 'diag-v diag-bad' : 'diag-v'}>{v}</span>
    </div>
  )
}

export function Diagnostics({ onTapListen }: { onTapListen: () => void }) {
  const [open, setOpen] = useState(false)
  const [testingSpeaker, setTestingSpeaker] = useState(false)
  const [testingRecognition, setTestingRecognition] = useState(false)
  const [recognitionTest, setRecognitionTest] = useState('Not tested yet')
  const recognitionRef = useRef<any>(null)
  const recognitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, tick] = useState(0)
  const phase = useStore((s) => s.phase)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'd' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [open])

  useEffect(() => () => {
    if (recognitionTimer.current) clearTimeout(recognitionTimer.current)
    try { recognitionRef.current?.abort() } catch { /* noop */ }
    recognitionRef.current = null
  }, [])

  if (!open) return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open voice diagnostics"
      style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 10000, pointerEvents: 'auto', padding: '9px 12px', border: '1px solid rgba(110,220,255,.55)', borderRadius: 999, background: 'rgba(5,18,30,.88)', color: '#9deaff', font: '600 11px monospace', letterSpacing: '1px' }}
    >VOICE DIAG</button>
  )

  const w = window as unknown as Record<string, unknown>
  const v = (w.__voice ?? {}) as Partial<VoiceDiag>
  const t = (w.__tts ?? {}) as Partial<TtsDiag>

  // The two verdicts worth stating outright, rather than making you infer them
  // from the numbers underneath.
  const earsOk = Boolean(v.running) && (v.accepted ?? 0) > 0
  const mouthOk = (t.started ?? 0) > 0 || (t.rescued ?? 0) > 0

  return (
    <div className="diag" aria-live="polite">
      <div className="diag-head">DIAGNOSTICS · tap CLOSE</div>
      <button type="button" onClick={onTapListen} style={{ position: 'absolute', top: 8, left: 8, pointerEvents: 'auto', padding: '5px 9px', background: 'transparent', color: 'inherit', border: '1px solid currentColor', borderRadius: 6 }}>TAP TO LISTEN</button>
      <button type="button" onClick={() => {
        if (testingRecognition) return
        const Ctor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
        if (!Ctor) { setRecognitionTest('This browser does not expose SpeechRecognition.'); return }
        try { recognitionRef.current?.abort() } catch { /* noop */ }
        const test = new Ctor()
        recognitionRef.current = test
        test.continuous = false
        // Match the simple final-result flow used by the working MDN demo.
        test.interimResults = false
        test.lang = 'en-US'
        setTestingRecognition(true)
        setRecognitionTest('Starting isolated browser test… say a short phrase.')
        test.onstart = () => setRecognitionTest('Listening — say a short phrase now.')
        test.onspeechstart = () => setRecognitionTest('Speech detected — waiting for recognized words…')
        test.onresult = (event: any) => {
          const parts: string[] = []
          for (let i = event.resultIndex; i < event.results.length; i++) parts.push(event.results[i][0].transcript)
          setRecognitionTest(parts.join(' ').trim() || 'A result event arrived, but contained no transcript.')
        }
        test.onnomatch = () => setRecognitionTest('Browser returned no speech match.')
        test.onerror = (event: any) => setRecognitionTest(`Browser error: ${String(event.error ?? 'unknown')}`)
        test.onend = () => {
          if (recognitionTimer.current) clearTimeout(recognitionTimer.current)
          recognitionTimer.current = null
          setTestingRecognition(false)
          if (recognitionRef.current === test) recognitionRef.current = null
        }
        if (recognitionTimer.current) clearTimeout(recognitionTimer.current)
        recognitionTimer.current = setTimeout(() => {
          if (recognitionRef.current !== test) return
          setRecognitionTest('Timed out after 12 seconds without a result. The recognition service did not return words.')
          try { test.abort() } catch { /* noop */ }
          recognitionRef.current = null
          setTestingRecognition(false)
          recognitionTimer.current = null
        }, 12000)
        try { test.start() } catch (error) {
          if (recognitionTimer.current) clearTimeout(recognitionTimer.current)
          recognitionTimer.current = null
          recognitionRef.current = null
          setTestingRecognition(false)
          setRecognitionTest(`Could not start: ${String(error)}`)
        }
      }} style={{ position: 'absolute', top: 42, left: 8, pointerEvents: 'auto', padding: '5px 9px', background: 'transparent', color: 'inherit', border: '1px solid currentColor', borderRadius: 6 }} disabled={testingRecognition}>{testingRecognition ? 'TEST LISTENING…' : 'TEST RAW RECOGNITION'}</button>
      <button type="button" onClick={() => {
        if (testingSpeaker) return
        setTestingSpeaker(true)
        const test = createSpeaker()
        test.say('Audio test. If you can hear this, speech output is working, sir.')
        void test.end().finally(() => setTestingSpeaker(false))
      }} style={{ position: 'absolute', top: 8, right: 76, pointerEvents: 'auto', padding: '5px 9px', background: 'transparent', color: 'inherit', border: '1px solid currentColor', borderRadius: 6 }} disabled={testingSpeaker}>{testingSpeaker ? 'TESTING…' : 'TEST SPEAKER'}</button>
      <button type="button" onClick={() => setOpen(false)} style={{ position: 'absolute', top: 8, right: 8, pointerEvents: 'auto', padding: '5px 9px', background: 'transparent', color: 'inherit', border: '1px solid currentColor', borderRadius: 6 }}>CLOSE</button>

      <div className="diag-sec" style={{ marginTop: 34 }}>ISOLATED BROWSER TEST</div>
      <Row k="raw result" v={recognitionTest} />

      <div className="diag-verdict">
        <span className={earsOk ? 'diag-ok' : 'diag-bad'}>
          {earsOk ? '● hearing you' : '● not hearing you'}
        </span>
        <span className={mouthOk ? 'diag-ok' : 'diag-bad'}>
          {mouthOk ? '● speaking' : '● no sound produced'}
        </span>
      </div>

      <div className="diag-sec">LISTENING · KEY STATUS</div>
      <Row k="recogniser" v={v.running ? 'RUNNING' : 'STOPPED'} bad={!v.running} />
      <Row k="last error" v={v.lastError || '— none'} bad={Boolean(v.lastError)} />
      <Row k="engine event" v={v.lastEvent || 'waiting for start'} bad={Boolean(v.lastError)} />
      <Row k="live transcript" v={v.interim || '— none yet'} />
      <div className="diag-sec">RECENT EVENTS · newest first</div>
      <div style={{ maxHeight: 104, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {(v.events ?? []).slice(-5).reverse().map((event, i) => (
          <Row key={i} k={String(i + 1)} v={event} />
        ))}
      </div>
      <Row k="sessions" v={String(v.sessions ?? 0)} />
      <Row
        k="silent for"
        v={`${((v.idleMs ?? 0) / 1000).toFixed(1)}s`}
        bad={(v.idleMs ?? 0) > 15000}
      />
      <Row k="forced restarts" v={String(v.restarts ?? 0)} bad={(v.restarts ?? 0) > 0} />
      <Row k="mode" v={`${v.mode ?? '—'} (phase ${phase})`} />
      <Row k="accepted" v={String(v.accepted ?? 0)} bad={(v.accepted ?? 0) === 0} />
      <Row k="wakes" v={String(v.wakes ?? 0)} />
      <Row k="last heard" v={v.heard ? `"${v.heard}" ${ago(v.heardAt ?? 0)}` : '— nothing yet'} bad={!v.heard} />
      <Row k="last drop" v={v.dropped || '—'} bad={Boolean(v.dropped)} />

      <div className="diag-sec">SPEAKING · press T to test</div>
      <Row k="engine" v={String(t.engine ?? 'system')} />
      <Row k="voice" v={String(t.voice || '—')} />
      <Row k="handed to OS" v={String(t.spoken ?? 0)} />
      <Row k="actually spoke" v={String(t.started ?? 0)} bad={(t.started ?? 0) === 0} />
      <Row k="failures" v={String(t.failures ?? 0)} bad={(t.failures ?? 0) > 0} />
      <Row k="cloud rescues" v={String(t.rescued ?? 0)} />
      <Row k="error" v={t.lastError || '—'} bad={Boolean(t.lastError)} />
    </div>
  )
}
