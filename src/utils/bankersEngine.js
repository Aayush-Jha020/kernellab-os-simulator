/**
 * Banker's Algorithm Dynamic Matrix & Execution Step Engine
 * Module 4: Deadlock Avoidance
 */

/**
 * Calculates Need Matrix: Need[i][j] = Max[i][j] - Allocation[i][j]
 * @param {number[][]} maxMatrix
 * @param {number[][]} allocationMatrix
 * @returns {number[][]}
 */
export function calculateNeedMatrix(maxMatrix, allocationMatrix) {
  if (!Array.isArray(maxMatrix) || !Array.isArray(allocationMatrix)) return []
  return maxMatrix.map((maxRow, i) => {
    const allocRow = allocationMatrix[i] || []
    return maxRow.map((maxVal, j) => {
      const allocVal = allocRow[j] ?? 0
      return Math.max(0, maxVal - allocVal)
    })
  })
}

/**
 * Validates system state:
 * - Checks non-negative values
 * - Checks that Allocation[i][j] <= Max[i][j] for all i, j
 * - Checks dimension consistency
 * @param {number[]} available
 * @param {number[][]} maxMatrix
 * @param {number[][]} allocationMatrix
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateSystemState(available, maxMatrix, allocationMatrix) {
  if (!Array.isArray(available) || available.length === 0) {
    return { isValid: false, error: 'Available vector is empty or invalid.' }
  }
  if (!Array.isArray(maxMatrix) || maxMatrix.length === 0) {
    return { isValid: false, error: 'Max Matrix is empty.' }
  }
  if (!Array.isArray(allocationMatrix) || allocationMatrix.length === 0) {
    return { isValid: false, error: 'Allocation Matrix is empty.' }
  }
  if (maxMatrix.length !== allocationMatrix.length) {
    return { isValid: false, error: 'Process count mismatch between Max and Allocation matrices.' }
  }

  const numResources = available.length
  for (let r = 0; r < numResources; r++) {
    if (typeof available[r] !== 'number' || isNaN(available[r]) || available[r] < 0) {
      return { isValid: false, error: `Available resource R${r} must be a non-negative number.` }
    }
  }

  for (let i = 0; i < maxMatrix.length; i++) {
    const maxRow = maxMatrix[i]
    const allocRow = allocationMatrix[i]
    if (maxRow.length !== numResources || allocRow.length !== numResources) {
      return { isValid: false, error: `Process P${i} has incorrect resource dimensions (expected ${numResources}).` }
    }

    for (let j = 0; j < numResources; j++) {
      const mVal = maxRow[j]
      const aVal = allocRow[j]
      if (typeof mVal !== 'number' || isNaN(mVal) || mVal < 0) {
        return { isValid: false, error: `Max[P${i}][R${j}] must be non-negative.` }
      }
      if (typeof aVal !== 'number' || isNaN(aVal) || aVal < 0) {
        return { isValid: false, error: `Allocation[P${i}][R${j}] must be non-negative.` }
      }
      if (aVal > mVal) {
        return {
          isValid: false,
          error: `Allocation error: P${i} allocation (${aVal}) exceeds Max claim (${mVal}) for resource R${j}.`,
        }
      }
    }
  }

  return { isValid: true }
}

/**
 * Generates discrete Banker's execution steps for interactive safety simulation.
 * Step structure:
 * {
 *   stepIndex: number,
 *   activeProcess: number | null,
 *   workVector: number[],
 *   finishVector: boolean[],
 *   satisfiesNeed: boolean | null,
 *   logMessage: string,
 *   isSafe: boolean | null,
 *   safeSequence: number[],
 *   details?: object
 * }
 * @param {number[]} available
 * @param {number[][]} maxMatrix
 * @param {number[][]} allocationMatrix
 * @returns {{ steps: Array, isSafe: boolean, safeSequence: number[], needMatrix: number[][], validation: object }}
 */
