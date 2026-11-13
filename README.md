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

### 💾 Module 3 — Disk Simulator Engine (HDD & NVMe)

Analyze modern storage hardware mechanics and I/O request sequencing.

| Features & Models |
|---|
| **Classical Disk Scheduling:** FCFS, SSTF, SCAN (Elevator), C-SCAN, LOOK, C-LOOK |
| **Zone Bit Recording (ZBR):** Physical variable-sector track density simulation |
| **Dual-Actuator HDD Mechanics:** Parallel head sweep coordination |
| **Multi-Channel NVMe SSD Parallelism:** High-speed flash channel bandwidth and queue routing |

**Features:**
- 📉 **Interactive SVG trajectory charts** — animated head movement path and seek-time tracking
- ⚡ **Hardware physics engines** — models seek latency, rotational delay, and flash bandwidth transfer speeds
- 🎯 **Preset test cases** — High Locality, Thrashing Simulation, and Sequential Access workloads

---

### 🔒 Module 4 — Deadlock Avoidance & Concurrency Diagnostics

Analyze system safety, resource allocation graphs, and structural conditions for deadlocks.

**Features:**
- ✅ **Banker's Algorithm & Request Simulator** — test safety states, auto-compute the Need Matrix, and evaluate custom resource requests
- 🕸️ **Interactive Resource Allocation Graph (RAG)** — visual node-edge mapping of process-resource allocation and wait-for states
- 🔍 **Coffman Conditions Diagnostics** — active structural analysis across Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait

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

```text
cp_OS/
├── public/
├── src/
│   ├── components/
│   │   ├── CPUScheduler.jsx              # Module 1 — CPU Scheduling
│   │   ├── PageReplacement.jsx           # Module 2 — Page Replacement
│   │   ├── DiskScheduling.jsx            # Module 3 — Disk Scheduling
│   │   ├── BankerAlgorithm.jsx           # Module 4 — Banker's Algorithm
│   │   ├── DeadlockAvoidance.jsx         # Module 4 Container
│   │   ├── RAGVisualizer.jsx             # Resource Allocation Graph component
│   │   ├── CoffmanConditionsPanel.jsx    # Coffman conditions diagnostic panel
│   │   └── NVMeVisualizer.jsx            # NVMe multi-channel flash visualizer
│   ├── utils/
│   │   ├── cpuAlgorithms.js              # FCFS, SJF, SRTF, RR, Priority logic
│   │   ├── pageAlgorithms.js             # FIFO, LRU, Optimal logic
│   │   ├── diskAlgorithms.js             # Classical disk scheduling logic
│   │   ├── diskPhysicsEngine.js          # ZBR, Dual-Actuator, & NVMe physics
│   │   └── bankersEngine.js              # Safety & request evaluation logic
│   ├── App.jsx                           # Root layout & sidebar navigation
│   ├── main.jsx                          # React DOM entry point
│   └── index.css                         # Global styles & Tailwind directives
├── index.html
├── vite.config.js
└── package.json
```

---

## 📜 License

This project is open source and available under the MIT License.