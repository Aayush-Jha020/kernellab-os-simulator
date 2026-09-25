# KernelLab — OS Simulator Suite

> An interactive, web-based educational suite designed to visualize core Operating Systems concepts in real time.

---

## ✨ Overview

**KernelLab** brings OS theory to life through animated, step-by-step visual simulations. Whether you're studying for an exam or teaching a class, each module lets you configure real inputs, watch algorithms execute tick-by-tick, and explore edge cases through curated presets — all inside a modern dark-themed UI.

---

## 📦 Modules

### 🖥️ Module 1 — CPU Scheduling Simulator

Visualize how the OS decides which process runs on the CPU.

| Algorithms |
|---|
| First-Come, First-Served (FCFS) |
| Shortest Job First (SJF — Non-preemptive) |
| Shortest Remaining Time First (SRTF — Preemptive) |
| Round Robin (configurable quantum) |
| Priority Scheduling (preemptive) |

**Features:**
- 🎬 **Interactive playback controls** — play, pause, step forward/backward through every clock tick
- 📊 **Live Gantt chart** — builds block-by-block as the simulation progresses
- 🕒 **Digital clock display** — shows current simulation time at a glance
- 📋 **Process state containers** — real-time Job Pool, Ready Queue, Running, and Terminated panels
- ⚡ **Preset workloads** — one-click scenarios including Priority Inversion, RR Quantum Sensitivity, and Context Switch Heavy

---

### 🗂️ Module 2 — Memory Page Replacement Visualizer

Understand how the OS manages physical memory frames under page faults.

| Algorithms |
|---|
| First-In, First-Out (FIFO) |
| Least Recently Used (LRU) |
| Optimal Page Replacement |

**Features:**
- 🔢 **Step-by-step frame matrix** — shows the exact state of every memory frame at each reference
- 🟢🔴 **Hit / fault color accents** — instantly distinguish page hits from costly faults
- 🔬 **Belady's Anomaly preset** — demonstrate the counter-intuitive FIFO anomaly in one click
- 📈 **Hit ratio metrics** — total hits, total faults, and hit ratio summary panel

---

### 💾 Module 3 — Disk Scheduling Simulator

See how the disk head moves across cylinders to service I/O requests.

| Algorithms |
|---|
| First-Come, First-Served (FCFS) |
| Shortest Seek Time First (SSTF) |
| SCAN (Elevator) |
| C-SCAN (Circular SCAN) |
| LOOK |
| C-LOOK |

**Features:**
- 📉 **Interactive SVG trajectory chart** — animated head movement path drawn in real time
- 🔢 **Cylinder distance calculations** — per-step seek distances and running totals
- 🎯 **Preset test cases** — including High Locality, Thrashing Simulation, and Sequential Access patterns
- ↔️ **Direction control** — configure initial head position and sweep direction for SCAN/LOOK variants

---

### 🔒 Module 4 — Deadlock Avoidance (Banker's Algorithm)

Determine whether a system state is safe and simulate resource requests.

**Features:**
- ✅ **Safety state detection** — runs the Banker's Safety Algorithm and reports safe/unsafe verdict instantly
- 📐 **Derived Need Matrix table** — auto-computed from Max − Allocation with full matrix display
- 🪜 **Step-by-step evaluation trace** — shows Work vector progression, each process check, and execution order
- 🧪 **Interactive Resource Request simulator** — test any process's resource request and see whether it can be safely granted

---

## 🛠️ Tech Stack

| Technology | Role |
|---|---|
| React 18 | UI component framework |
| Vite | Lightning-fast dev server & bundler |
| Tailwind CSS | Utility-first styling |
| Lucide React | Icon library |

---

## 🚀 Getting Started

### Prerequisites

- Node.js v18 or higher
- npm v9 or higher

### Installation

```bash
npm install
```

### Local Development

```bash
npm run dev
```

Opens the app at `http://localhost:5173` with hot-module replacement.

### Production Build

```bash
npm run build
```

Outputs an optimized static bundle to the `dist/` directory.

---

## 📁 Project Structure

```
cp_OS/
├── public/
├── src/
│   ├── components/
│   │   ├── CPUScheduler.jsx        # Module 1 — CPU Scheduling
│   │   ├── PageReplacement.jsx     # Module 2 — Page Replacement
│   │   ├── DiskScheduling.jsx      # Module 3 — Disk Scheduling
│   │   └── BankerAlgorithm.jsx     # Module 4 — Deadlock Avoidance
│   ├── utils/
│   │   ├── cpuAlgorithms.js        # FCFS, SJF, SRTF, RR, Priority logic
│   │   ├── pageAlgorithms.js       # FIFO, LRU, Optimal logic
│   │   ├── diskAlgorithms.js       # FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK logic
│   │   └── bankerAlgorithms.js     # Banker's safety & request evaluation logic
│   ├── App.jsx                     # Root layout & sidebar navigation
│   ├── main.jsx                    # React DOM entry point
│   └── index.css                   # Global styles & Tailwind directives
├── index.html
├── vite.config.js
└── package.json
```

---

## 📜 License

This project is open source and available under the MIT License.