export function generateBankersSteps(available, maxMatrix, allocationMatrix) {
  const validation = validateSystemState(available, maxMatrix, allocationMatrix)
  if (!validation.isValid) {
    return {
      steps: [
        {
          stepIndex: 0,
          activeProcess: null,
          workVector: [...(available || [])],
          finishVector: new Array(maxMatrix?.length || 0).fill(false),
          satisfiesNeed: false,
          logMessage: `Validation failed: ${validation.error}`,
          isSafe: false,
          safeSequence: [],
          details: { error: validation.error },
        },
      ],
      isSafe: false,
      safeSequence: [],
      needMatrix: [],
      validation,
    }
  }

  const numProcesses = allocationMatrix.length
  const numResources = available.length
  const needMatrix = calculateNeedMatrix(maxMatrix, allocationMatrix)

  let workVector = [...available]
  let finishVector = new Array(numProcesses).fill(false)
  const safeSequence = []
  const steps = []
  let stepIndex = 0

  // Initial Step 0
  steps.push({
    stepIndex: stepIndex++,
    activeProcess: null,
    workVector: [...workVector],
    finishVector: [...finishVector],
    satisfiesNeed: null,
    logMessage: `System initialized with Available Work = [${workVector.join(', ')}]. Beginning safety algorithm scan.`,
    isSafe: null,
    safeSequence: [],
    details: {
      type: 'INIT',
      work: [...workVector],
    },
  })

  // Iterative scan loop
  let progress = true
  while (progress) {
    progress = false

    for (let i = 0; i < numProcesses; i++) {
      if (finishVector[i]) continue

      const pNeed = needMatrix[i]
      // Check if Need[i][j] <= Work[j] for all resources j
      const satisfiesNeed = pNeed.every((needVal, r) => needVal <= workVector[r])

      if (satisfiesNeed) {
        const workBefore = [...workVector]
        // Reclaim allocated resources: Work = Work + Allocation[i]
        for (let r = 0; r < numResources; r++) {
          workVector[r] += allocationMatrix[i][r]
        }
        finishVector[i] = true
        safeSequence.push(i)
        progress = true

        steps.push({
          stepIndex: stepIndex++,
          activeProcess: i,
          workVector: [...workVector],
          finishVector: [...finishVector],
          satisfiesNeed: true,
          logMessage: `P${i} qualifies! Need [${pNeed.join(', ')}] ≤ Work [${workBefore.join(', ')}]. P${i} executes & releases [${allocationMatrix[i].join(', ')}]. Work becomes [${workVector.join(', ')}].`,
          isSafe: finishVector.every(Boolean) ? true : null,
          safeSequence: [...safeSequence],
          details: {
            type: 'EXECUTE',
            process: i,
            workBefore,
            workAfter: [...workVector],
            need: [...pNeed],
            allocated: [...allocationMatrix[i]],
          },
        })

        // Restart scan from process 0 to simulate classic Banker's algorithm greediness
        break
      } else {
        // Record test step showing process could not proceed at this moment
        steps.push({
          stepIndex: stepIndex++,
          activeProcess: i,
          workVector: [...workVector],
          finishVector: [...finishVector],
          satisfiesNeed: false,
          logMessage: `P${i} cannot proceed now: Need [${pNeed.join(', ')}] exceeds Work [${workVector.join(', ')}]. P${i} must wait.`,
          isSafe: null,
          safeSequence: [...safeSequence],
          details: {
            type: 'WAIT',
            process: i,
            work: [...workVector],
            need: [...pNeed],
            insufficientResources: pNeed
              .map((val, r) => (val > workVector[r] ? `R${r} (Need ${val} > Work ${workVector[r]})` : null))
              .filter(Boolean),
          },
        })
      }
    }
  }

  const isSafe = finishVector.every(Boolean)

  // Final conclusion step
  steps.push({
    stepIndex: stepIndex++,
    activeProcess: null,
    workVector: [...workVector],
    finishVector: [...finishVector],
    satisfiesNeed: isSafe,
    logMessage: isSafe
      ? `SAFE STATE CONFIRMED: All ${numProcesses} processes can finish without deadlock. Safe sequence: < ${safeSequence.map((p) => 'P' + p).join(' ➔ ')} >.`
      : `DEADLOCK HAZARD: Unsafe state detected! ${finishVector.filter((f) => !f).length} processes are blocked with Work = [${workVector.join(', ')}].`,
    isSafe,
    safeSequence: isSafe ? [...safeSequence] : [],
    details: {
      type: 'TERMINATE',
      isSafe,
      safeSequence: isSafe ? [...safeSequence] : [],
      unfinishedProcesses: finishVector.map((f, idx) => (!f ? idx : null)).filter((idx) => idx !== null),
    },
  })

  return {
    steps,
    isSafe,
    safeSequence: isSafe ? safeSequence : [],
    needMatrix,
    validation,
  }
}

