import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  Clock,
  Cpu,
  FastForward,
  Gauge,
  HardDrive,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'

// ─── Speed Presets ──────────────────────────────────────────────────────────
export const SPEED_PRESETS = [
  {
    id: 'sata',
    name: 'Legacy SATA III SSD',
    interface: 'SATA 6Gbps (AHCI)',
    mts: 550,
    mbps: 600,
    nandLatencyUs: 50,
    busLatencyUs: 6.8,
    channelCount: 4, // Legacy SATA used 4 channels max
    description: 'Legacy AHCI serial protocol with single command queue (QD=32). High protocol overhead.',
    accent: '#94a3b8',
    tag: 'Legacy',
  },
  {
    id: 'pcie3',
    name: 'PCIe Gen 3 NVMe',
    interface: 'PCIe 3.0 x4 (NVMe 1.3)',
    mts: 3000,
    mbps: 3500,
    nandLatencyUs: 35,
    busLatencyUs: 1.17,
    channelCount: 8,
    description: 'Mainstream 8-channel ONFI 3.0 controller architecture with hardware multi-queueing.',
    accent: '#38bdf8',
    tag: 'Gen 3',
  },
  {
    id: 'pcie4',
    name: 'PCIe Gen 4 NVMe',
    interface: 'PCIe 4.0 x4 (NVMe 1.4b)',
    mts: 7000,
    mbps: 7500,
    nandLatencyUs: 28,
    busLatencyUs: 0.55,
    channelCount: 8,
    description: 'High-performance 8-channel flash controller paired with 1600 MT/s 3D TLC NAND dies.',
    accent: '#22d3ee',
    tag: 'Gen 4 (Standard)',
  },
  {
    id: 'pcie5',
    name: 'PCIe Gen 5 Extreme NVMe',
    interface: 'PCIe 5.0 x4 (NVMe 2.0)',
    mts: 12000,
    mbps: 12000,
    nandLatencyUs: 20,
    busLatencyUs: 0.34,
    channelCount: 8,
    description: 'Extreme enthusiast 8-channel architecture with ONFI 5.0 @ 2400 MT/s per flash channel.',
    accent: '#a78bfa',
    tag: 'Gen 5 Extreme',
  },
]

