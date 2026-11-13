import { useState, useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  HelpCircle,
  Info,
  Layers,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'
import {
  calculateNeedMatrix,
  generateBankersSteps,
  validateSystemState,
  detectCircularWait,
  evaluateCoffmanConditions,
  applyPreventionStrategy,
  generateRandomBankerPreset,
} from '../utils/bankersEngine'
import RAGVisualizer from './RAGVisualizer'
import CoffmanConditionsPanel from './CoffmanConditionsPanel'

export default function DeadlockAvoidance() {
  // System State Data: Empty process table by default
  const [resourceNames, setResourceNames] = useState(['A', 'B', 'C'])
  const [available, setAvailable] = useState([3, 3, 2])
  const [allocation, setAllocation] = useState([]) // Starts EMPTY
  const [max, setMax] = useState([])               // Starts EMPTY

  // Prevention Toggles for Coffman Conditions
  const [preventionSettings, setPreventionSettings] = useState({
    allowPreemption: false,
    forceAllAtOnce: false,
    allowSharing: false,
    resourceOrdering: false,
  })

  // Evaluation Output State (strictly triggered on "Run")
  const [isEvaluated, setIsEvaluated] = useState(false)
  const [evaluation, setEvaluation] = useState(null)
  const [isEvaluating, setIsEvaluating] = useState(false)

  // Live Auto-computed Need Matrix for Manual Entry Table
  const currentNeedMatrix = useMemo(() => {
    return calculateNeedMatrix(max, allocation)
  }, [max, allocation])

  // Live validation of current input table
  const validation = useMemo(() => {
    if (allocation.length === 0) return { isValid: true }
    return validateSystemState(available, max, allocation)
  }, [available, max, allocation])

  // Core Evaluation Handler (Single-Click Model)
  const runEvaluation = (customAlloc = allocation, customMax = max, customAvail = available, customPrevention = preventionSettings) => {
    if (customAlloc.length === 0) {
      setEvaluation(null)
      return
    }

    const val = validateSystemState(customAvail, customMax, customAlloc)
    if (!val.isValid) {
      setEvaluation({
        isValid: false,
        error: val.error,
      })
      return
    }

    // Apply active prevention strategy if toggled
    const preventionResult = applyPreventionStrategy(customAvail, customMax, customAlloc, customPrevention)
    const effAvail = customPrevention.allowPreemption || customPrevention.forceAllAtOnce
      ? preventionResult.available
      : customAvail
    const effAlloc = customPrevention.allowPreemption || customPrevention.forceAllAtOnce
      ? preventionResult.allocation
      : customAlloc

    const effNeed = calculateNeedMatrix(customMax, effAlloc)
    const simResult = generateBankersSteps(effAvail, customMax, effAlloc)
    const lastStep = simResult.steps[simResult.steps.length - 1]
    const finishVec = lastStep?.finishVector || []

    const circularWait = detectCircularWait(effAvail, customMax, effAlloc, finishVec)
    const coffman = evaluateCoffmanConditions(
      effAvail,
      customMax,
      effAlloc,
      simResult.isSafe,
      circularWait,
      customPrevention
    )

    setEvaluation({
      isValid: true,
      simulation: simResult,
      effectiveAvailable: effAvail,
      effectiveAllocation: effAlloc,
      effectiveNeed: effNeed,
      circularWaitInfo: circularWait,
      coffmanData: coffman,
      preventionLog: preventionResult.log,
      timestamp: Date.now(),
    })
  }

  // Handle "Run / Evaluate" button click
  const handleRun = () => {
    if (allocation.length === 0 || !validation.isValid) return
    setIsEvaluating(true)
    setTimeout(() => {
      runEvaluation()
      setIsEvaluated(true)
      setIsEvaluating(false)
    }, 120)
  }

  // Handle "Random Preset" generation (populates inputs, waits for Run click)
  const handleRandomPreset = () => {
    const preset = generateRandomBankerPreset(3)
    setResourceNames([...preset.resources])
    setAvailable([...preset.available])
    setAllocation(preset.allocation.map((r) => [...r]))
    setMax(preset.max.map((r) => [...r]))
    setPreventionSettings({
      allowPreemption: false,
      forceAllAtOnce: false,
      allowSharing: false,
      resourceOrdering: false,
    })
    setIsEvaluated(false)
    setEvaluation(null)
  }

  // Handle "Clear All"
  const handleClearAll = () => {
    setAllocation([])
    setMax([])
    setIsEvaluated(false)
    setEvaluation(null)
  }

  // Handle "+ Add Process"
  const handleAddProcess = () => {
    const numRes = resourceNames.length
    const defaultMax = [3, 2, 2]
    const defaultAlloc = [0, 0, 0]
    setAllocation((prev) => [...prev, defaultAlloc.slice(0, numRes)])
    setMax((prev) => [...prev, defaultMax.slice(0, numRes)])
    setIsEvaluated(false)
    setEvaluation(null)
  }

  // Handle Delete Process
  const handleDeleteProcess = (pIdx) => {
    const nextAlloc = allocation.filter((_, i) => i !== pIdx)
    const nextMax = max.filter((_, i) => i !== pIdx)
    setAllocation(nextAlloc)
    setMax(nextMax)
    setIsEvaluated(false)
    setEvaluation(null)
  }

  // Edit cell handlers
  const handleAvailableChange = (resIdx, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0)
    setAvailable((prev) => {
      const next = [...prev]
      next[resIdx] = num
      return next
    })
    setIsEvaluated(false)
    setEvaluation(null)
  }

  const handleAllocationChange = (pIdx, rIdx, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0)
    setAllocation((prev) => {
      const next = prev.map((r) => [...r])
      next[pIdx][rIdx] = num
      return next
    })
    setIsEvaluated(false)
    setEvaluation(null)
  }

  const handleMaxChange = (pIdx, rIdx, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0)
    setMax((prev) => {
      const next = prev.map((r) => [...r])
      next[pIdx][rIdx] = num
      return next
    })
    setIsEvaluated(false)
    setEvaluation(null)
  }

  // Toggle Prevention strategy from Coffman panel
  const handleTogglePrevention = (key) => {
    const nextSettings = {
      ...preventionSettings,
      [key]: !preventionSettings[key],
    }
    setPreventionSettings(nextSettings)
    if (isEvaluated) {
      runEvaluation(allocation, max, available, nextSettings)
    }
  }

  return (
    <div className="mx-auto max-w-[1480px] p-5 lg:p-8 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-300/70">
              Operating System Resource Management
            </p>
            <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 font-mono text-[9px] font-semibold text-cyan-300 border border-cyan-400/20">
              Module 4
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100 mt-1">
            Deadlock Avoidance — Banker's Algorithm & RAG Visualizer
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Configure system state, generate random workloads, evaluate safety sequences, and inspect the Resource Allocation Graph (RAG).
          </p>
        </div>
      </div>

      {/* ── Section 1: Top Controls Bar ─────────────────────────────────── */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#10151d] p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Action Buttons: Random Preset, Clear All, Add Process */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleRandomPreset}
              className="flex h-9 items-center gap-2 rounded-lg bg-cyan-400 px-4 text-xs font-bold text-[#071014] shadow-[0_0_15px_rgba(103,232,249,0.3)] transition-all hover:bg-cyan-300 active:scale-95"
            >
              <Shuffle className="size-3.5" />
              Random Preset
            </button>

            <button
              onClick={handleAddProcess}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3.5 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-400/20"
            >
              <Plus className="size-3.5" />
              Add Process (P{allocation.length})
            </button>

            <button
              onClick={handleClearAll}
              disabled={allocation.length === 0}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 text-xs font-medium text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <RotateCcw className="size-3.5" />
              Clear All
            </button>
          </div>

          {/* Available Resource Vector Configuration */}
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0b0f15] px-4 py-2">
            <span className="font-mono text-xs font-medium uppercase tracking-wider text-slate-400">
              Available Resources:
            </span>
            <div className="flex items-center gap-2">
              {resourceNames.map((resName, rIdx) => (
                <div key={resName} className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-slate-400">{resName}:</span>
                  <input
                    type="number"
                    min="0"
                    value={available[rIdx] ?? 0}
                    onChange={(e) => handleAvailableChange(rIdx, e.target.value)}
                    className="h-8 w-12 rounded-lg border border-white/10 bg-[#070a0e] text-center font-mono text-xs font-bold text-cyan-300 outline-none focus:border-cyan-400/50"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: Manual Process Entry Table ────────────────────────── */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#10151d] p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-cyan-300" />
            <h3 className="text-sm font-semibold text-slate-100">
              Process Demand Matrix (Allocation &amp; Maximum Claims)
            </h3>
          </div>
          <span className="font-mono text-xs text-slate-500">
            {allocation.length} {allocation.length === 1 ? 'Process' : 'Processes'} Registered
          </span>
        </div>

        {/* Validation Warning Notice if any */}
        {!validation.isValid && (
          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-200">
            <AlertTriangle className="size-4 shrink-0 text-amber-400" />
            <span>{validation.error}</span>
          </div>
        )}

        {allocation.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-[#090d14] p-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300 mb-3">
              <Layers className="size-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">No Processes Configured</h4>
            <p className="mt-1 text-xs text-slate-500 max-w-md">
              Start by clicking <strong className="text-cyan-300">"Random Preset"</strong> to generate a randomized workload, or <strong className="text-slate-300">"+ Add Process"</strong> to build manual matrices.
            </p>
          </div>
        ) : (
          /* Matrices Table */
          <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#0b0f15]">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  <th className="p-3">Process</th>
                  <th className="p-3 text-center" colSpan={resourceNames.length}>
                    Allocation Matrix
                  </th>
                  <th className="p-3 text-center" colSpan={resourceNames.length}>
                    Max Matrix
                  </th>
                  <th className="p-3 text-center" colSpan={resourceNames.length}>
                    Need (Max - Alloc)
                  </th>
                  <th className="p-3 text-right">Delete</th>
                </tr>
                <tr className="border-b border-white/[0.04] text-[9px] font-mono text-slate-500">
                  <th className="p-2 pl-3">ID</th>
                  {resourceNames.map((r) => (
                    <th key={`alloc-h-${r}`} className="p-2 text-center text-cyan-300">
                      {r}
                    </th>
                  ))}
                  {resourceNames.map((r) => (
                    <th key={`max-h-${r}`} className="p-2 text-center text-violet-300">
                      {r}
                    </th>
                  ))}
                  {resourceNames.map((r) => (
                    <th key={`need-h-${r}`} className="p-2 text-center text-amber-300">
                      {r}
                    </th>
                  ))}
                  <th className="p-2 text-right pr-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {allocation.map((allocRow, pIdx) => {
                  const maxRow = max[pIdx] || []
                  const needRow = currentNeedMatrix[pIdx] || []

                  return (
                    <tr
                      key={pIdx}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Process ID */}
                      <td className="p-3 font-mono font-bold text-slate-200">
                        P{pIdx}
                      </td>

                      {/* Allocation Inputs */}
                      {allocRow.map((val, rIdx) => (
                        <td key={`alloc-${pIdx}-${rIdx}`} className="p-2 text-center">
                          <input
                            type="number"
                            min="0"
                            value={val}
                            onChange={(e) => handleAllocationChange(pIdx, rIdx, e.target.value)}
                            className="h-8 w-12 rounded border border-white/10 bg-[#070a0e] text-center font-mono text-xs font-semibold text-slate-200 outline-none focus:border-cyan-400/50"
                          />
                        </td>
                      ))}

                      {/* Max Inputs */}
                      {maxRow.map((val, rIdx) => (
                        <td key={`max-${pIdx}-${rIdx}`} className="p-2 text-center">
                          <input
                            type="number"
                            min="0"
                            value={val}
                            onChange={(e) => handleMaxChange(pIdx, rIdx, e.target.value)}
                            className="h-8 w-12 rounded border border-white/10 bg-[#070a0e] text-center font-mono text-xs font-semibold text-slate-200 outline-none focus:border-violet-400/50"
                          />
                        </td>
                      ))}

                      {/* Auto Computed Need */}
                      {needRow.map((val, rIdx) => (
                        <td key={`need-${pIdx}-${rIdx}`} className="p-2 text-center">
                          <span
                            className={`inline-block w-12 py-1 rounded font-mono text-xs font-bold ${
                              val === 0
                                ? 'text-slate-500 bg-white/[0.02]'
                                : 'text-amber-300 bg-amber-400/10'
                            }`}
                          >
                            {val}
                          </span>
                        </td>
                      ))}

                      {/* Delete Process Button */}
                      <td className="p-2 text-right pr-3">
                        <button
                          onClick={() => handleDeleteProcess(pIdx)}
                          className="rounded p-1 text-slate-500 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
                          title="Delete Process"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Section 3: Large Prominent "Run / Evaluate" Button ───────────── */}
        <div className="mt-5">
          <button
            onClick={handleRun}
            disabled={allocation.length === 0 || !validation.isValid || isEvaluating}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-cyan-400 py-3.5 text-sm font-bold text-[#071014] shadow-[0_0_25px_rgba(103,232,249,0.35)] transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            <Play className="size-4 fill-current" />
            <span>{isEvaluating ? 'Evaluating System State...' : "Run Banker's Evaluation"}</span>
          </button>
        </div>
      </section>

      {/* ── Section 4: Output Section (Only rendered when isEvaluated === true) ───────── */}
      {isEvaluated && evaluation && evaluation.isValid && (
        <div className="space-y-6">

          {/* Evaluation Results Card */}
          <section className="rounded-2xl border border-white/[0.08] bg-[#10151d] p-5 shadow-xl">
            {/* Verdict Banner */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex size-12 items-center justify-center rounded-2xl ${
                    evaluation.simulation.isSafe
                      ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
                      : 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40 shadow-[0_0_20px_rgba(244,63,94,0.2)] animate-pulse'
                  }`}
                >
                  {evaluation.simulation.isSafe ? (
                    <ShieldCheck className="size-6" />
                  ) : (
                    <ShieldAlert className="size-6" />
                  )}
                </div>
                <div>
                  <h3
                    className={`text-lg font-bold font-mono ${
                      evaluation.simulation.isSafe ? 'text-emerald-300' : 'text-rose-400'
                    }`}
                  >
                    {evaluation.simulation.isSafe ? 'SAFE STATE DETECTED' : 'DEADLOCK HAZARD DETECTED'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {evaluation.simulation.isSafe
                      ? 'All processes can finish without entering a deadlock condition.'
                      : 'Circular resource starvation detected. The system cannot fulfill all requests.'}
                  </p>
                </div>
              </div>

              {/* Safe Sequence Flow */}
              {evaluation.simulation.isSafe && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2">
                  <span className="font-mono text-xs text-slate-400 uppercase">Safe Order:</span>
                  <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-emerald-300">
                    <span>&lt;</span>
                    {evaluation.simulation.safeSequence.map((pIdx, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <span className="rounded bg-emerald-400/20 px-2 py-0.5 border border-emerald-400/30">
                          P{pIdx}
                        </span>
                        {i < evaluation.simulation.safeSequence.length - 1 && (
                          <span className="text-slate-500 text-xs">➔</span>
                        )}
                      </span>
                    ))}
                    <span>&gt;</span>
                  </div>
                </div>
              )}
            </div>

            {/* Step-by-Step Resolution Trace Log */}
            <div className="rounded-xl border border-white/[0.06] bg-[#0b0f15] p-4">
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500 block mb-2">
                Algorithm Evaluation Trace Log:
              </span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {evaluation.simulation.steps.map((st, sIdx) => (
                  <div key={sIdx} className="flex items-start gap-2.5 font-mono text-xs text-slate-300">
                    <span className="text-slate-500 text-[10px] shrink-0 mt-0.5">#{sIdx + 1}</span>
                    <span className="leading-relaxed">{st.logMessage}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Simplified Resource Allocation Graph (RAG) */}
          <RAGVisualizer
            resourceNames={resourceNames}
            available={evaluation.effectiveAvailable}
            allocation={evaluation.effectiveAllocation}
            need={evaluation.effectiveNeed}
            circularWaitInfo={evaluation.circularWaitInfo}
          />

          {/* Coffman Conditions Diagnostic & Prevention Panel */}
          <CoffmanConditionsPanel
            coffmanData={evaluation.coffmanData}
            preventionSettings={preventionSettings}
            onTogglePrevention={handleTogglePrevention}
            isSafe={evaluation.simulation.isSafe}
            circularWaitInfo={evaluation.circularWaitInfo}
            preventionLog={evaluation.preventionLog}
          />
        </div>
      )}

      {/* Footer */}
      <footer className="mt-8 flex items-center justify-between border-t border-white/[0.06] pt-5 text-[10px] uppercase tracking-[0.12em] text-slate-600">
        <span>KernelLab Deadlock Avoidance · Banker's Algorithm &amp; RAG Engine</span>
        <span>Single-Click Evaluation · RAG Topology · Coffman Condition Diagnostics</span>
      </footer>
    </div>
  )
}
