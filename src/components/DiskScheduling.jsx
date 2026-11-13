import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  Disc,
  FastForward,
  Gauge,
  HardDrive,
  HelpCircle,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { executeDiskAlgorithm, getDiskPreset } from '../utils/diskAlgorithms'
import {
  calculateDualHeadSchedule,
  getZoneInfo,
  ZONES,
  CTRL_STATES,
} from '../utils/diskPhysicsEngine'
import NVMeVisualizer from './NVMeVisualizer'

// ─── Paradigm constants ────────────────────────────────────────────────────
const PARADIGM_HDD = 'HDD'
const PARADIGM_SSD = 'SSD'

// ─── Mode constants ────────────────────────────────────────────────────────
const MODE_INSTANT     = 'INSTANT'
const MODE_INTERACTIVE = 'INTERACTIVE'
const ARCH_SINGLE      = 'SINGLE'
const ARCH_DUAL        = 'DUAL'

const SPEED_OPTIONS = [0.5, 1, 2, 5]

// ─── Platter geometry constants (single source of truth) ──────────────────
const PLATTER_CX         = 200
const PLATTER_CY         = 200
const PLATTER_MAX_RADIUS = 180   // cylinder 0  → outer rim
const PLATTER_MIN_RADIUS = 50    // cylinder 199 → inner core
const PLATTER_HUB_R      = 22

/**
 * Unified radius formula — used by BOTH arm tip and request dots.
 * cylinder 0 = outermost (maxRadius), cylinder 199 = innermost (minRadius).
 */
function getCylinderRadius(cylinder, maxRadius = PLATTER_MAX_RADIUS, minRadius = PLATTER_MIN_RADIUS) {
  const clamped = Math.max(0, Math.min(199, cylinder))
  return maxRadius - (clamped / 199) * (maxRadius - minRadius)
}

// ─── Arm sweep angle — a fixed linear sweep across 160° at the bottom ─────
// cylinder 0 → leftmost  (18° from bottom-left)
// cylinder 199 → rightmost (18° from bottom-right)
const ARM_START_ANGLE = Math.PI * 0.6   // ~108°
const ARM_END_ANGLE   = Math.PI * 2.4   // ~432° → i.e. wraps to the right

function getCylinderAngle(cylinder) {
  const norm = Math.max(0, Math.min(199, cylinder)) / 199
  // sweep from ARM_START_ANGLE to ARM_END_ANGLE  (about 288° arc — full bottom sweep)
  // Simpler: sweep a 160° arc centred at the bottom (π/2 down)
  const startA = Math.PI + Math.PI * 0.1   // 198°
  const endA   = Math.PI * 2 - Math.PI * 0.1 // 342°
  return startA + norm * (endA - startA)
}

// ─── Build seek sequence (same algorithm logic, shared) ───────────────────
function buildSeekSequence(requests, head, algorithm) {
  const sorted = [...requests].sort((a, b) => a - b)
  switch (algorithm) {
    case 'SSTF': {
      let cur = head
      const pending = [...requests]
      const seq = [cur]
      while (pending.length > 0) {
        let best = 0, bestDist = Math.abs(pending[0] - cur)
        for (let i = 1; i < pending.length; i++) {
          const d = Math.abs(pending[i] - cur)
          if (d < bestDist) { bestDist = d; best = i }
        }
        cur = pending[best]
        seq.push(cur)
        pending.splice(best, 1)
      }
      return seq
    }
    case 'SCAN':
    case 'LOOK': {
      const left  = sorted.filter(r => r <= head).reverse()
      const right = sorted.filter(r => r > head)
      return [head, ...left, ...right]
    }
    case 'C-SCAN':
    case 'C-LOOK': {
      const right = sorted.filter(r => r >= head)
      const left  = sorted.filter(r => r < head)
      return [head, ...right, ...left]
    }
    case 'FCFS':
    default:
      return [head, ...requests]
  }
}

/**
 * Build simplified simulation steps — one entry per target cylinder.
 * Each step has: { stepIdx, from, to, state:'SEEKING'|'PROCESSING'|'DONE', arm }
 */
function buildSimSteps(requests, head, algorithm, isDual) {
  const steps = []
  if (isDual) {
    // Arm0: 0–99, Arm1: 100–199
    const head0 = Math.min(99, head)
    const head1 = Math.max(100, Math.min(199, head > 99 ? head : 100))
    const reqs0 = requests.filter(r => r <= 99)
    const reqs1 = requests.filter(r => r >= 100)
    const seq0 = buildSeekSequence(reqs0, head0, algorithm)
    const seq1 = buildSeekSequence(reqs1, head1, algorithm)
    const maxLen = Math.max(seq0.length, seq1.length)
    let idx = 0
    for (let i = 0; i < maxLen - 1; i++) {
      if (i < seq0.length - 1)
        steps.push({ stepIdx: idx++, arm: 0, from: seq0[i], to: seq0[i + 1], state: 'SEEKING' })
      if (i < seq1.length - 1)
        steps.push({ stepIdx: idx++, arm: 1, from: seq1[i], to: seq1[i + 1], state: 'SEEKING' })
    }
  } else {
    const seq = buildSeekSequence(requests, head, algorithm)
    for (let i = 0; i < seq.length - 1; i++) {
      steps.push({ stepIdx: i, arm: 0, from: seq[i], to: seq[i + 1], state: 'SEEKING' })
    }
  }
  return steps
}