export default function NVMeVisualizer({
  initialRequests = [98, 183, 37, 122, 14, 124, 65, 67],
  initialHead = 53,
  hddSeekTimeMs = 8.5,
  hddRotationalLatencyMs = 4.17,
}) {
  // Speed settings
  const [selectedPresetId, setSelectedPresetId] = useState('pcie4')
  const [mtsSlider, setMtsSlider] = useState(7000)

  // Workload requests state
  const [requests, setRequests] = useState(initialRequests)
  const [injectInput, setInjectInput] = useState('')

  // Simulation playback state
  const [simRound, setSimRound] = useState(-1) // -1 = ready/not started, 0... = round number
  const [isPlaying, setIsPlaying] = useState(false)
  const [simSpeed, setSimSpeed] = useState(1) // 1x, 2x, 5x
  const timerRef = useRef(null)

  // Sync initial requests if parent changes
  useEffect(() => {
    if (initialRequests && initialRequests.length > 0) {
      setRequests(initialRequests)
      setSimRound(-1)
      setIsPlaying(false)
    }
  }, [initialRequests])

  // Select Preset Handler
  const handleSelectPreset = (preset) => {
    setSelectedPresetId(preset.id)
    setMtsSlider(preset.mts)
  }

  // Handle slider change
  const handleSliderChange = (val) => {
    setMtsSlider(val)
    // Check if exactly matches a preset
    const match = SPEED_PRESETS.find((p) => p.mts === val)
    if (match) {
      setSelectedPresetId(match.id)
    } else {
      setSelectedPresetId('custom')
    }
  }

  // Dynamic calculations based on MT/s
  const currentSpeed = useMemo(() => {
    // 1 MT/s roughly corresponds to ~1.05 MB/s on 8-channel ONFI bus
    const calculatedMbps = Math.round(mtsSlider * 1.05)
    // Bus latency per 4KB request in microseconds: (4096 bytes / (calculatedMbps * 1024 * 1024)) * 1e6
    const busLatencyUs = Math.max(0.25, Number((4096 / (calculatedMbps * 1.048576)).toFixed(2)))
    // NAND cell read/program latency in microseconds (scales slightly with newer node speeds)
    const nandLatencyUs = Math.max(18, Math.round(48 - (mtsSlider / 14000) * 26))
    const totalLatencyUs = Number((nandLatencyUs + busLatencyUs).toFixed(2))

    return {
      mts: mtsSlider,
      mbps: calculatedMbps,
      nandLatencyUs,
      busLatencyUs,
      totalLatencyUs,
    }
  }, [mtsSlider])

  // Distribute incoming requests evenly across 8 channels:
  // Request i is assigned to Channel (i % 8)
  const channelsData = useMemo(() => {
    const CHANNELS_COUNT = 8
    const chs = Array.from({ length: CHANNELS_COUNT }, (_, chIdx) => ({
      channelId: chIdx,
      assignedRequests: [],
      activeRequest: null,
      completedRequests: [],
      isTransferring: false,
      loadPercent: 0,
    }))

    requests.forEach((req, originalIndex) => {
      const targetChannel = originalIndex % CHANNELS_COUNT
      const roundIdx = Math.floor(originalIndex / CHANNELS_COUNT)
      chs[targetChannel].assignedRequests.push({
        lba: req,
        originalIndex,
        roundIdx,
      })
    })

    // Calculate simulation states for each channel based on simRound
    const totalRounds = Math.max(1, Math.ceil(requests.length / CHANNELS_COUNT))

    chs.forEach((ch) => {
      ch.assignedRequests.forEach((item) => {
        if (simRound < 0) {
          // not started
          // pending
        } else if (item.roundIdx < simRound) {
          ch.completedRequests.push(item)
        } else if (item.roundIdx === simRound) {
          ch.activeRequest = item
          ch.isTransferring = true
        }
      })
      ch.loadPercent = ch.assignedRequests.length > 0
        ? Math.round((ch.completedRequests.length / ch.assignedRequests.length) * 100)
        : 0
    })

    return {
      channels: chs,
      totalRounds,
    }
  }, [requests, simRound])

  const totalRounds = channelsData.totalRounds
  const isCompleted = simRound >= totalRounds

  // Playback timer
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }

    const intervalMs = Math.round(900 / simSpeed)
    timerRef.current = setInterval(() => {
      setSimRound((prev) => {
        if (prev + 1 >= totalRounds) {
          setIsPlaying(false)
          return totalRounds
        }
        return prev + 1
      })
    }, intervalMs)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPlaying, simSpeed, totalRounds])

  const handlePlayPause = () => {
    if (requests.length === 0) return
    if (simRound >= totalRounds) {
      setSimRound(0)
      setIsPlaying(true)
    } else {
      if (simRound === -1) setSimRound(0)
      setIsPlaying((p) => !p)
    }
  }

  const handleStepForward = () => {
    if (simRound < totalRounds) {
      setSimRound((prev) => Math.min(prev + 1, totalRounds))
    }
  }

  const handleReset = () => {
    setIsPlaying(false)
    setSimRound(-1)
  }

  const handleInject = () => {
    const val = parseInt(injectInput.trim(), 10)
    if (isNaN(val) || val < 0) return
    setRequests((prev) => [...prev, val])
    setInjectInput('')
  }

  // ── Comparative Metrics Calculation ────────────────────────────────────────
  const metrics = useMemo(() => {
    const reqCount = requests.length
    if (reqCount === 0) {
      return {
        hddAvgPerReqMs: 0,
        hddTotalTimeMs: 0,
        ssdPerReqUs: 0,
        ssdTotalTimeUs: 0,
        speedupFactor: 0,
      }
    }

    // Mechanical HDD:
    // Avg Seek: ~8.5 ms (6-9 ms range) + Rotational Latency: ~4.17 ms = ~12.67 ms per sequential request
    const hddPerReqMs = Number((hddSeekTimeMs + hddRotationalLatencyMs).toFixed(2)) // ~12.67 ms
    const hddTotalTimeMs = Number((reqCount * hddPerReqMs).toFixed(2))

    // NVMe SSD:
    // 0 seek penalty + electronic NAND access + bus transfer time
    // Parallel 8 channels process requests concurrently!
    const ssdPerReqUs = currentSpeed.totalLatencyUs // ~30 us
    const roundsNeeded = Math.ceil(reqCount / 8)
    const ssdTotalTimeUs = Number((roundsNeeded * ssdPerReqUs).toFixed(1))

    // Speedup factor = (hddTotalTimeMs * 1000) / ssdTotalTimeUs
    const speedupFactor = ssdTotalTimeUs > 0
      ? Math.round((hddTotalTimeMs * 1000) / ssdTotalTimeUs)
      : 350

    return {
      hddAvgPerReqMs: hddPerReqMs,
      hddTotalTimeMs,
      ssdPerReqUs,
      ssdTotalTimeUs,
      speedupFactor,
      roundsNeeded,
    }
  }, [requests.length, hddSeekTimeMs, hddRotationalLatencyMs, currentSpeed])

  return (
    <div className="space-y-6">

      {/* ── Subtitle and NVMe Architecture Banner ──────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-r from-[#0e1626] via-[#10192a] to-[#0e1626] p-5 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30 shadow-[0_0_24px_rgba(251,191,36,0.2)]">
            <Zap className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-100">8-Channel NVMe Flash Controller Architecture</h3>
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 border border-emerald-400/20">
                0ms Seek Penalty
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Parallel bus multiplexing across 8 NAND dies. Incoming I/O blocks are striped concurrently without physical head positioning.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#090d14] px-3.5 py-2">
            <Cpu className="size-4 text-cyan-300" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">Host Interface</p>
              <p className="font-mono text-xs font-bold text-slate-200">
                {SPEED_PRESETS.find((p) => p.id === selectedPresetId)?.interface ?? 'PCIe High-Speed'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#090d14] px-3.5 py-2">
            <Layers className="size-4 text-violet-300" />
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">Flash Channels</p>
              <p className="font-mono text-xs font-bold text-violet-300">8 Channels Active</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── PART 3: Interactive MT/s & Bus Speed Controls ──────────────── */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#10151d] p-5 shadow-lg">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Gauge className="size-4 text-cyan-300" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Interface & Flash Bus Speed Controller
            </h4>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-500">Active Speed:</span>
            <span className="rounded bg-cyan-400/10 px-2 py-0.5 font-bold text-cyan-300 border border-cyan-400/25">
              {currentSpeed.mts.toLocaleString()} MT/s
            </span>
            <span className="text-slate-500">≈</span>
            <span className="rounded bg-emerald-400/10 px-2 py-0.5 font-bold text-emerald-300 border border-emerald-400/25">
              {currentSpeed.mbps.toLocaleString()} MB/s
            </span>
          </div>
        </div>

        {/* Speed Presets Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
          {SPEED_PRESETS.map((p) => {
            const isSelected = selectedPresetId === p.id
            return (
              <button
                key={p.id}
                onClick={() => handleSelectPreset(p)}
                className={`relative flex flex-col items-start rounded-xl p-3.5 text-left transition-all ${
                  isSelected
                    ? 'border border-cyan-400/50 bg-cyan-400/[0.08] shadow-[0_0_20px_rgba(34,211,238,0.15)] ring-1 ring-cyan-400/30'
                    : 'border border-white/[0.07] bg-[#0b0f15] hover:border-white/20 hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: p.accent }}>
                    {p.tag}
                  </span>
                  {isSelected && <CheckCircle2 className="size-3.5 text-cyan-300" />}
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-100">{p.name}</p>
                <p className="font-mono text-base font-bold text-slate-200 mt-1">
                  {p.mbps.toLocaleString()} <span className="text-xs font-normal text-slate-500">MB/s</span>
                </p>
                <p className="font-mono text-[11px] text-slate-400 mt-0.5">
                  ~{p.mts.toLocaleString()} MT/s · {p.interface.split(' ')[0]}
                </p>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{p.description}</p>
              </button>
            )
          })}
        </div>

        {/* Custom MT/s Slider */}
        <div className="rounded-xl border border-white/[0.06] bg-[#0b0f15] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label htmlFor="mts-slider" className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <Zap className="size-3.5 text-amber-400" />
              Dynamic MT/s Flash Channel Clock Slider
            </label>
            <div className="font-mono text-xs text-slate-400">
              Range: <span className="text-slate-200 font-medium">500 MT/s</span> to <span className="text-slate-200 font-medium">14,000 MT/s</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <input
              id="mts-slider"
              type="range"
              min="500"
              max="14000"
              step="100"
              value={mtsSlider}
              onChange={(e) => handleSliderChange(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-cyan-400 transition-all focus:outline-none"
            />
            <span className="shrink-0 w-24 text-right font-mono text-sm font-bold text-cyan-300">
              {mtsSlider.toLocaleString()} MT/s
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between text-[11px] text-slate-500 border-t border-white/[0.04] pt-2">
            <span>Transfer Latency per 4KB Block: <strong className="font-mono text-slate-300">{currentSpeed.busLatencyUs} µs</strong></span>
            <span>Electronic NAND Die Access: <strong className="font-mono text-slate-300">{currentSpeed.nandLatencyUs} µs</strong></span>
            <span>Combined Read Latency: <strong className="font-mono text-emerald-300 font-bold">{currentSpeed.totalLatencyUs} µs (~0.03 ms)</strong></span>
          </div>
        </div>
      </section>

      {/* ── PART 4: Comparative Latency & Throughput Metrics Card ──────── */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#10151d] p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BarChart2 className="size-4 text-violet-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Mechanical HDD vs. NVMe SSD Performance Comparison
            </h4>
          </div>
          <span className="font-mono text-[11px] text-slate-500">
            Workload: <strong className="text-slate-200">{requests.length} Requests</strong>
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* HDD Estimate Card */}
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-1 w-full bg-cyan-400/40" />
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <HardDrive className="size-4 text-cyan-300" />
                  <span className="text-xs font-bold text-slate-200">Mechanical HDD Estimate</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Spinning platter (7,200 RPM) with physical voice-coil actuator</p>
              </div>
              <span className="rounded bg-cyan-400/10 px-2 py-0.5 font-mono text-[10px] text-cyan-300 border border-cyan-400/20">
                Millisecond Scale (ms)
              </span>
            </div>

            <div className="mt-4 space-y-2 border-y border-white/[0.06] py-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Average Seek Time:</span>
                <span className="font-mono font-medium text-slate-200">~{hddSeekTimeMs} ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Rotational Latency:</span>
                <span className="font-mono font-medium text-slate-200">~{hddRotationalLatencyMs} ms</span>
              </div>
              <div className="flex justify-between font-semibold text-cyan-200 pt-1 border-t border-white/[0.04]">
                <span>Total per Request:</span>
                <span className="font-mono">~{metrics.hddAvgPerReqMs} ms</span>
              </div>
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-xs text-slate-400">Total Workload Completion:</span>
              <div className="text-right">
                <span className="font-mono text-2xl font-bold text-cyan-300">
                  {metrics.hddTotalTimeMs}
                </span>
                <span className="ml-1 text-sm font-semibold text-slate-400">ms</span>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-slate-500 text-right">
              Sequential mechanical delays accumulative
            </p>
          </div>

          {/* NVMe Real Time Card */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-1 w-full bg-amber-400/50" />
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-amber-300" />
                  <span className="text-xs font-bold text-slate-200">NVMe SSD Real Time</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Pure solid-state silicon with 8 parallel flash channels</p>
              </div>
              <span className="rounded bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] text-amber-300 border border-amber-400/20">
                Microsecond Scale (µs)
              </span>
            </div>

            <div className="mt-4 space-y-2 border-y border-white/[0.06] py-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Mechanical Seek Time:</span>
                <span className="font-mono font-medium text-emerald-400">0.00 ms (Zero Penalty)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Electronic NAND Access:</span>
                <span className="font-mono font-medium text-slate-200">~{currentSpeed.nandLatencyUs} µs (~0.03 ms)</span>
              </div>
              <div className="flex justify-between font-semibold text-amber-200 pt-1 border-t border-white/[0.04]">
                <span>Total per Request:</span>
                <span className="font-mono">~{metrics.ssdPerReqUs} µs</span>
              </div>
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-xs text-slate-400">Total Workload Completion:</span>
              <div className="text-right">
                <span className="font-mono text-2xl font-bold text-amber-300">
                  {metrics.ssdTotalTimeUs}
                </span>
                <span className="ml-1 text-sm font-semibold text-slate-400">µs</span>
                <span className="block font-mono text-[11px] text-slate-500">
                  ≈ {(metrics.ssdTotalTimeUs / 1000).toFixed(4)} ms
                </span>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-slate-500 text-right">
              {metrics.roundsNeeded} parallel round(s) across 8 concurrent channels
            </p>
          </div>
        </div>

        {/* Real-World Speedup Factor Callout Banner */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-5 py-4 shadow-[0_0_30px_rgba(52,211,153,0.1)]">
          <div className="flex items-center gap-3.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/40">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/80">Real-World Speedup Factor</p>
              <h5 className="text-base font-bold text-slate-100">
                NVMe SSD processed this workload <span className="text-emerald-300">{metrics.speedupFactor}x faster</span> with 0 mechanical wear.
              </h5>
            </div>
          </div>

          <div className="flex items-center gap-6 font-mono text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Parallel Concurrency</span>
              <span className="font-bold text-cyan-300">8 Channels (8x)</span>
            </div>
            <div className="border-l border-white/10 pl-4">
              <span className="text-slate-500 block text-[10px] uppercase">Mechanical Friction</span>
              <span className="font-bold text-emerald-300">0 RPM / Solid State</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── PART 2: NVMe 8-Channel Flash Visualizer Component ────────── */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#10151d] p-5 shadow-xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">Silicon Controller Visualizer</p>
            <h3 className="text-sm font-semibold text-slate-100">
              8-Channel Parallel Flash Controller & Bus Matrix
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Watch incoming I/O requests stripe across Channels 0 through 7 in parallel without head movement.
            </p>
          </div>

          {/* Interactive Playback Controls */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#090d14] px-3.5 py-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayPause}
                disabled={requests.length === 0}
                className={`flex size-8 items-center justify-center rounded-lg font-semibold transition-all disabled:opacity-40 ${
                  isPlaying ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-cyan-400 text-[#071014] shadow-[0_0_15px_rgba(103,232,249,0.3)]'
                }`}
                title={isPlaying ? 'Pause' : 'Play Parallel Dispatch'}
              >
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 fill-current" />}
              </button>

              <button
                onClick={handleStepForward}
                disabled={requests.length === 0 || isCompleted}
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] disabled:opacity-40"
                title="Step Forward Round"
              >
                <FastForward className="size-4" />
              </button>

              <button
                onClick={handleReset}
                className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
                title="Reset Simulation"
              >
                <RotateCcw className="size-4" />
              </button>
            </div>

            {/* Speed Options */}
            <div className="flex items-center gap-1 border-l border-white/10 pl-3">
              {[1, 2, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setSimSpeed(s)}
                  className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold transition-all ${
                    simSpeed === s
                      ? 'bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/40'
                      : 'text-slate-500 hover:text-slate-200'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Round Status */}
            <div className="border-l border-white/10 pl-3 font-mono text-xs text-slate-400">
              Round: <span className="font-bold text-slate-100">{simRound < 0 ? 0 : Math.min(simRound + 1, totalRounds)}</span> / {totalRounds}
            </div>
          </div>
        </div>

        {/* Controller Chip (Top Hub) */}
        <div className="relative mx-auto mb-6 max-w-xl rounded-2xl border border-cyan-400/30 bg-gradient-to-b from-[#131d2e] to-[#0c1420] p-4 text-center shadow-[0_0_30px_rgba(34,211,238,0.08)]">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-cyan-300">
                FTL Arbiter & Multiplexer
              </span>
            </div>
            <div className="font-mono text-[10px] text-slate-400">
              Striping: <strong className="text-slate-200">Req[i] → CH(i % 8)</strong>
            </div>
          </div>

          <div className="py-3">
            <h5 className="font-mono text-sm font-bold text-slate-100 tracking-wide">
              NVMe Flash Translation Layer (FTL) Multi-Queue Engine
            </h5>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Zero Mechanical Seek · Instant Round-Robin Bus Dispatch · 64K Hardware Command Queues
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/[0.06] pt-2.5 font-mono text-[11px]">
            <span className="text-slate-500">Incoming Queue:</span>
            {requests.map((r, idx) => {
              const targetCh = idx % 8
              const isAssignedCurrent = simRound >= 0 && Math.floor(idx / 8) === simRound
              const isPast = simRound >= 0 && Math.floor(idx / 8) < simRound

              return (
                <span
                  key={idx}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 transition-all ${
                    isAssignedCurrent
                      ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40 font-bold animate-pulse'
                      : isPast
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-white/[0.04] text-slate-300 border border-white/10'
                  }`}
                >
                  <span className="text-[9px] text-slate-500">#{idx}</span>
                  <strong>{r}</strong>
                  <span className="text-[9px] text-cyan-400">→ CH{targetCh}</span>
                </span>
              )
            })}
          </div>
        </div>

        {/* Animated Electrical Bus Traces (SVG) */}
        <div className="relative mb-6 hidden lg:block overflow-hidden rounded-xl border border-white/[0.04] bg-[#090d14]/80 p-2">
          <svg viewBox="0 0 1000 70" className="h-16 w-full">
            <defs>
              <linearGradient id="busGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Central Controller node */}
            <circle cx="500" cy="10" r="6" fill="#22d3ee" className="animate-pulse" />
            <text x="500" y="24" textAnchor="middle" fill="#67e8f9" fontSize="9" fontFamily="monospace">
              FTL BUS ROOT
            </text>

            {/* 8 Channel Bus Traces radiating down */}
            {Array.from({ length: 8 }).map((_, i) => {
              const targetX = 62.5 + i * 125
              const isActive = channelsData.channels[i].isTransferring
              return (
                <g key={i}>
                  {/* Bus trace path */}
                  <path
                    d={`M 500 10 C 500 35, ${targetX} 35, ${targetX} 60`}
                    fill="none"
                    stroke={isActive ? '#38bdf8' : 'rgba(255,255,255,0.08)'}
                    strokeWidth={isActive ? '2.5' : '1.5'}
                    strokeDasharray={isActive ? '6 4' : 'none'}
                    className={isActive ? 'animate-electrical-bus' : ''}
                  />

                  {/* Electrical packet dot if active */}
                  {isActive && (
                    <circle cx={targetX} cy="60" r="4" fill="#fbbf24" className="animate-pulse">
                      <animate
                        attributeName="r"
                        values="3;5;3"
                        dur="0.8s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* 8-Channel NAND Flash Grid (Channels 0 to 7) */}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
          {channelsData.channels.map((ch) => {
            const hasActive = ch.isTransferring && ch.activeRequest
            const hasCompleted = ch.completedRequests.length > 0

            return (
              <div
                key={ch.channelId}
                className={`relative flex flex-col justify-between rounded-xl p-3.5 transition-all ${
                  hasActive
                    ? 'border border-amber-400/50 bg-amber-950/20 shadow-[0_0_20px_rgba(251,191,36,0.15)] ring-1 ring-amber-400/30'
                    : hasCompleted
                      ? 'border border-emerald-500/30 bg-[#0c141d]'
                      : 'border border-white/[0.07] bg-[#0b0f15]'
                }`}
              >
                {/* Channel Header */}
                <div>
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <span className="font-mono text-xs font-bold text-slate-200">
                      CH {ch.channelId}
                    </span>
                    <span
                      className={`size-2 rounded-full ${
                        hasActive
                          ? 'bg-amber-400 animate-ping'
                          : hasCompleted
                            ? 'bg-emerald-400'
                            : 'bg-slate-600'
                      }`}
                    />
                  </div>

                  <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-slate-500">
                    Bus 0x0{ch.channelId}
                  </p>

                  {/* NAND Die Stack Representation */}
                  <div className="mt-2.5 rounded-lg border border-white/[0.05] bg-[#070a0e] p-2 space-y-1">
                    <div className="flex justify-between font-mono text-[9px] text-slate-400">
                      <span>3D NAND</span>
                      <span className="text-cyan-400">128-Layer</span>
                    </div>

                    {/* Visual Cell Grid */}
                    <div className="grid grid-cols-4 gap-1 py-1">
                      {Array.from({ length: 8 }).map((_, cellIdx) => (
                        <div
                          key={cellIdx}
                          className={`h-2 rounded-sm transition-colors ${
                            hasActive
                              ? 'bg-amber-400/70 animate-pulse'
                              : hasCompleted
                                ? 'bg-emerald-500/60'
                                : 'bg-slate-800'
                          }`}
                        />
                      ))}
                    </div>

                    <div className="flex justify-between font-mono text-[8px] text-slate-500">
                      <span>Die 0</span>
                      <span>Die 1</span>
                    </div>
                  </div>

                  {/* Assigned Request Blocks */}
                  <div className="mt-3">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500 block mb-1">
                      Mapped Blocks:
                    </span>
                    <div className="flex flex-wrap gap-1 min-h-[32px]">
                      {ch.assignedRequests.length === 0 ? (
                        <span className="font-mono text-[10px] text-slate-600">None</span>
                      ) : (
                        ch.assignedRequests.map((item, idx) => {
                          const isCur = ch.activeRequest?.lba === item.lba && ch.activeRequest?.roundIdx === item.roundIdx
                          const isDone = item.roundIdx < simRound

                          return (
                            <span
                              key={idx}
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                                isCur
                                  ? 'bg-amber-400/20 text-amber-300 font-bold ring-1 ring-amber-400/50 animate-pulse'
                                  : isDone
                                    ? 'bg-emerald-500/15 text-emerald-400 font-medium'
                                    : 'bg-white/[0.04] text-slate-400'
                              }`}
                            >
                              LBA {item.lba}
                            </span>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Channel Status Bottom */}
                <div className="mt-4 border-t border-white/[0.06] pt-2">
                  <div className="flex items-center justify-between font-mono text-[9px]">
                    <span className="text-slate-500">Status:</span>
                    <span
                      className={`font-semibold ${
                        hasActive
                          ? 'text-amber-300'
                          : hasCompleted
                            ? 'text-emerald-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {hasActive ? 'TRANSFERRING' : hasCompleted ? 'READY' : 'IDLE'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Dynamic Block Injector */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="size-3.5 text-cyan-300" />
            <span>Simulate Real-time LBA Block Ingestion:</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="10000"
              value={injectInput}
              onChange={(e) => setInjectInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInject()}
              placeholder="e.g. 256"
              className="h-8 w-28 rounded-lg border border-white/10 bg-[#090d14] px-2.5 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-700 focus:border-cyan-300/50"
            />
            <button
              onClick={handleInject}
              className="flex h-8 items-center gap-1 rounded-lg bg-cyan-400/20 px-3 text-xs font-semibold text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/30"
            >
              <Plus className="size-3" />
              Enqueue LBA
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
