import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react'

export default function CoffmanConditionsPanel({
  coffmanData,
  preventionSettings,
  onTogglePrevention,
  isSafe,
  circularWaitInfo,
  preventionLog = [],
}) {
  const { conditions = [] } = coffmanData || {}
  const [infoExpanded, setInfoExpanded] = useState(false)

  // Identify if any prevention strategy is currently engaged
  const hasActivePrevention = Object.values(preventionSettings).some(Boolean)

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#10151d] p-5 shadow-xl">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Zap className="size-4 text-amber-400" />
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Coffman Conditions Diagnostic &amp; Deadlock Prevention Panel
            </h4>
            <p className="text-[11px] text-slate-500">
              Deadlock requires all 4 necessary conditions to hold simultaneously. Breaking any single condition mathematically prevents deadlock.
            </p>
          </div>
        </div>

        <button
          onClick={() => setInfoExpanded(!infoExpanded)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <HelpCircle className="size-3.5" />
          <span>{infoExpanded ? 'Hide Theory' : 'OS Theory'}</span>
        </button>
      </div>

      {/* OS Theory Quick Accordion */}
      {infoExpanded && (
        <div className="mb-4 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4 text-xs text-cyan-200/90 leading-relaxed">
          <p className="font-semibold text-cyan-300 mb-1">Dijkstra &amp; Coffman Deadlock Theorem (1971):</p>
          <p>
            A state of deadlock can arise if and only if four necessary conditions hold simultaneously in a system:
            (1) Mutual Exclusion, (2) Hold &amp; Wait, (3) No Preemption, and (4) Circular Wait.
            Operating systems use Deadlock Prevention algorithms to ensure that at least one of these conditions can never be satisfied.
          </p>
        </div>
      )}

      {/* Diagnostic Feedback Banner */}
      {!isSafe ? (
        /* When UNSAFE / DEADLOCKED */
        <div className="mb-5 rounded-xl border border-rose-500/50 bg-gradient-to-r from-rose-950/40 via-[#260e18] to-rose-950/40 p-4 shadow-[0_0_25px_rgba(244,63,94,0.2)] animate-pulse">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40 shrink-0">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <p className="font-mono text-sm font-bold text-rose-200">
                All 4 Coffman conditions are fulfilled — System is in a Deadlock!
              </p>
              <p className="mt-0.5 text-xs text-rose-300/80">
                Mutual Exclusion, Hold &amp; Wait, No Preemption, and Circular Wait are all simultaneously active. Processes cannot progress without external intervention.
              </p>
            </div>
          </div>
        </div>
      ) : hasActivePrevention ? (
        /* When Prevention Strategy is actively engaged */
        <div className="mb-5 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/30 via-[#0d221b] to-emerald-950/30 p-4 shadow-[0_0_20px_rgba(52,211,153,0.15)]">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40 shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="font-mono text-sm font-bold text-emerald-200">
                Deadlock Successfully Prevented via Invalidation Strategy!
              </p>
              <p className="mt-0.5 text-xs text-emerald-300/80">
                By proactively breaking necessary Coffman conditions, the system avoids circular starvation.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* When SAFE without prevention intervention */
        <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-5 text-emerald-300 shrink-0" />
            <p className="font-mono text-xs text-emerald-200">
              System is currently in a Safe State. Banker's Algorithm discovered a valid allocation schedule avoiding circular deadlock.
            </p>
          </div>
        </div>
      )}

      {/* 4 Conditions Status Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-5">
        {conditions.map((cond) => {
          const isCircularWait = cond.id === 'circular_wait'

          // ── Case 1: UNSAFE / DEADLOCKED (isSafe === false) ─────────────────
          // Render ALL 4 condition cards in RED/ROSE with Warning/Hazard badge
          if (!isSafe) {
            return (
              <div
                key={cond.id}
                className="flex flex-col justify-between rounded-xl border border-rose-500/40 bg-rose-950/20 p-4 shadow-[0_0_15px_rgba(244,63,94,0.1)] transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-slate-100">
                      {cond.name}
                    </span>
                    <span className="flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-300 border border-rose-500/30">
                      <AlertTriangle className="size-3 text-rose-400" />
                      Active (Hazard)
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-300/80 mt-2">
                    {cond.description}
                  </p>
                </div>

                <div className="mt-4 border-t border-white/[0.06] pt-2.5">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500 block">
                    Prevention Countermeasure:
                  </span>
                  <span className="text-[11px] font-medium text-slate-300 mt-0.5 block">
                    {cond.preventionName}
                  </span>
                </div>
              </div>
            )
          }

          // ── Case 2: SAFE (isSafe === true) ─────────────────────────────────
          // Circular Wait: Solid green badge (ShieldCheck / CheckCircle2)
          if (isCircularWait) {
            return (
              <div
                key={cond.id}
                className="flex flex-col justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-4 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-slate-100">
                      {cond.name}
                    </span>
                    <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                      <ShieldCheck className="size-3 text-emerald-400" />
                      Prevented (Safe)
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-emerald-200/80 mt-2">
                    No circular dependency cycle exists in the allocation graph. Deadlock is averted.
                  </p>
                </div>

                <div className="mt-4 border-t border-white/[0.06] pt-2.5">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500 block">
                    Prevention Countermeasure:
                  </span>
                  <span className="text-[11px] font-medium text-slate-300 mt-0.5 block">
                    {cond.preventionName}
                  </span>
                </div>
              </div>
            )
          }

          // Mutual Exclusion, Hold & Wait, No Preemption in SAFE state:
          // Render with neutral slate/blue badge and Info / Zap icon (System Policy / Active)
          return (
            <div
              key={cond.id}
              className="flex flex-col justify-between rounded-xl border border-sky-500/20 bg-[#0b1018] p-4 transition-all"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-slate-100">
                    {cond.name}
                  </span>
                  <span className="flex items-center gap-1 rounded bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-sky-300 border border-sky-500/20">
                    <Info className="size-3 text-sky-400" />
                    System Policy
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400 mt-2">
                  {cond.description}
                </p>
              </div>

              <div className="mt-4 border-t border-white/[0.06] pt-2.5">
                <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500 block">
                  Prevention Countermeasure:
                </span>
                <span className="text-[11px] font-medium text-slate-300 mt-0.5 block">
                  {cond.preventionName}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Interactive Prevention Toggles Section */}
      <div className="rounded-xl border border-white/[0.06] bg-[#0b0f15] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="size-3.5 text-cyan-300" />
            <h5 className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-300">
              Interactive Deadlock Prevention Strategies (Test What-If Scenarios)
            </h5>
          </div>
          <span className="font-mono text-[10px] text-slate-500">
            Toggle strategies to observe dynamic deadlock recovery
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Strategy 1: Preemption */}
          <button
            onClick={() => onTogglePrevention('allowPreemption')}
            className={`flex flex-col items-start rounded-xl p-3 text-left transition-all ${
              preventionSettings.allowPreemption
                ? 'border border-cyan-400/50 bg-cyan-400/[0.08] shadow-[0_0_15px_rgba(34,211,238,0.15)] ring-1 ring-cyan-400/30'
                : 'border border-white/[0.07] bg-[#070a0e] hover:border-white/20'
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-[10px] font-bold text-cyan-300 uppercase">
                Break #3: Preemption
              </span>
              <div
                className={`h-4 w-7 rounded-full p-0.5 transition-colors ${
                  preventionSettings.allowPreemption ? 'bg-cyan-400' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`size-3 rounded-full bg-white transition-transform ${
                    preventionSettings.allowPreemption ? 'translate-x-3' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-200">Allow Resource Preemption</p>
            <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
              Forces waiting threads to surrender allocated instances back to Available pool.
            </p>
          </button>

          {/* Strategy 2: Hold & Wait */}
          <button
            onClick={() => onTogglePrevention('forceAllAtOnce')}
            className={`flex flex-col items-start rounded-xl p-3 text-left transition-all ${
              preventionSettings.forceAllAtOnce
                ? 'border border-amber-400/50 bg-amber-400/[0.08] shadow-[0_0_15px_rgba(251,191,36,0.15)] ring-1 ring-amber-400/30'
                : 'border border-white/[0.07] bg-[#070a0e] hover:border-white/20'
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-[10px] font-bold text-amber-300 uppercase">
                Break #2: Hold &amp; Wait
              </span>
              <div
                className={`h-4 w-7 rounded-full p-0.5 transition-colors ${
                  preventionSettings.forceAllAtOnce ? 'bg-amber-400' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`size-3 rounded-full bg-white transition-transform ${
                    preventionSettings.forceAllAtOnce ? 'translate-x-3' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-200">Force All-at-Once Allocation</p>
            <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
              Enforces All-or-Nothing rule: processes cannot hold partial units while waiting.
            </p>
          </button>

          {/* Strategy 3: Virtualization / Spooling */}
          <button
            onClick={() => onTogglePrevention('allowSharing')}
            className={`flex flex-col items-start rounded-xl p-3 text-left transition-all ${
              preventionSettings.allowSharing
                ? 'border border-emerald-400/50 bg-emerald-400/[0.08] shadow-[0_0_15px_rgba(52,211,153,0.15)] ring-1 ring-emerald-400/30'
                : 'border border-white/[0.07] bg-[#070a0e] hover:border-white/20'
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-[10px] font-bold text-emerald-300 uppercase">
                Break #1: Mutex
              </span>
              <div
                className={`h-4 w-7 rounded-full p-0.5 transition-colors ${
                  preventionSettings.allowSharing ? 'bg-emerald-400' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`size-3 rounded-full bg-white transition-transform ${
                    preventionSettings.allowSharing ? 'translate-x-3' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-200">Spooling / Multiplexing</p>
            <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
              Virtualizes dedicated hardware into shareable logical streams (e.g. print spooler).
            </p>
          </button>

          {/* Strategy 4: Linear Ordering */}
          <button
            onClick={() => onTogglePrevention('resourceOrdering')}
            className={`flex flex-col items-start rounded-xl p-3 text-left transition-all ${
              preventionSettings.resourceOrdering
                ? 'border border-violet-400/50 bg-violet-400/[0.08] shadow-[0_0_15px_rgba(167,139,250,0.15)] ring-1 ring-violet-400/30'
                : 'border border-white/[0.07] bg-[#070a0e] hover:border-white/20'
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-[10px] font-bold text-violet-300 uppercase">
                Break #4: Circular Wait
              </span>
              <div
                className={`h-4 w-7 rounded-full p-0.5 transition-colors ${
                  preventionSettings.resourceOrdering ? 'bg-violet-400' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`size-3 rounded-full bg-white transition-transform ${
                    preventionSettings.resourceOrdering ? 'translate-x-3' : 'translate-x-0'
                  }`}
                />
              </div>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-200">Strict Linear Ordering</p>
            <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
              Demands resources be requested strictly in monotonic order (F: R0 &lt; R1 &lt; R2).
            </p>
          </button>
        </div>

        {/* Dynamic Prevention Feedback Log */}
        {preventionLog.length > 0 && (
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <span className="font-mono text-[10px] uppercase text-slate-500 block mb-1.5">
              Active Prevention Diagnostics Trace:
            </span>
            <div className="space-y-1">
              {preventionLog.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2 font-mono text-[11px] text-emerald-300">
                  <span className="size-1 rounded-full bg-emerald-400" />
                  <span>{entry}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