// ─────────────────────────────────────────────────────────────────────────
export default function DiskScheduling() {
  const [requestsInput, setRequestsInput] = useState('98, 183, 37, 122, 14, 124, 65, 67')
  const [initialHead,   setInitialHead]   = useState(53)
  const [diskSize,      setDiskSize]      = useState(200)
  const [direction,     setDirection]     = useState('left')
  const [algorithm,     setAlgorithm]     = useState('SCAN')
  const [paradigm,      setParadigm]      = useState(PARADIGM_HDD)
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false)

  const [viewMode, setViewMode] = useState(MODE_INSTANT)
  const [archMode, setArchMode] = useState(ARCH_SINGLE)

  // Instant-analysis result
  const [simulationResult, setSimulationResult] = useState(null)

  // Interactive simulation state
  const [simSteps,     setSimSteps]     = useState([])   // array of {stepIdx,arm,from,to}
  const [stepIdx,      setStepIdx]      = useState(-1)   // -1 = not started, index of current step
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [speed,        setSpeed]        = useState(1)
  const [liveInput,    setLiveInput]    = useState('')
  const [pendingQueue, setPendingQueue] = useState([])
  const intervalRef = useRef(null)

  const parsedRequests = useMemo(() => {
    const maxVal = Math.max(1, Number(diskSize) || 200) - 1
    return requestsInput
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !isNaN(Number(s)))
      .map(s => Math.max(0, Math.min(maxVal, parseInt(s, 10))))
  }, [requestsInput, diskSize])

  const maxCylinder = Math.max(1, (Number(diskSize) || 200) - 1)
  const headNum     = Number(initialHead) || 0

  // ── Instant Mode ─────────────────────────────────────────────────────────
  const handleRun = () => {
    if (parsedRequests.length === 0) return
    if (archMode === ARCH_DUAL) {
      const dr = calculateDualHeadSchedule(parsedRequests, headNum, algorithm)
      setSimulationResult({ dual: dr, type: 'dual' })
    } else {
      const r = executeDiskAlgorithm(algorithm, parsedRequests, headNum, direction, Number(diskSize) || 200)
      setSimulationResult({ ...r, type: 'single' })
    }
  }

  const handleSelectPreset = (key) => {
    setPresetDropdownOpen(false)
    const p = getDiskPreset(key)
    setRequestsInput(p.requests.join(', '))
    setInitialHead(p.head)
    setDiskSize(p.diskSize)
    setDirection(p.direction)
    setAlgorithm(p.algorithm)
    setSimulationResult(null)
    stopSim()
  }

  // ── Interactive Mode ──────────────────────────────────────────────────────
  const rebuildSteps = useCallback((extraReqs = []) => {
    const allReqs = [...parsedRequests, ...extraReqs]
    if (allReqs.length === 0) return []
    return buildSimSteps(allReqs, headNum, algorithm, archMode === ARCH_DUAL)
  }, [parsedRequests, headNum, algorithm, archMode])

  const loadSim = () => {
    const steps = rebuildSteps(pendingQueue)
    setSimSteps(steps)
    setStepIdx(-1)
    setIsPlaying(false)
  }

  const stopSim = () => {
    setIsPlaying(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  const resetSim = () => {
    stopSim()
    setStepIdx(-1)
    setSimSteps([])
    setPendingQueue([])
  }

  const stepForward = () => {
    setStepIdx(prev => Math.min(prev + 1, simSteps.length - 1))
  }

  // Auto-advance
  useEffect(() => {
    if (!isPlaying) { if (intervalRef.current) clearInterval(intervalRef.current); return }
    const ms = Math.round(700 / speed)
    intervalRef.current = setInterval(() => {
      setStepIdx(prev => {
        if (prev >= simSteps.length - 1) { setIsPlaying(false); return prev }
        return prev + 1
      })
    }, ms)
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, speed, simSteps.length])

  const handleInjectRequest = () => {
    const val = parseInt(liveInput.trim(), 10)
    if (isNaN(val) || val < 0 || val > maxCylinder) return
    const newPending = [...pendingQueue, val]
    setPendingQueue(newPending)
    setLiveInput('')
    const newSteps = rebuildSteps(newPending)
    setSimSteps(newSteps)
    setStepIdx(prev => Math.min(prev, newSteps.length - 1))
  }

  // Derived state for the platter
  const currentStep = stepIdx >= 0 ? simSteps[stepIdx] : null

  // Which cylinders have been fully serviced?
  const servicedCylinders = useMemo(() => {
    if (simSteps.length === 0 || stepIdx < 0) return new Set()
    const s = new Set()
    for (let i = 0; i <= stepIdx; i++) {
      s.add(simSteps[i].to)
    }
    return s
  }, [simSteps, stepIdx])

  // Active target cylinder (where the arm is heading right now)
  const activeTarget = currentStep?.to ?? null

  // All request cylinders (for dot rendering)
  const allRequestCyls = useMemo(() => [...parsedRequests, ...pendingQueue], [parsedRequests, pendingQueue])

  // Simplified controller state label
  const ctrlState = (() => {
    if (simSteps.length === 0) return { key: CTRL_STATES.IDLE, label: 'IDLE / WAITING', emoji: '⚪', color: 'text-slate-400', bg: 'bg-slate-700/40', border: 'border-slate-700' }
    if (stepIdx < 0) return { key: CTRL_STATES.IDLE, label: 'IDLE / WAITING', emoji: '⚪', color: 'text-slate-400', bg: 'bg-slate-700/40', border: 'border-slate-700' }
    if (stepIdx >= simSteps.length - 1 && !isPlaying) return { key: CTRL_STATES.COMPLETED, label: `COMPLETED · Track ${currentStep?.to ?? '—'}`, emoji: '✅', color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
    const cs = currentStep
    if (!cs) return { key: CTRL_STATES.IDLE, label: 'IDLE', emoji: '⚪', color: 'text-slate-400', bg: 'bg-slate-700/40', border: 'border-slate-700' }
    if (cs.state === 'SEEKING') return { key: CTRL_STATES.SEEKING, label: `SEEKING → Track ${cs.to}`, emoji: '🟡', color: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30' }
    return { key: CTRL_STATES.DATA_TRANSFER, label: `PROCESSING · Track ${cs.to}`, emoji: '🟢', color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
  })()

  // Instant-mode helpers
  const seekSequence   = simulationResult?.type === 'single' ? (simulationResult.seekSequence ?? [])  : []
  const steps          = simulationResult?.type === 'single' ? (simulationResult.steps ?? [])          : []
  const totalSeekCount = simulationResult?.type === 'single' ? (simulationResult.totalSeekCount ?? 0)  : 0
  const avgSeekCount   = simulationResult?.type === 'single' ? (simulationResult.avgSeekCount ?? '0.00') : '0.00'

  return (
    <div className="mx-auto max-w-[1480px] p-5 lg:p-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-300/70">Storage Subsystem Simulator</p>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Disk Arm Scheduling Simulator</h2>
          <p className="mt-1 text-sm text-slate-500">Analyze seek paths, head turnaround, ZBR zones, and MACH.2 dual-head parallelism.</p>
        </div>

        {/* Preset Dropdown */}
        <div className="relative">
          <button type="button" onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-300/40 hover:bg-cyan-300/5 hover:text-cyan-200">
            <Sparkles className="size-3.5 text-cyan-300" />
            Load Preset Workload
            <ChevronDown className="size-3.5 text-slate-400" />
          </button>
          {presetDropdownOpen && (
            <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-white/10 bg-[#0f141d] p-1.5 shadow-2xl">
              {[
                { key: 'textbook',   label: 'Standard Textbook (Head: 53)',  sub: '98, 183, 37, 122, 14, 124, 65, 67' },
                { key: 'starvation', label: 'SSTF Starvation Risk',          sub: 'Cluster near 50 starving 190, 195' },
                { key: 'boundary',   label: 'Boundary Oscillations',         sub: 'Requests alternating near 10 and 180' },
              ].map(({ key, label, sub }) => (
                <button key={key} onClick={() => handleSelectPreset(key)}
                  className="flex w-full flex-col rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-white/[0.06] hover:text-cyan-200">
                  <span className="font-medium">{label}</span>
                  <span className="text-[10px] text-slate-500">{sub}</span>
                </button>
              ))}
              <div className="my-1 border-t border-white/[0.06]" />
              <button onClick={() => handleSelectPreset('random')}
                className="flex w-full flex-col rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-white/[0.06] hover:text-cyan-200">
                <span className="font-medium">🎲 Random Workload</span>
                <span className="text-[10px] text-slate-500">8 randomized cylinders (0–199)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Paradigm Switcher Tab (HDD vs. SSD) ────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3.5 p-1.5 rounded-2xl border border-white/10 bg-[#0d1219]">
        <button
          type="button"
          onClick={() => setParadigm(PARADIGM_HDD)}
          className={`flex items-center gap-3.5 p-3.5 rounded-xl text-left transition-all ${
            paradigm === PARADIGM_HDD
              ? 'bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-transparent border border-cyan-400/40 text-white shadow-[0_0_24px_rgba(34,211,238,0.12)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
          }`}
        >
          <div className={`flex size-11 items-center justify-center rounded-xl shrink-0 transition-colors ${
            paradigm === PARADIGM_HDD
              ? 'bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/40 shadow-[0_0_15px_rgba(34,211,238,0.25)]'
              : 'bg-slate-800/60 text-slate-400'
          }`}>
            <HardDrive className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-100">Mechanical Hard Drive (HDD)</span>
              <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-cyan-300 border border-cyan-400/20">
                Platter Mode
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400 truncate">
              Mechanical seeking, platter geometry, SCAN/SSTF/LOOK algorithms
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setParadigm(PARADIGM_SSD)}
          className={`flex items-center gap-3.5 p-3.5 rounded-xl text-left transition-all ${
            paradigm === PARADIGM_SSD
              ? 'bg-gradient-to-r from-amber-500/15 via-violet-500/10 to-transparent border border-amber-400/40 text-white shadow-[0_0_24px_rgba(251,191,36,0.12)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
          }`}
        >
          <div className={`flex size-11 items-center justify-center rounded-xl shrink-0 transition-colors ${
            paradigm === PARADIGM_SSD
              ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40 shadow-[0_0_15px_rgba(251,191,36,0.25)]'
              : 'bg-slate-800/60 text-slate-400'
          }`}>
            <Zap className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-100">Solid State Drive (NVMe SSD)</span>
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-amber-300 border border-amber-400/20">
                Flash Mode
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400 truncate">
              Parallel NAND channels, zero seek penalty, MT/s bandwidth simulation
            </p>
          </div>
        </button>
      </div>

      {paradigm === PARADIGM_SSD ? (
        <NVMeVisualizer
          initialRequests={parsedRequests.length > 0 ? parsedRequests : [98, 183, 37, 122, 14, 124, 65, 67]}
          initialHead={headNum}
        />
      ) : (
        <>
          {/* ── Mode / Architecture switcher bar ──────────────────────────── */}
          <div className="mb-5 flex flex-wrap gap-3">
        {/* View Mode */}
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#10151d] p-1">
          <span className="px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">Mode</span>
          {[
            { id: MODE_INSTANT,     label: 'Instant Analysis', icon: Zap  },
            { id: MODE_INTERACTIVE, label: 'Interactive Sim',  icon: Play },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setViewMode(id); resetSim(); setSimulationResult(null) }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                viewMode === id ? 'bg-cyan-400 text-[#071014] shadow-[0_0_12px_rgba(103,232,249,0.25)]' : 'text-slate-400 hover:text-slate-200'
              }`}>
              <Icon className="size-3.5" />{label}
            </button>
          ))}
        </div>

        {/* Architecture Mode */}
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#10151d] p-1">
          <span className="px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">Actuator</span>
          {[
            { id: ARCH_SINGLE, label: 'Single Head',        icon: HardDrive },
            { id: ARCH_DUAL,   label: 'Dual Head (MACH.2)', icon: Disc      },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => { setArchMode(id); setSimulationResult(null); resetSim() }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                archMode === id ? 'bg-violet-500 text-white shadow-[0_0_12px_rgba(167,139,250,0.25)]' : 'text-slate-400 hover:text-slate-200'
              }`}>
              <Icon className="size-3.5" />{label}
            </button>
          ))}
        </div>

        {/* ZBR Zone Legend */}
        <div className="ml-auto flex items-center gap-3 rounded-xl border border-white/10 bg-[#10151d] px-4 py-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">ZBR</span>
          {ZONES.map(z => (
            <span key={z.id} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: z.color }}>
              <span className="size-2 rounded-full" style={{ background: z.color }} />
              {z.label}
              <span className="text-slate-600 text-[10px]">{z.sectors}s/trk</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Input Configuration Panel ─────────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-white/[0.08] bg-[#10151d] p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_130px_130px_160px_180px_auto] lg:items-end">
          <label className="flex flex-col gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Track Requests
            <input type="text" value={requestsInput}
              onChange={e => { setRequestsInput(e.target.value); setSimulationResult(null); stopSim() }}
              placeholder="e.g. 98, 183, 37, 122, 14, 124, 65, 67"
              className="h-10 rounded-lg border border-white/10 bg-[#0b0f15] px-3 font-mono text-sm normal-case tracking-normal text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/50" />
          </label>

          <label className="flex flex-col gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Initial Head
            <input type="number" min="0" max={maxCylinder} value={initialHead}
              onChange={e => { setInitialHead(Number(e.target.value) || 0); setSimulationResult(null); stopSim() }}
              className="h-10 rounded-lg border border-white/10 bg-[#0b0f15] px-3 font-mono text-sm normal-case tracking-normal text-slate-200 outline-none focus:border-cyan-300/50" />
          </label>

          <label className="flex flex-col gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Disk Size (Cyl.)
            <input type="number" min="10" max="5000" value={diskSize}
              onChange={e => { setDiskSize(Number(e.target.value) || 200); setSimulationResult(null); stopSim() }}
              className="h-10 rounded-lg border border-white/10 bg-[#0b0f15] px-3 font-mono text-sm normal-case tracking-normal text-slate-200 outline-none focus:border-cyan-300/50" />
          </label>

          <div className="flex flex-col gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Direction
            <div className="flex h-10 items-center rounded-lg border border-white/10 bg-[#0b0f15] p-1">
              {[{ val: 'left', label: 'Left', Icon: ArrowLeft }, { val: 'right', label: 'Right', Icon: ArrowRight }].map(({ val, label, Icon }) => (
                <button key={val} type="button"
                  onClick={() => { setDirection(val); setSimulationResult(null); stopSim() }}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-xs font-semibold normal-case tracking-normal transition-colors ${
                    direction === val ? 'bg-cyan-300 text-[#071014]' : 'text-slate-400 hover:text-slate-200'
                  }`}>
                  <Icon className="size-3" />{label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Algorithm
            <select value={algorithm}
              onChange={e => { setAlgorithm(e.target.value); setSimulationResult(null); stopSim() }}
              className="h-10 rounded-lg border border-white/10 bg-[#0b0f15] px-3 text-sm normal-case tracking-normal text-slate-200 outline-none focus:border-cyan-300/50">
              <option value="FCFS">FCFS</option>
              <option value="SSTF">SSTF</option>
              <option value="SCAN">SCAN (Elevator)</option>
              <option value="C-SCAN">C-SCAN</option>
              <option value="LOOK">LOOK</option>
              <option value="C-LOOK">C-LOOK</option>
            </select>
          </label>

          <div className="flex items-center gap-2">
            {viewMode === MODE_INSTANT ? (
              <>
                <button onClick={handleRun} disabled={parsedRequests.length === 0}
                  className="flex h-10 items-center gap-2 rounded-lg bg-cyan-300 px-5 text-sm font-semibold text-[#071014] shadow-[0_0_24px_rgba(103,232,249,0.15)] transition-all hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">
                  <Play className="size-3.5 fill-current" />Simulate
                </button>
                {simulationResult && (
                  <button onClick={() => setSimulationResult(null)}
                    className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]">
                    <RotateCcw className="size-4" />
                  </button>
                )}
              </>
            ) : (
              <button onClick={loadSim} disabled={parsedRequests.length === 0}
                className="flex h-10 items-center gap-2 rounded-lg bg-violet-500 px-5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(167,139,250,0.2)] transition-all hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40">
                <Play className="size-3.5 fill-current" />Load Sim
              </button>
            )}
          </div>
        </div>

        {/* I/O Queue chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">I/O Queue:</span>
          {parsedRequests.map((r, idx) => {
            const zone = getZoneInfo(r)
            return (
              <span key={`chip-${idx}`}
                className="inline-flex items-center gap-1 rounded border border-white/10 bg-[#0b0f15] px-2 py-0.5 font-mono text-[11px] text-slate-300"
                style={{ borderColor: zone.colorDim + '80' }}>
                <span className="size-1.5 rounded-full" style={{ background: zone.color }} />{r}
              </span>
            )
          })}
          <span className="ml-auto font-mono text-[11px] text-cyan-300/70">
            Head: <b className="text-cyan-200">{initialHead}</b> · Range [0, {maxCylinder}]
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          INTERACTIVE SIMULATION VIEW
      ══════════════════════════════════════════════════════════════════ */}
      {viewMode === MODE_INTERACTIVE && (
        <div className="space-y-4">

          {/* ── Playback Controls ──────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-[#10151d] px-4 py-3">
            <div className="flex items-center gap-2">
              {/* Play / Pause */}
              <button
                onClick={() => { if (simSteps.length > 0) setIsPlaying(p => !p) }}
                disabled={simSteps.length === 0}
                className={`flex size-9 items-center justify-center rounded-lg font-semibold transition-all disabled:opacity-40 ${
                  isPlaying ? 'bg-amber-500 text-white' : 'bg-cyan-400 text-[#071014]'
                }`}>
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
              </button>
              {/* Step Forward */}
              <button onClick={stepForward}
                disabled={simSteps.length === 0 || stepIdx >= simSteps.length - 1}
                className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] disabled:opacity-40">
                <FastForward className="size-4" />
              </button>
              {/* Reset */}
              <button onClick={resetSim}
                className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]">
                <RotateCcw className="size-4" />
              </button>
            </div>

            {/* Speed */}
            <div className="flex items-center gap-1.5 text-xs">
              <Gauge className="size-3.5 text-slate-500" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Speed</span>
              {SPEED_OPTIONS.map(s => (
                <button key={s} onClick={() => setSpeed(s)}
                  className={`rounded px-2.5 py-1 text-[11px] font-bold transition-all ${
                    speed === s ? 'bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/40' : 'text-slate-500 hover:text-slate-200'
                  }`}>{s}x</button>
              ))}
            </div>

            {/* Progress */}
            {simSteps.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="font-mono text-[11px] text-slate-500">Step</span>
                <span className="font-mono text-sm font-bold text-slate-200">{Math.max(0, stepIdx + 1)}</span>
                <span className="font-mono text-[11px] text-slate-600">/ {simSteps.length}</span>
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-cyan-400 transition-all"
                    style={{ width: `${Math.max(0, (stepIdx + 1) / simSteps.length) * 100}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* ── Controller Status Card ──────────────────────────────────── */}
          <div className={`flex flex-wrap items-center gap-5 rounded-xl border px-5 py-3 transition-all ${ctrlState.bg} ${ctrlState.border}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{ctrlState.emoji}</span>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Controller State</p>
                <p className={`font-mono text-sm font-bold ${ctrlState.color}`}>{ctrlState.label}</p>
              </div>
            </div>
            {currentStep && (
              <>
                <div className="border-l border-white/10 pl-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                    {archMode === ARCH_DUAL ? `Arm ${currentStep.arm}` : 'Head'} Position
                  </p>
                  <p className="font-mono text-sm font-bold text-slate-100">Cylinder {currentStep.to}</p>
                </div>
                <div className="border-l border-white/10 pl-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Zone</p>
                  <p className="font-mono text-sm font-bold" style={{ color: getZoneInfo(currentStep.to).color }}>
                    {getZoneInfo(currentStep.to).label}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Serviced</p>
                  <p className="font-mono text-sm font-bold text-slate-200">{servicedCylinders.size} / {allRequestCyls.length}</p>
                </div>
              </>
            )}
            {simSteps.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <HelpCircle className="size-4 text-slate-600" />
                Click <span className="mx-1 font-semibold text-violet-400">Load Sim</span> then <span className="mx-1 font-semibold text-cyan-300">Play</span>
              </div>
            )}
          </div>

          {/* ── Main Grid: Platter + Right Panel ───────────────────────── */}
          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">

            {/* Platter Visualizer */}
            <section className="rounded-xl border border-white/[0.08] bg-[#10151d] p-5">
              <div className="mb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">Platter Visualizer</p>
                <h3 className="mt-0.5 text-sm font-semibold text-slate-100">
                  Concentric ZBR Rings · {archMode === ARCH_DUAL ? 'Dual-Arm MACH.2' : 'Single Actuator'}
                </h3>
              </div>
              <PlatterVisualizer
                currentStep={currentStep}
                allCylinders={allRequestCyls}
                servicedCylinders={servicedCylinders}
                activeTarget={activeTarget}
                initialHead={headNum}
                archMode={archMode}
                dualSchedule={archMode === ARCH_DUAL && allRequestCyls.length > 0
                  ? calculateDualHeadSchedule(allRequestCyls, headNum, algorithm)
                  : null}
              />
            </section>

            {/* Right panel */}
            <div className="space-y-4">
              {/* Dynamic Queue Stream */}
              <div className="rounded-xl border border-white/[0.08] bg-[#10151d] p-4">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-violet-300/70">Dynamic Queue Stream</p>
                <p className="mb-3 text-[11px] text-slate-500">Inject new I/O requests mid-simulation.</p>
                <div className="flex gap-2">
                  <input type="number" min="0" max={maxCylinder}
                    value={liveInput}
                    onChange={e => setLiveInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleInjectRequest()}
                    placeholder={`0–${maxCylinder}`}
                    className="h-9 flex-1 rounded-lg border border-white/10 bg-[#0b0f15] px-3 font-mono text-sm text-slate-200 outline-none placeholder:text-slate-700 focus:border-violet-400/50" />
                  <button onClick={handleInjectRequest}
                    className="flex h-9 items-center gap-1.5 rounded-lg bg-violet-500/80 px-3 text-xs font-semibold text-white hover:bg-violet-400">
                    <Plus className="size-3.5" />Inject
                  </button>
                </div>
                {pendingQueue.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="w-full text-[10px] font-medium uppercase tracking-wider text-slate-600">Injected:</span>
                    {pendingQueue.map((r, i) => (
                      <span key={i}
                        className="inline-flex items-center gap-1 rounded border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] text-violet-300">
                        <ArrowRight className="size-2.5" />{r}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Step Log */}
              <div className="rounded-xl border border-white/[0.08] bg-[#10151d] p-4">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">Step Log</p>
                <div className="max-h-[340px] space-y-0.5 overflow-y-auto pr-1">
                  {simSteps.length === 0 ? (
                    <p className="py-6 text-center text-[11px] text-slate-600">Load simulation first.</p>
                  ) : (
                    simSteps.map((s, i) => {
                      const isActive   = i === stepIdx
                      const isDone     = i < stepIdx
                      const zone       = getZoneInfo(s.to)
                      return (
                        <button key={i} onClick={() => setStepIdx(i)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-all ${
                            isActive ? 'bg-amber-500/15 ring-1 ring-amber-400/30'
                            : isDone  ? 'bg-emerald-500/5'
                            : 'hover:bg-white/[0.03]'
                          }`}>
                          {isDone
                            ? <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
                            : isActive
                              ? <span className="size-1.5 shrink-0 rounded-full bg-amber-400 animate-pulse" />
                              : <span className="size-1.5 shrink-0 rounded-full bg-slate-600" />}
                          <span className="w-6 shrink-0 font-mono text-[10px] text-slate-600">#{i + 1}</span>
                          <span className={`font-mono ${isActive ? 'text-amber-300' : isDone ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {s.from} → {s.to}
                          </span>
                          <span className="ml-auto font-mono text-[10px]" style={{ color: zone.color }}>{zone.id}</span>
                          {archMode === ARCH_DUAL && (
                            <span className={`ml-1 text-[10px] font-bold ${s.arm === 0 ? 'text-cyan-400' : 'text-violet-400'}`}>A{s.arm}</span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Dual-Head Stats */}
              {archMode === ARCH_DUAL && simSteps.length > 0 && (() => {
                const ds = calculateDualHeadSchedule(allRequestCyls, headNum, algorithm)
                return (
                  <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.05] p-4">
                    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-violet-300/70">MACH.2 Parallel Stats</p>
                    <div className="grid grid-cols-2 gap-3">
                      <StatMini label="Arm 0 Seek" value={`${ds.arm0.totalSeek} cyl`}         color="text-cyan-300"    />
                      <StatMini label="Arm 1 Seek" value={`${ds.arm1.totalSeek} cyl`}         color="text-violet-300"  />
                      <StatMini label="Time Saved" value={`${ds.timeSavedCylinders} cyl`}     color="text-emerald-300" />
                      <StatMini label="Efficiency"  value={`${ds.parallelEfficiency}%`}       color="text-amber-300"   />
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          INSTANT ANALYSIS VIEW
      ══════════════════════════════════════════════════════════════════ */}
      {viewMode === MODE_INSTANT && (
        <>
          {simulationResult ? (
            <div className="space-y-6">

              {/* DUAL result */}
              {simulationResult.type === 'dual' && (() => {
                const ds = simulationResult.dual
                return (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-violet-400/20 bg-violet-500/[0.07] px-5 py-4">
                      <Disc className="size-8 text-violet-400" />
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-violet-300/70">MACH.2 Dual Actuator</p>
                        <p className="text-lg font-bold text-slate-100">Parallel Efficiency: <span className="text-violet-300">{ds.parallelEfficiency}%</span></p>
                      </div>
                      <div className="ml-auto">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">Saved</p>
                        <p className="font-mono text-xl font-bold text-emerald-300">{ds.timeSavedCylinders} <span className="text-sm text-slate-500">cyl</span></p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        { arm: ds.arm0, label: 'Arm 0', color: '#22d3ee', cls: 'border-cyan-400/20 bg-cyan-400/[0.05]' },
                        { arm: ds.arm1, label: 'Arm 1', color: '#a78bfa', cls: 'border-violet-400/20 bg-violet-400/[0.05]' },
                      ].map(({ arm, label, color, cls }) => (
                        <div key={label} className={`rounded-xl border p-5 ${cls}`}>
                          <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color }}>
                            {label} · Cylinders {label === 'Arm 0' ? '0–99' : '100–199'}
                          </p>
                          <p className="font-mono text-2xl font-bold text-slate-100">{arm.totalSeek} <span className="text-sm font-normal text-slate-500">cyl</span></p>
                          <p className="mt-1 text-xs text-slate-500">{arm.requests.length} requests · Head: {arm.head}</p>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {arm.sequence.map((c, i) => (
                              <span key={i} className="rounded border border-white/[0.08] bg-[#0b0f15] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{c}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <section className="rounded-xl border border-white/[0.08] bg-[#10151d] p-5">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">Combined Interleaved Steps</p>
                      <h3 className="mb-4 text-sm font-semibold text-slate-100">MACH.2 Execution Trace</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px] text-left text-xs">
                          <thead>
                            <tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.14em] text-slate-600">
                              <th className="pb-3 font-medium">Tick</th>
                              <th className="pb-3 font-medium">Arm</th>
                              <th className="pb-3 font-medium">From</th>
                              <th className="pb-3 font-medium">To</th>
                              <th className="pb-3 font-medium">Zone</th>
                              <th className="pb-3 text-right font-medium">Distance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ds.combinedSteps.map(s => (
                              <tr key={s.tick} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                                <td className="py-2 font-mono text-slate-500">#{s.tick}</td>
                                <td className="py-2 font-mono font-bold" style={{ color: s.arm === 0 ? '#22d3ee' : '#a78bfa' }}>A{s.arm}</td>
                                <td className="py-2 font-mono text-slate-400">{s.from}</td>
                                <td className="py-2 font-mono font-semibold text-slate-100">{s.to}</td>
                                <td className="py-2 font-mono text-[10px]" style={{ color: s.zone.color }}>{s.zone.label}</td>
                                <td className="py-2 text-right font-mono font-semibold text-emerald-400">+{s.distance}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                )
              })()}

              {/* SINGLE result */}
              {simulationResult.type === 'single' && (
                <>
                  <section className="rounded-xl border border-white/[0.08] bg-[#10151d] p-5 shadow-xl">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">Visual Seek Trajectory</p>
                        <h3 className="mt-0.5 text-sm font-semibold text-slate-100">
                          Head Movement Chart ({algorithm} · {direction.toUpperCase()})
                        </h3>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-xs text-slate-400">
                        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-cyan-400" />Start: {initialHead}</span>
                        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-400" />End: {seekSequence[seekSequence.length - 1]}</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-[#0b0f15] p-4">
                      <div className="min-w-[720px]">
                        <div className="mb-3 flex justify-between border-b border-white/10 pb-1 font-mono text-[11px] text-slate-500">
                          {[0, 0.25, 0.5, 0.75, 1].map(q => <span key={q}>Track {Math.floor(maxCylinder * q)}</span>)}
                        </div>
                        {(() => {
                          const W = 860, rowH = 36, padX = 40, usable = W - padX * 2
                          const H = Math.max(180, seekSequence.length * rowH + 30)
                          const getX = t => padX + Math.max(0, Math.min(1, t / maxCylinder)) * usable
                          const pts = seekSequence.map((t, i) => ({ x: getX(t), y: 25 + i * rowH, t }))
                          return (
                            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
                              <defs>
                                <linearGradient id="pathGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
                                  <stop offset="100%" stopColor="#34d399" stopOpacity="0.8" />
                                </linearGradient>
                              </defs>
                              {/* Zone bands */}
                              {ZONES.map(z => (
                                <rect key={z.id} x={getX(z.min)} y={0} width={getX(z.max) - getX(z.min)} height={H}
                                  fill={z.color} fillOpacity="0.04" />
                              ))}
                              {/* Grid */}
                              {[0, 0.25, 0.5, 0.75, 1].map(q => (
                                <line key={q} x1={padX + q * usable} y1={10} x2={padX + q * usable} y2={H - 10}
                                  stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                              ))}
                              {/* Lines */}
                              {pts.slice(0, pts.length - 1).map((p, i) => (
                                <g key={i}>
                                  <line x1={p.x} y1={p.y} x2={pts[i+1].x} y2={pts[i+1].y}
                                    stroke="url(#pathGrad)" strokeWidth="2.5" strokeLinecap="round" />
                                  <circle cx={(p.x + pts[i+1].x) / 2} cy={(p.y + pts[i+1].y) / 2}
                                    r="3" fill="#67e8f9" opacity="0.5" />
                                </g>
                              ))}
                              {/* Points */}
                              {pts.map((p, i) => {
                                const isS = i === 0, isE = i === pts.length - 1
                                const zone = getZoneInfo(p.t)
                                return (
                                  <g key={i}>
                                    <circle cx={p.x} cy={p.y} r={isS || isE ? 6.5 : 4.5}
                                      fill={isS ? '#22d3ee' : isE ? '#34d399' : '#0b0f15'}
                                      stroke={isS ? '#22d3ee' : isE ? '#34d399' : zone.color}
                                      strokeWidth="2" />
                                    <text x={p.x} y={p.y - 10} textAnchor="middle"
                                      fill="#cbd5e1" fontSize="10" fontFamily="monospace">{p.t}</text>
                                    <text x={15} y={p.y + 4} textAnchor="middle"
                                      fill="#475569" fontSize="9" fontFamily="monospace">#{i}</text>
                                  </g>
                                )
                              })}
                            </svg>
                          )
                        })()}
                      </div>
                    </div>
                  </section>

                  <div className="grid gap-4 md:grid-cols-3">
                    <MetricCard icon={Gauge}    label="Total Head Movement" value={`${totalSeekCount} cyl`}    subtext="Cumulative seek distance"           accent="cyan"    />
                    <MetricCard icon={Activity} label="Average Seek Length"  value={`${avgSeekCount} cyl`}     subtext={`Across ${steps.length} movements`} accent="indigo"  />
                    <MetricCard icon={Layers}   label="Requests Serviced"    value={parsedRequests.length}     subtext={`Head at cylinder ${initialHead}`}  accent="emerald" />
                  </div>

                  <section className="rounded-xl border border-white/[0.08] bg-[#10151d] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">Execution Trace</p>
                        <h3 className="mt-0.5 text-sm font-semibold text-slate-100">Step-by-Step Movement Log</h3>
                      </div>
                      <span className="font-mono text-xs text-slate-400">{steps.length} movements</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[550px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.14em] text-slate-600">
                            <th className="pb-3 font-medium">Step</th>
                            <th className="pb-3 font-medium">From</th>
                            <th className="pb-3 font-medium">To</th>
                            <th className="pb-3 font-medium">Zone</th>
                            <th className="pb-3 font-medium">Dir</th>
                            <th className="pb-3 text-right font-medium">Distance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {steps.map(st => {
                            const zone = getZoneInfo(st.to)
                            return (
                              <tr key={st.step} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                                <td className="py-3 font-mono font-medium text-cyan-200">#{st.step}</td>
                                <td className="py-3 font-mono text-slate-400">{st.from}</td>
                                <td className="py-3 font-mono font-semibold text-slate-100">{st.to}</td>
                                <td className="py-3 font-mono text-[10px]" style={{ color: zone.color }}>{zone.label}</td>
                                <td className="py-3">
                                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] ${
                                    st.to >= st.from ? 'bg-cyan-400/10 text-cyan-300' : 'bg-indigo-400/10 text-indigo-300'
                                  }`}>
                                    {st.to >= st.from ? <ArrowRight className="size-3" /> : <ArrowLeft className="size-3" />}
                                    {st.to >= st.from ? '→' : '←'}
                                  </span>
                                </td>
                                <td className="py-3 text-right font-mono font-semibold text-emerald-400">+{st.distance}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </div>
          ) : (
            <section className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-[#10151d]/60 p-16 text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                <HardDrive className="size-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">No Active Disk Simulation</h3>
              <p className="mt-1 max-w-md text-xs text-slate-500">
                Configure requests and algorithm, then click <span className="font-medium text-cyan-300">'Simulate'</span>.
              </p>
            </section>
          )}
        </>
      )}
        </>
      )}

      {/* Footer */}
      <footer className="mt-8 flex items-center justify-between border-t border-white/[0.06] pt-5 text-[10px] uppercase tracking-[0.12em] text-slate-600">
        <span>KernelLab Storage Subsystem · ZBR + MACH.2 Engine · NVMe 8-Channel Flash Controller</span>
        <span>FCFS · SSTF · SCAN · C-SCAN · LOOK · C-LOOK · NVMe 2.0</span>
      </footer>
    </div>
  )
}

// ─── PlatterVisualizer ───────────────────────────────────────────────────────
/**
 * Renders a top-down concentric disk platter with:
 * - 3 ZBR zone rings (Outer/Middle/Inner)
 * - Request dots coloured by zone, placed at their exact track radius
 * - Active target dot highlighted with a pulsing yellow ring
 * - Completed dots shown in green
 * - Actuator arm(s) whose tip uses the SAME getCylinderRadius() formula
 */
function PlatterVisualizer({
  currentStep,
  allCylinders,
  servicedCylinders,
  activeTarget,
  initialHead,
  archMode,
  dualSchedule,
}) {
  const CX = PLATTER_CX
  const CY = PLATTER_CY

  // Zone boundary radii (for rendering rings) using the shared formula
  const outerRingR  = getCylinderRadius(0)    // cylinder 0 → outermost
  const middleRingR = getCylinderRadius(66)   // boundary between Outer and Middle
  const innerRingR  = getCylinderRadius(133)  // boundary between Middle and Inner
  const hubR        = PLATTER_HUB_R

  // ── Spread request dots evenly around the platter, each at its own track radius ──
  // We assign angles evenly so they don't overlap (order by cylinder for clarity)
  const sorted     = [...allCylinders].map((c, i) => ({ c, origIdx: i }))
  const angleStep  = (2 * Math.PI) / Math.max(sorted.length, 1)

  const requestDots = allCylinders.map((cyl, i) => {
    const angle  = -Math.PI / 2 + i * angleStep   // start at 12 o'clock
    const radius = getCylinderRadius(cyl)
    return {
      cyl,
      x: CX + Math.cos(angle) * radius,
      y: CY + Math.sin(angle) * radius,
      zone: getZoneInfo(cyl),
      isActive:    cyl === activeTarget,
      isServiced:  servicedCylinders.has(cyl),
    }
  })

  // ── Arm drawing ────────────────────────────────────────────────────────
  // The arm pivots at the hub centre and sweeps to the track radius.
  // We use a fixed angle (right-hand side horizontal, pointing inward)
  // and vary only the tip radius via getCylinderRadius.
  // Single arm sweeps a 180° arc at the bottom half.
  const ARM_ANGLE_START = Math.PI * 1.1   // left side ~198°
  const ARM_ANGLE_END   = Math.PI * 1.9   // right side ~342°

  function cylToArmAngle(cyl) {
    const norm = Math.max(0, Math.min(199, cyl)) / 199
    return ARM_ANGLE_START + norm * (ARM_ANGLE_END - ARM_ANGLE_START)
  }

  function renderArm(cyl, color, label) {
    const angle  = cylToArmAngle(cyl)
    const radius = getCylinderRadius(cyl)       // ← identical formula to dots
    const tipX   = CX + Math.cos(angle) * radius
    const tipY   = CY + Math.sin(angle) * radius
    return (
      <g key={label}>
        {/* Arm shaft */}
        <line x1={CX} y1={CY} x2={tipX} y2={tipY}
          stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
        {/* R/W head outer ring */}
        <circle cx={tipX} cy={tipY} r="8" fill={color} opacity="0.15" />
        {/* R/W head solid dot */}
        <circle cx={tipX} cy={tipY} r="5" fill={color} opacity="0.9" />
        <circle cx={tipX} cy={tipY} r="2.5" fill="#0b0f15" />
        {/* Label */}
        <text x={tipX + 11} y={tipY + 4} fill={color} fontSize="9" fontFamily="monospace" fontWeight="700">
          {label} {cyl}
        </text>
      </g>
    )
  }

  // Which cylinder is each arm at?
  const arm0Cyl = currentStep?.arm === 0
    ? currentStep.to
    : (dualSchedule?.arm0?.head ?? initialHead)
  const arm1Cyl = currentStep?.arm === 1
    ? currentStep.to
    : (dualSchedule?.arm1?.head ?? Math.min(199, Math.max(100, initialHead)))
  const singleCyl = currentStep ? currentStep.to : initialHead

  return (
    <div className="flex justify-center">
      <svg width="420" height="420" viewBox="0 0 400 400" className="overflow-visible">
        <defs>
          <radialGradient id="pg-platter" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1e2535" />
            <stop offset="80%" stopColor="#141924" />
            <stop offset="100%" stopColor="#0d1117" />
          </radialGradient>
          <filter id="pg-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="pg-glow-strong" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Outer shadow halo */}
        <circle cx={CX} cy={CY} r={outerRingR + 10} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="14" />

        {/* Platter base */}
        <circle cx={CX} cy={CY} r={outerRingR} fill="url(#pg-platter)" />

        {/* Zone fill bands */}
        <circle cx={CX} cy={CY} r={outerRingR}  fill={ZONES[0].color} fillOpacity="0.04" />
        <circle cx={CX} cy={CY} r={middleRingR} fill={ZONES[1].color} fillOpacity="0.06" />
        <circle cx={CX} cy={CY} r={innerRingR}  fill={ZONES[2].color} fillOpacity="0.08" />
        <circle cx={CX} cy={CY} r={hubR + 6}    fill="#0b0f15" />  {/* clear inner core */}

        {/* Zone boundary rings */}
        <circle cx={CX} cy={CY} r={outerRingR}  fill="none" stroke={ZONES[0].color} strokeWidth="1.5" opacity="0.5" />
        <circle cx={CX} cy={CY} r={middleRingR} fill="none" stroke={ZONES[1].color} strokeWidth="1.5" opacity="0.5" />
        <circle cx={CX} cy={CY} r={innerRingR}  fill="none" stroke={ZONES[2].color} strokeWidth="1.5" opacity="0.5" />

        {/* Decorative track circles */}
        {Array.from({ length: 10 }).map((_, i) => {
          const r = innerRingR + ((outerRingR - innerRingR) / 11) * (i + 1)
          return <circle key={i} cx={CX} cy={CY} r={r} fill="none" stroke="rgba(255,255,255,0.015)" strokeWidth="1" />
        })}

        {/* Zone labels */}
        {[
          { zone: ZONES[0], r: (outerRingR + middleRingR) / 2 },
          { zone: ZONES[1], r: (middleRingR + innerRingR) / 2 },
          { zone: ZONES[2], r: (innerRingR + hubR + 6) / 2   },
        ].map(({ zone, r }) => (
          <text key={zone.id}
            x={CX + Math.cos(-0.9) * r} y={CY + Math.sin(-0.9) * r + 4}
            fill={zone.color} fontSize="8" fontFamily="monospace" textAnchor="middle" opacity="0.6">
            {zone.id}
          </text>
        ))}

        {/* ── Request dots ── */}
        {requestDots.map((d, i) => {
          if (d.isActive) {
            // Active target: pulsing yellow ring
            return (
              <g key={i} filter="url(#pg-glow-strong)">
                <circle cx={d.x} cy={d.y} r="12" fill="#fbbf24" fillOpacity="0.15">
                  <animate attributeName="r" values="9;14;9" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="fill-opacity" values="0.15;0.05;0.15" dur="1s" repeatCount="indefinite" />
                </circle>
                <circle cx={d.x} cy={d.y} r="5.5" fill="#fbbf24" opacity="0.95" />
                <circle cx={d.x} cy={d.y} r="2.5" fill="#0b0f15" />
                <text x={d.x} y={d.y - 12} textAnchor="middle" fill="#fbbf24" fontSize="9" fontFamily="monospace" fontWeight="700">
                  ▶ {d.cyl}
                </text>
              </g>
            )
          }
          if (d.isServiced) {
            // Serviced: solid green
            return (
              <g key={i} filter="url(#pg-glow)">
                <circle cx={d.x} cy={d.y} r="5" fill="#34d399" opacity="0.9" />
                <circle cx={d.x} cy={d.y} r="2" fill="#0b0f15" />
                <text x={d.x} y={d.y - 9} textAnchor="middle" fill="#34d399" fontSize="7.5" fontFamily="monospace" opacity="0.8">
                  {d.cyl}
                </text>
              </g>
            )
          }
          // Pending: blue
          return (
            <g key={i} filter="url(#pg-glow)">
              <circle cx={d.x} cy={d.y} r="4.5" fill="#60a5fa" opacity="0.75" />
              <circle cx={d.x} cy={d.y} r="1.8" fill="#0b0f15" />
              <text x={d.x} y={d.y - 8} textAnchor="middle" fill="#93c5fd" fontSize="7.5" fontFamily="monospace" opacity="0.8">
                {d.cyl}
              </text>
            </g>
          )
        })}

        {/* ── Actuator arm(s) ── */}
        {archMode === ARCH_DUAL
          ? <>{renderArm(arm0Cyl, '#22d3ee', 'A0')}{renderArm(arm1Cyl, '#a78bfa', 'A1')}</>
          : renderArm(singleCyl, '#22d3ee', 'HD')}

        {/* ── Hub spindle ── */}
        <circle cx={CX} cy={CY} r={hubR} fill="#0b0f15" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
        <circle cx={CX} cy={CY} r={hubR - 7} fill="#141924" />
        <circle cx={CX} cy={CY} r="5.5" fill="#22d3ee" opacity="0.55" filter="url(#pg-glow)" />

        {/* Data-transfer pulse on hub */}
        {currentStep && (
          <circle cx={CX} cy={CY} r={hubR + 3} fill="none" stroke="#34d399" strokeWidth="1.5" opacity="0.4">
            <animate attributeName="r" values={`${hubR};${hubR + 8};${hubR}`} dur="1.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="1.2s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>

      {/* Legend */}
      <div className="ml-4 flex flex-col justify-center gap-3 text-[11px]">
        <span className="flex items-center gap-2"><span className="inline-block size-3 rounded-full bg-yellow-400" />Active Target</span>
        <span className="flex items-center gap-2"><span className="inline-block size-3 rounded-full bg-blue-400" />Pending</span>
        <span className="flex items-center gap-2"><span className="inline-block size-3 rounded-full bg-emerald-400" />Serviced</span>
        <div className="mt-2 border-t border-white/[0.06] pt-2 space-y-1.5">
          {ZONES.map(z => (
            <span key={z.id} className="flex items-center gap-2" style={{ color: z.color }}>
              <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: z.color, opacity: 0.6 }} />
              {z.id} · {z.sectors}s/trk
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Helper components ───────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, subtext, accent }) {
  const themes = {
    cyan:    { badge: 'text-cyan-300 bg-cyan-400/10',    bar: 'bg-cyan-300'    },
    indigo:  { badge: 'text-indigo-300 bg-indigo-400/10',bar: 'bg-indigo-400'  },
    emerald: { badge: 'text-emerald-300 bg-emerald-400/10',bar: 'bg-emerald-400'},
  }
  const t = themes[accent] ?? themes.cyan
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#10151d] p-5 shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-slate-100">{value}</p>
          <p className="mt-1 text-[11px] text-slate-500">{subtext}</p>
        </div>
        <div className={`flex size-9 items-center justify-center rounded-lg ${t.badge}`}><Icon className="size-4" /></div>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full w-full rounded-full ${t.bar}`} />
      </div>
    </div>
  )
}

function StatMini({ label, value, color }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600">{label}</p>
      <p className={`mt-1 font-mono text-base font-bold ${color}`}>{value}</p>
    </div>
  )
}
