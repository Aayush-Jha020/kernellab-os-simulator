/**
 * diskPhysicsEngine.js
 * Zone Bit Recording (ZBR) physics, dual-head (MACH.2) scheduling,
 * and realtime simulation tick generator for the KernelLab Disk Module.
 */

// ---------------------------------------------------------------------------
// ZBR Zone Definitions (for a 200-cylinder disk, cylinders 0–199)
// ---------------------------------------------------------------------------
const ZBR_ZONES = [
  {
    id: 'OUTER',
    label: 'Outer Zone',
    min: 0,
    max: 65,
    sectors: 32,
    color: '#22d3ee',      // cyan
    colorDim: '#0e7490',
    description: 'High density – 32 sectors/track, faster raw transfer',
    transferSpeedMBs: 180,
  },
  {
    id: 'MIDDLE',
    label: 'Middle Zone',
    min: 66,
    max: 132,
    sectors: 24,
    color: '#a78bfa',      // violet
    colorDim: '#6d28d9',
    description: 'Medium density – 24 sectors/track',
    transferSpeedMBs: 140,
  },
  {
    id: 'INNER',
    label: 'Inner Zone',
    min: 133,
    max: 199,
    sectors: 16,
    color: '#f59e0b',      // amber
    colorDim: '#92400e',
    description: 'Low density – 16 sectors/track, slower raw transfer',
    transferSpeedMBs: 90,
  },
];

/**
 * getCylinderRadius(cylinder, maxRadius, minRadius)
 * Unified radius formula — cylinder 0 = outermost (maxRadius),
 * cylinder 199 = innermost (minRadius).
 * Used by both the actuator arm tip and request dots so they always align.
 */
export function getCylinderRadius(cylinder, maxRadius = 180, minRadius = 50) {
  const clamped = Math.max(0, Math.min(199, cylinder));
  return maxRadius - (clamped / 199) * (maxRadius - minRadius);
}

/**
 * getZoneInfo(cylinder)
 * Returns the ZBR zone object for a given cylinder number.
 */
export function getZoneInfo(cylinder) {
  const cyl = Math.max(0, Math.min(199, Math.round(cylinder)));
  return ZBR_ZONES.find((z) => cyl >= z.min && cyl <= z.max) ?? ZBR_ZONES[2];
}

/** Expose zone definitions for UI rendering */
export const ZONES = ZBR_ZONES;

// ---------------------------------------------------------------------------
// Helper – run one of the standard algorithms on a sub-queue
// ---------------------------------------------------------------------------
function runAlgorithmOnQueue(requests, head, algorithm) {
  if (requests.length === 0) return [head];

  const sorted = [...requests].sort((a, b) => a - b);

  switch (algorithm) {
    case 'SSTF': {
      let cur = head;
      const pending = [...requests];
      const seq = [cur];
      while (pending.length > 0) {
        let best = 0;
        let bestDist = Math.abs(pending[0] - cur);
        for (let i = 1; i < pending.length; i++) {
          const d = Math.abs(pending[i] - cur);
          if (d < bestDist) { bestDist = d; best = i; }
        }
        cur = pending[best];
        seq.push(cur);
        pending.splice(best, 1);
      }
      return seq;
    }
    case 'SCAN':
    case 'LOOK': {
      const left = sorted.filter((r) => r <= head).reverse();
      const right = sorted.filter((r) => r > head);
      return [head, ...left, ...right];
    }
    case 'C-SCAN':
    case 'C-LOOK': {
      const right = sorted.filter((r) => r >= head);
      const left  = sorted.filter((r) => r < head);
      return [head, ...right, ...left];
    }
    case 'FCFS':
    default:
      return [head, ...requests];
  }
}

// ---------------------------------------------------------------------------
// calculateDualHeadSchedule
// ---------------------------------------------------------------------------
/**
 * Splits all requests between two actuator arms:
 *   Arm 0 -> cylinders 0-99
 *   Arm 1 -> cylinders 100-199
 */
export function calculateDualHeadSchedule(requests, initialHead, algorithm = 'SCAN') {
  const head0 = Math.min(99, Math.max(0, initialHead));
  const head1 = Math.max(100, Math.min(199, initialHead > 99 ? initialHead : 100));

  const arm0Requests = requests.filter((r) => r <= 99);
  const arm1Requests = requests.filter((r) => r >= 100);

  const seq0 = runAlgorithmOnQueue(arm0Requests, head0, algorithm);
  const seq1 = runAlgorithmOnQueue(arm1Requests, head1, algorithm);

  const seek0 = seq0.reduce((s, v, i) => (i === 0 ? 0 : s + Math.abs(v - seq0[i - 1])), 0);
  const seek1 = seq1.reduce((s, v, i) => (i === 0 ? 0 : s + Math.abs(v - seq1[i - 1])), 0);

  const maxLen = Math.max(seq0.length, seq1.length);
  const combinedSteps = [];
  let tick = 0;

  for (let i = 0; i < maxLen - 1; i++) {
    if (i < seq0.length - 1) {
      combinedSteps.push({
        tick: tick++,
        arm: 0,
        from: seq0[i],
        to: seq0[i + 1],
        distance: Math.abs(seq0[i + 1] - seq0[i]),
        zone: getZoneInfo(seq0[i + 1]),
      });
    }
    if (i < seq1.length - 1) {
      combinedSteps.push({
        tick: tick++,
        arm: 1,
        from: seq1[i],
        to: seq1[i + 1],
        distance: Math.abs(seq1[i + 1] - seq1[i]),
        zone: getZoneInfo(seq1[i + 1]),
      });
    }
  }

  const singleHeadSeek = seek0 + seek1;
  const parallelSeek   = Math.max(seek0, seek1);
  const timeSavedCylinders = singleHeadSeek - parallelSeek;
  const parallelEfficiency = singleHeadSeek > 0
    ? ((timeSavedCylinders / singleHeadSeek) * 100).toFixed(1)
    : '0.0';

  return {
    arm0: { head: head0, requests: arm0Requests, sequence: seq0, totalSeek: seek0 },
    arm1: { head: head1, requests: arm1Requests, sequence: seq1, totalSeek: seek1 },
    combinedSteps,
    timeSavedCylinders,
    parallelEfficiency,
  };
}