/**
 * Standard Presets for Banker's Algorithm
 */
export const BANKER_PRESETS = [
  {
    id: 'safe_baseline',
    name: 'Safe State Baseline',
    description: 'Classic 5-process, 3-resource textbook model. Avoids deadlock with safe order < P1 ➔ P3 ➔ P4 ➔ P0 ➔ P2 >.',
    resources: ['A', 'B', 'C'],
    available: [3, 3, 2],
    allocation: [
      [0, 1, 0], // P0
      [2, 0, 0], // P1
      [3, 0, 2], // P2
      [2, 1, 1], // P3
      [0, 0, 2], // P4
    ],
    max: [
      [7, 5, 3], // P0
      [3, 2, 2], // P1
      [9, 0, 2], // P2
      [2, 2, 2], // P3
      [4, 3, 3], // P4
    ],
  },
  {
    id: 'unsafe_hazard',
    name: 'Unsafe State / Deadlock Hazard',
    description: 'Starved available resources ([0, 0, 0]). No process can satisfy its remaining Need, causing an unavoidable deadlock hazard.',
    resources: ['A', 'B', 'C'],
    available: [0, 0, 0],
    allocation: [
      [0, 1, 0],
      [2, 0, 0],
      [3, 0, 2],
      [2, 1, 1],
      [0, 0, 2],
    ],
    max: [
      [7, 5, 3],
      [3, 2, 2],
      [9, 0, 2],
      [2, 2, 2],
      [4, 3, 3],
    ],
  },
  {
    id: 'custom_request',
    name: 'Custom Request Test',
    description: 'Edge-case scenario with tight available resources [1, 0, 2] evaluating immediate safety vs blocking.',
    resources: ['A', 'B', 'C'],
    available: [1, 0, 2],
    allocation: [
      [1, 0, 0], // P0
      [1, 1, 0], // P1
      [2, 1, 1], // P2
      [0, 0, 2], // P3
    ],
    max: [
      [3, 2, 2], // P0
      [2, 2, 1], // P1
      [4, 3, 3], // P2
      [2, 1, 2], // P3
    ],
  },
]

/**
 * Generates a randomized, valid set of 3 to 5 processes with random Max, Allocation, and Available vectors.
 */
export function generateRandomBankerPreset(numResources = 3) {
  const numProcesses = Math.floor(Math.random() * 3) + 3 // 3, 4, or 5 processes
  const resources = ['A', 'B', 'C'].slice(0, numResources)

  const max = []
  const allocation = []

  for (let i = 0; i < numProcesses; i++) {
    const maxRow = []
    const allocRow = []
    for (let r = 0; r < numResources; r++) {
      const maxVal = Math.floor(Math.random() * 6) + 1 // 1 to 6
      const allocVal = Math.floor(Math.random() * (maxVal + 1)) // 0 to maxVal (ensures alloc <= max)
      maxRow.push(maxVal)
      allocRow.push(allocVal)
    }
    max.push(maxRow)
    allocation.push(allocRow)
  }

  // Available vector: random numbers 1 to 4
  const available = []
  for (let r = 0; r < numResources; r++) {
    available.push(Math.floor(Math.random() * 4) + 1)
  }

  return {
    resources,
    available,
    allocation,
    max,
  }
}

/**
 * Detects circular wait cycles in the Resource Allocation Graph.
 * Pi -> Rj (Request edge: Need[i][j] > 0 and Pi is unfinished/blocked)
 * Rj -> Pk (Assignment edge: Allocation[k][j] > 0 and Pk is unfinished/blocked)
 */
