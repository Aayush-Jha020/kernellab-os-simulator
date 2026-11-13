import { useMemo } from 'react'
import { AlertTriangle, ShieldAlert } from 'lucide-react'

/**
 * Simplified Resource Allocation Graph (RAG) Component
 * Layout:
 * - Processes (P0, P1, ...) on the LEFT (circular nodes)
 * - Resources (R0, R1, ...) on the RIGHT (rectangular nodes)
 * - Allocation (R -> P): Solid green directed arrows
 * - Request / Need (P -> R): Dashed blue directed arrows
 * - Circular Wait: Glowing red edges and nodes
 */
export default function RAGVisualizer({
  resourceNames = ['A', 'B', 'C'],
  available = [3, 3, 2],
  allocation = [],
  need = [],
  circularWaitInfo = { hasCycle: false, cycleNodes: new Set(), cycleEdges: new Set(), cyclePathText: '' },
}) {
  const numProcesses = allocation.length
  const numResources = resourceNames.length

  if (numProcesses === 0) {
    return null
  }

  // Canvas dimensions
  const W = 780
  const H = Math.max(280, Math.max(numProcesses, numResources) * 72 + 50)

  // Layout: Left column for Processes, Right column for Resources
  const processX = 110
  const resourceX = 640

  const processPositions = useMemo(() => {
    const startY = 45
    const gapY = (H - startY * 2) / Math.max(numProcesses - 1, 1)

    return Array.from({ length: numProcesses }, (_, i) => ({
      id: `P${i}`,
      name: `P${i}`,
      pIdx: i,
      x: processX,
      y: numProcesses === 1 ? H / 2 : startY + i * gapY,
      radius: 20,
    }))
  }, [numProcesses, H])

  const resourcePositions = useMemo(() => {
    const startY = 55
    const gapY = (H - startY * 2) / Math.max(numResources - 1, 1)

    return resourceNames.map((name, j) => {
      const allocatedTotal = allocation.reduce((sum, row) => sum + (row[j] || 0), 0)
      const freeCount = available[j] || 0
      return {
        id: `R${j}`,
        name: `R${j} (${name})`,
        rIdx: j,
        x: resourceX,
        y: numResources === 1 ? H / 2 : startY + j * gapY,
        width: 86,
        height: 42,
        freeCount,
        allocatedTotal,
      }
    })
  }, [resourceNames, numResources, allocation, available, H])

  // Build directed edges:
  // 1. Allocation (R_j -> P_i): Solid Green
  // 2. Request/Need (P_i -> R_j): Dashed Blue
  const edges = useMemo(() => {
    const list = []

    // Allocation Edges: Resource -> Process
    allocation.forEach((row, pIdx) => {
      row.forEach((allocVal, rIdx) => {
        if (allocVal > 0) {
          const pNode = processPositions[pIdx]
          const rNode = resourcePositions[rIdx]
          if (pNode && rNode) {
            const edgeKey = `R${rIdx}->P${pIdx}`
            const inCycle = circularWaitInfo.hasCycle && circularWaitInfo.cycleEdges.has(edgeKey)

            list.push({
              key: edgeKey,
              type: 'ALLOCATION',
              from: { x: rNode.x - rNode.width / 2, y: rNode.y + 6 },
              to: { x: pNode.x + pNode.radius, y: pNode.y + 6 },
              count: allocVal,
              inCycle,
            })
          }
        }
      })
    })

    // Request/Need Edges: Process -> Resource
    need.forEach((row, pIdx) => {
      row.forEach((needVal, rIdx) => {
        if (needVal > 0) {
          const pNode = processPositions[pIdx]
          const rNode = resourcePositions[rIdx]
          if (pNode && rNode) {
            const edgeKey = `P${pIdx}->R${rIdx}`
            const inCycle = circularWaitInfo.hasCycle && circularWaitInfo.cycleEdges.has(edgeKey)

            list.push({
              key: edgeKey,
              type: 'REQUEST',
              from: { x: pNode.x + pNode.radius, y: pNode.y - 6 },
              to: { x: rNode.x - rNode.width / 2, y: rNode.y - 6 },
              count: needVal,
              inCycle,
            })
          }
        }
      })
    })

    return list
  }, [allocation, need, processPositions, resourcePositions, circularWaitInfo])

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#10151d] p-5 shadow-xl">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Resource Allocation Graph (RAG)
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Processes on left, Resources on right. Allocation (<strong className="text-emerald-400">R ➔ P</strong>) &amp; Request (<strong className="text-sky-400">P ➔ R</strong>).
          </p>
        </div>

        {/* Circular Wait Status Indicator */}
        {circularWaitInfo.hasCycle ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/50 bg-rose-950/30 px-3.5 py-1.5 text-xs font-bold text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.25)] animate-pulse">
            <ShieldAlert className="size-4 text-rose-400" />
            <span>CIRCULAR WAIT CYCLE DETECTED</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-3 py-1 text-xs font-medium text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>No Circular Wait (Acyclic Graph)</span>
          </div>
        )}
      </div>

      {/* Cycle Path Text Banner if Cycle Detected */}
      {circularWaitInfo.hasCycle && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-2 text-xs text-rose-200">
          <AlertTriangle className="size-4 shrink-0 text-rose-400" />
          <span className="font-mono">
            Cycle Loop: <strong className="text-rose-300">{circularWaitInfo.cyclePathText}</strong>
          </span>
        </div>
      )}

      {/* Clean SVG Canvas */}
      <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#080c12] p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none">
          <defs>
            {/* Arrowhead marker: Allocation (pointing left towards Process) */}
            <marker id="rag-arrow-alloc" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 10 1 L 0 5 L 10 9 z" fill="#34d399" />
            </marker>

            {/* Arrowhead marker: Request (pointing right towards Resource) */}
            <marker id="rag-arrow-need" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>

            {/* Arrowhead marker: Cycle (pulsing red) */}
            <marker id="rag-arrow-cycle" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
            </marker>

            <filter id="ragRedGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Column labels */}
          <text x={processX} y={24} textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="monospace" fontWeight="bold">
            PROCESSES (P)
          </text>
          <text x={resourceX} y={24} textAnchor="middle" fill="#64748b" fontSize="10" fontFamily="monospace" fontWeight="bold">
            RESOURCES (R)
          </text>

          {/* Directed Edges */}
          {edges.map((e) => {
            const isCycle = e.inCycle
            const dx = e.to.x - e.from.x
            const dy = e.to.y - e.from.y

            // Simple curve between P and R
            const ctrlOffset = e.type === 'ALLOCATION' ? 35 : -35
            const ctrlX = e.from.x + dx / 2
            const ctrlY = e.from.y + dy / 2 + ctrlOffset

            const pathD = `M ${e.from.x} ${e.from.y} Q ${ctrlX} ${ctrlY} ${e.to.x} ${e.to.y}`

            return (
              <g key={e.key}>
                {/* Glowing underlay if cycle */}
                {isCycle && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="5"
                    opacity="0.5"
                    filter="url(#ragRedGlow)"
                  />
                )}

                {/* Edge line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isCycle ? '#f43f5e' : e.type === 'ALLOCATION' ? '#34d399' : '#38bdf8'}
                  strokeWidth={isCycle ? '2.5' : '1.8'}
                  strokeDasharray={isCycle ? '5 4' : e.type === 'REQUEST' ? '5 4' : 'none'}
                  markerEnd={isCycle ? 'url(#rag-arrow-cycle)' : e.type === 'ALLOCATION' ? 'url(#rag-arrow-alloc)' : 'url(#rag-arrow-need)'}
                  className={isCycle ? 'animate-pulse' : ''}
                />

                {/* Count badge on curve */}
                <rect
                  x={ctrlX - 16}
                  y={ctrlY - 8}
                  width="32"
                  height="16"
                  rx="3"
                  fill="#06090e"
                  stroke={isCycle ? '#f43f5e' : e.type === 'ALLOCATION' ? '#34d399' : '#38bdf8'}
                  strokeWidth="0.8"
                  opacity="0.9"
                />
                <text
                  x={ctrlX}
                  y={ctrlY + 3.5}
                  textAnchor="middle"
                  fill={isCycle ? '#f43f5e' : e.type === 'ALLOCATION' ? '#6ee7b7' : '#7dd3fc'}
                  fontSize="9"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {e.count}
                </text>
              </g>
            )
          })}

          {/* Process Nodes (Left Column) */}
          {processPositions.map((p) => {
            const inCycle = circularWaitInfo.hasCycle && circularWaitInfo.cycleNodes.has(p.id)

            return (
              <g key={p.id} filter={inCycle ? 'url(#ragRedGlow)' : undefined}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.radius}
                  fill={inCycle ? '#260a12' : '#0e1420'}
                  stroke={inCycle ? '#f43f5e' : '#38bdf8'}
                  strokeWidth={inCycle ? '2.5' : '1.8'}
                  className={inCycle ? 'animate-pulse' : ''}
                />
                <text
                  x={p.x}
                  y={p.y + 4}
                  textAnchor="middle"
                  fill={inCycle ? '#fda4af' : '#e2e8f0'}
                  fontSize="12"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {p.name}
                </text>
              </g>
            )
          })}

          {/* Resource Nodes (Right Column) */}
          {resourcePositions.map((r) => {
            const inCycle = circularWaitInfo.hasCycle && circularWaitInfo.cycleNodes.has(r.id)

            return (
              <g key={r.id} filter={inCycle ? 'url(#ragRedGlow)' : undefined}>
                <rect
                  x={r.x - r.width / 2}
                  y={r.y - r.height / 2}
                  width={r.width}
                  height={r.height}
                  rx="6"
                  fill={inCycle ? '#260a12' : '#0e1420'}
                  stroke={inCycle ? '#f43f5e' : '#22d3ee'}
                  strokeWidth={inCycle ? '2.5' : '1.5'}
                  className={inCycle ? 'animate-pulse' : ''}
                />
                <text
                  x={r.x}
                  y={r.y - 4}
                  textAnchor="middle"
                  fill={inCycle ? '#fda4af' : '#67e8f9'}
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {r.name}
                </text>
                <text
                  x={r.x}
                  y={r.y + 11}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  Free: <tspan fill="#34d399">{r.freeCount}</tspan>
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] pt-3 text-xs">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-5 bg-emerald-400 inline-block" />
            <span className="font-mono text-[11px] text-slate-400">
              Allocation (<strong className="text-emerald-300">R ➔ P</strong>, Solid Green)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-0.5 w-5 border-b-2 border-dashed border-sky-400 inline-block" />
            <span className="font-mono text-[11px] text-slate-400">
              Request / Need (<strong className="text-sky-300">P ➔ R</strong>, Dashed Blue)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-1 w-5 bg-rose-500 inline-block shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
            <span className="font-mono text-[11px] text-rose-300 font-semibold">
              Circular Wait Cycle (Red)
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