// ---------------------------------------------------------------------------
// Controller State Machine constants
// ---------------------------------------------------------------------------
export const CTRL_STATES = {
  IDLE:              'IDLE',
  SEEKING:           'SEEKING',
  ROTATIONAL_SETTLE: 'ROTATIONAL_SETTLE',
  DATA_TRANSFER:     'DATA_TRANSFER',
  COMPLETED:         'COMPLETED',
};

// ---------------------------------------------------------------------------
// calculateRealtimeTicks
// ---------------------------------------------------------------------------
export function calculateRealtimeTicks(
  requests,
  initialHead,
  algorithm  = 'SCAN',
  isDualHead = false,
  rotationalRPM = 7200,
) {
  const ticks = [];
  let tickIndex = 0;

  const push = (state, headPos, target, arm, reqIdx, totalReqs, progressPct) => {
    ticks.push({
      tickIndex: tickIndex++,
      state,
      arm,
      headPosition: Math.round(headPos),
      targetCylinder: target,
      zone: getZoneInfo(Math.round(headPos)),
      progressPct: Math.min(100, Math.max(0, progressPct)),
      requestIndex: reqIdx,
      totalRequests: totalReqs,
    });
  };

  const settleTicks = rotationalRPM >= 10000 ? 1 : rotationalRPM >= 7200 ? 2 : 3;

  if (isDualHead) {
    const schedule = calculateDualHeadSchedule(requests, initialHead, algorithm);
    const { arm0, arm1 } = schedule;

    const processArm = (seq, armId) => {
      const total = seq.length - 1;
      for (let i = 0; i < seq.length - 1; i++) {
        const from = seq[i];
        const to   = seq[i + 1];
        const dist = Math.abs(to - from);
        const seekTicks = Math.max(1, Math.min(8, Math.round(dist / 12)));
        const zone = getZoneInfo(to);

        for (let t = 0; t < seekTicks; t++) {
          const pct = (t + 1) / seekTicks;
          const pos = from + (to - from) * pct;
          push(CTRL_STATES.SEEKING, pos, to, armId, i, total, pct * 100);
        }
        for (let s = 0; s < settleTicks; s++) {
          push(CTRL_STATES.ROTATIONAL_SETTLE, to, to, armId, i, total, 100);
        }
        const xferTicks = zone.id === 'OUTER' ? 3 : zone.id === 'MIDDLE' ? 2 : 1;
        for (let x = 0; x < xferTicks; x++) {
          push(CTRL_STATES.DATA_TRANSFER, to, to, armId, i, total, 100);
        }
      }
    };

    processArm(arm0.sequence, 0);
    processArm(arm1.sequence, 1);
  } else {
    const seq = runAlgorithmOnQueue(requests, initialHead, algorithm);
    const total = seq.length - 1;

    if (total === 0) {
      push(CTRL_STATES.IDLE, initialHead, null, 0, 0, 0, 0);
    } else {
      push(CTRL_STATES.IDLE, initialHead, null, 0, 0, total, 0);

      for (let i = 0; i < seq.length - 1; i++) {
        const from = seq[i];
        const to   = seq[i + 1];
        const dist = Math.abs(to - from);
        const seekTicks = Math.max(1, Math.min(8, Math.round(dist / 12)));
        const zone = getZoneInfo(to);

        for (let t = 0; t < seekTicks; t++) {
          const pct = (t + 1) / seekTicks;
          const pos = from + (to - from) * pct;
          push(CTRL_STATES.SEEKING, pos, to, 0, i, total, pct * 100);
        }
        for (let s = 0; s < settleTicks; s++) {
          push(CTRL_STATES.ROTATIONAL_SETTLE, to, to, 0, i, total, 100);
        }
        const xferTicks = zone.id === 'OUTER' ? 3 : zone.id === 'MIDDLE' ? 2 : 1;
        for (let x = 0; x < xferTicks; x++) {
          push(CTRL_STATES.DATA_TRANSFER, to, to, 0, i, total, 100);
        }
      }
    }

    push(CTRL_STATES.COMPLETED, seq[seq.length - 1], null, 0, total, total, 100);
  }

  return ticks;
}