export function detectCircularWait(available, maxMatrix, allocationMatrix, finishVector = []) {
  const numProcesses = allocationMatrix.length
  const numResources = available.length
  const needMatrix = calculateNeedMatrix(maxMatrix, allocationMatrix)

  // Unfinished processes
  const unfinished = finishVector.length === numProcesses
    ? finishVector.map((f, i) => (!f ? i : null)).filter((i) => i !== null)
    : Array.from({ length: numProcesses }, (_, i) => i)

  if (unfinished.length === 0) {
    return {
      hasCycle: false,
      cycleProcesses: [],
      cycleResources: [],
      cycleNodes: new Set(),
      cycleEdges: new Set(),
      cyclePath: [],
      cyclePathText: '',
    }
  }

  // Build adjacency list for bipartite directed graph
  const adj = new Map()
  const addEdge = (u, v) => {
    if (!adj.has(u)) adj.set(u, [])
    adj.get(u).push(v)
  }

  // Pi -> Rj: process requesting resource
  for (const i of unfinished) {
    for (let j = 0; j < numResources; j++) {
      if (needMatrix[i][j] > 0) {
        addEdge(`P${i}`, `R${j}`)
      }
    }
  }

  // Rj -> Pk: resource currently held by process
  for (const k of unfinished) {
    for (let j = 0; j < numResources; j++) {
      if (allocationMatrix[k][j] > 0) {
        addEdge(`R${j}`, `P${k}`)
      }
    }
  }

  // DFS cycle finder
  const visited = new Set()
  const recStack = new Set()
  let cyclePath = []

  const dfs = (node, path) => {
    visited.add(node)
    recStack.add(node)
    path.push(node)

    const neighbors = adj.get(node) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, path)) return true
      } else if (recStack.has(neighbor)) {
        const cycleStartIndex = path.indexOf(neighbor)
        cyclePath = path.slice(cycleStartIndex).concat(neighbor)
        return true
      }
    }

    path.pop()
    recStack.delete(node)
    return false
  }

  for (const i of unfinished) {
    const startNode = `P${i}`
    if (!visited.has(startNode)) {
      if (dfs(startNode, [])) break
    }
  }

  if (cyclePath.length > 0) {
    const cycleNodes = new Set(cyclePath)
    const cycleEdges = new Set()
    for (let idx = 0; idx < cyclePath.length - 1; idx++) {
      cycleEdges.add(`${cyclePath[idx]}->${cyclePath[idx + 1]}`)
    }

    const cycleProcesses = cyclePath.filter((n) => n.startsWith('P')).map((n) => parseInt(n.slice(1), 10))
    const cycleResources = cyclePath.filter((n) => n.startsWith('R')).map((n) => parseInt(n.slice(1), 10))

    return {
      hasCycle: true,
      cycleProcesses: [...new Set(cycleProcesses)],
      cycleResources: [...new Set(cycleResources)],
      cycleNodes,
      cycleEdges,
      cyclePath,
      cyclePathText: cyclePath.join(' ➔ '),
    }
  }

  return {
    hasCycle: false,
    cycleProcesses: [],
    cycleResources: [],
    cycleNodes: new Set(),
    cycleEdges: new Set(),
    cyclePath: [],
    cyclePathText: '',
  }
}

/**
 * Evaluates the 4 Coffman conditions based on current system state and prevention settings.
 */
export function evaluateCoffmanConditions(
  available,
  maxMatrix,
  allocationMatrix,
  isSafe,
  circularWaitInfo,
  prevention = {}
) {
  const needMatrix = calculateNeedMatrix(maxMatrix, allocationMatrix)

  // 1. Mutual Exclusion
  const mutualExclusion = {
    id: 'mutual_exclusion',
    name: 'Mutual Exclusion',
    conditionMet: !prevention.allowSharing,
    prevented: !!prevention.allowSharing,
    description: prevention.allowSharing
      ? 'Virtualization (Spooling) active: Resource instances can be multiplexed concurrently.'
      : 'Active: Non-sharable resources held exclusively by individual processes.',
    preventionName: 'Resource Virtualization (Spooling)',
  }

  // 2. Hold and Wait
  const holdsAndWaits = allocationMatrix.some(
    (row, i) => row.some((a) => a > 0) && needMatrix[i]?.some((n) => n > 0)
  )
  const holdAndWait = {
    id: 'hold_and_wait',
    name: 'Hold and Wait',
    conditionMet: holdsAndWaits && !prevention.forceAllAtOnce,
    prevented: !!prevention.forceAllAtOnce,
    description: prevention.forceAllAtOnce
      ? 'All-or-Nothing rule enforced: Processes cannot hold partial resources while waiting.'
      : holdsAndWaits
      ? 'Active: Processes hold allocated instances while waiting for additional requested units.'
      : 'Inactive: No process is concurrently holding while requesting.',
    preventionName: 'Force All-at-Once Allocation',
  }

  // 3. No Preemption
  const noPreemption = {
    id: 'no_preemption',
    name: 'No Preemption',
    conditionMet: !prevention.allowPreemption,
    prevented: !!prevention.allowPreemption,
    description: prevention.allowPreemption
      ? 'Preemption Active: Waiting processes surrender held resources back to the pool.'
      : 'Active: Resources cannot be forcibly revoked until the holding process completes.',
    preventionName: 'Allow Preemptive Release',
  }

  // 4. Circular Wait
  const circularWait = {
    id: 'circular_wait',
    name: 'Circular Wait',
    conditionMet: circularWaitInfo.hasCycle && !prevention.resourceOrdering,
    prevented: !!prevention.resourceOrdering || !circularWaitInfo.hasCycle,
    description: prevention.resourceOrdering
      ? 'Strict Resource Hierarchy enforced: Circular dependency cycles mathematically impossible.'
      : circularWaitInfo.hasCycle
      ? `Active: Circular loop detected (${circularWaitInfo.cyclePathText}).`
      : 'Inactive: No closed dependency loop exists in the wait-for graph.',
    preventionName: 'Total Resource Ordering',
  }

  const conditions = [mutualExclusion, holdAndWait, noPreemption, circularWait]
  const allConditionsMet = conditions.every((c) => c.conditionMet)

  return {
    conditions,
    allConditionsMet,
    deadlockOccurring: allConditionsMet && !isSafe,
  }
}

/**
 * Applies active prevention strategies to calculate simulated recovery state.
 */
export function applyPreventionStrategy(available, maxMatrix, allocationMatrix, prevention = {}) {
  let simAvailable = [...available]
  let simAllocation = allocationMatrix.map((r) => [...r])
  let log = []

  const needMatrix = calculateNeedMatrix(maxMatrix, allocationMatrix)
  const numResources = available.length

  // Preemption strategy: any process that cannot satisfy its Need immediately yields held allocations
  if (prevention.allowPreemption) {
    let preemptedCount = 0
    simAllocation.forEach((row, pIdx) => {
      const pNeed = needMatrix[pIdx]
      const isBlocked = pNeed.some((n, r) => n > simAvailable[r])
      const holdsResources = row.some((a) => a > 0)

      if (isBlocked && holdsResources) {
        for (let r = 0; r < numResources; r++) {
          simAvailable[r] += row[r]
          row[r] = 0
        }
        preemptedCount++
        log.push(`P${pIdx} preempted: yielded held resources to Available pool.`)
      }
    })
    if (preemptedCount > 0) {
      log.unshift(`Preemption active: ${preemptedCount} blocked processes surrendered their allocations.`)
    }
  }

  // Force All-at-Once Allocation: partial holdings released if entire need cannot be satisfied
  if (prevention.forceAllAtOnce) {
    let releasedCount = 0
    simAllocation.forEach((row, pIdx) => {
      const pNeed = needMatrix[pIdx]
      const cannotSatisfyAll = pNeed.some((n, r) => n > simAvailable[r])
      const holdsResources = row.some((a) => a > 0)

      if (cannotSatisfyAll && holdsResources) {
        for (let r = 0; r < numResources; r++) {
          simAvailable[r] += row[r]
          row[r] = 0
        }
        releasedCount++
        log.push(`P${pIdx} holdings cleared: All-or-Nothing rule requires total availability.`)
      }
    })
    if (releasedCount > 0) {
      log.unshift(`Hold & Wait broken: ${releasedCount} processes returned partial holdings.`)
    }
  }

  // Resource Ordering: simulates sorting requests strictly so no backward dependency can form
  if (prevention.resourceOrdering) {
    log.push('Strict Resource Ordering active: Processes request resources in monotonically increasing order.')
  }

  return {
    available: simAvailable,
    allocation: simAllocation,
    max: maxMatrix,
    log,
  }
}
