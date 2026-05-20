import { useEffect, useRef, useState } from 'react';
import { HighwaySimulation } from './simulation';
import { AnalyticsReport, SimulationConfig } from './types';
import ControlOverlay from './components/ControlOverlay';
import ReportModal from './components/ReportModal';
import { AnimatePresence } from 'motion/react';
import { 
  BarChart2, 
  Settings, 
  Activity, 
  Cpu
} from 'lucide-react';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sidebarPaneRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<HighwaySimulation | null>(null);

  // Statistics updated on each frame from ThreeJS loop
  const [stats, setStats] = useState({
    activeCars: 0,
    avgSpeed: 100,
    incidentActive: false,
    crashedCount: 0,
    vmsStatus: false,
  });

  // Current config state (for cameras syncing)
  const [config, setConfig] = useState<SimulationConfig>({
    mode: 'highway',
    avgSpeed: 100,
    attentionLevel: 0.6,
    safeFollowingGap: 1.2,
    trafficDensity: 30,
    vmsDistance: 500,
    cameraView: 'free',
    trafficLightAuto: true,
    trafficLightDuration: 12,
  });

  // Analytics Report Card
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Specialist Tool Stats Indicators
  const [elapsed, setElapsed] = useState("00:00:00:00");
  const [latency, setLatency] = useState("1.1ms");
  const [fps, setFps] = useState(60);

  // Live Timer & Latency & Frame simulation
  useEffect(() => {
    let frame = 0;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const ms = Date.now() - startTime;
      const hrs = Math.floor(ms / 3600000).toString().padStart(2, '0');
      const mins = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
      const secs = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
      frame = (frame + 1) % 60;
      setElapsed(`${hrs}:${mins}:${secs}:${frame.toString().padStart(2, '0')}`);
    }, 16);

    const latencyInterval = setInterval(() => {
      setLatency(`${(0.8 + Math.random() * 0.5).toFixed(1)}ms`);
      setFps(Math.floor(58 + Math.random() * 3));
    }, 1200);

    return () => {
      clearInterval(interval);
      clearInterval(latencyInterval);
    };
  }, []);

  // Initialize Simulator on Mount
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Callbacks from WebGL loop
    const onStatsUpdate = (newStats: typeof stats) => {
      setStats(newStats);
      if (simRef.current) {
        // Sync camera config state reactively so buttons shine
        const internalConfig = simRef.current.config;
        setConfig((prev) => {
          if (prev.cameraView !== internalConfig.cameraView) {
            return { ...prev, cameraView: internalConfig.cameraView };
          }
          return prev;
        });
      }
    };

    const onReportGenerated = (newReport: AnalyticsReport) => {
      setReport(newReport);
      setShowReport(true);
    };

    const sim = new HighwaySimulation(
      canvasRef.current,
      containerRef.current,
      onStatsUpdate,
      onReportGenerated,
      sidebarPaneRef.current || undefined
    );
    simRef.current = sim;

    // Sync initial configuration in state
    setConfig({ ...sim.config });

    return () => {
      if (simRef.current) {
        simRef.current.destroy();
        simRef.current = null;
      }
    };
  }, []);

  const handleCameraChange = (view: SimulationConfig['cameraView']) => {
    if (simRef.current) {
      simRef.current.config.cameraView = view;
      setConfig((prev) => ({ ...prev, cameraView: view }));
    }
  };

  const handleModeChange = (mode: 'highway' | 'intersection') => {
    if (simRef.current) {
      simRef.current.setMode(mode);
      setConfig((prev) => ({ 
        ...prev, 
        mode, 
        cameraView: mode === 'highway' ? 'free' : 'intersection' 
      }));
    }
  };

  const handleTriggerCrash = () => {
    if (simRef.current) {
      simRef.current.triggerRandomCrash();
    }
  };

  const handleClearAccident = () => {
    if (simRef.current) {
      simRef.current.clearAccident();
      setShowReport(false);
    }
  };

  return (
    <div 
      className="bg-[#0f1115] text-[#e0e0e0] font-sans w-full h-screen flex flex-col overflow-hidden select-none"
      id="app-container"
    >
      {/* 1. Technical Header Section */}
      <header className="h-14 bg-[#1a1d23] border-b border-[#30363d] flex items-center justify-between px-6 shrink-0 select-none z-10">
        <div className="flex items-center gap-4">
          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center`}>
            <span className={`absolute w-3 h-3 rounded-full ${stats.incidentActive ? 'bg-red-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
            <span className={`relative w-2 h-2 rounded-full ${stats.incidentActive ? 'bg-red-500' : 'bg-emerald-500'}`} />
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-bold tracking-widest uppercase text-white font-mono flex items-center gap-1.5 label-spacing">
              <Cpu size={14} className={stats.incidentActive ? 'text-red-500' : 'text-emerald-400'} />
              Expressway Operations Console
            </h1>
            <span className="hidden sm:inline text-[9px] bg-[#30363d] px-2 py-0.5 rounded text-[#8e9299] font-mono tracking-wider font-extrabold">
              SYSTEM v4.0.2
            </span>
            {/* Mode selection tabs */}
            <div className="flex gap-1 bg-[#101216] p-1 rounded-md border border-[#30363d] ml-3 select-none">
              <button
                onClick={() => handleModeChange('highway')}
                className={`cursor-pointer px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase transition-all ${
                  config.mode === 'highway'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                國道模擬 🛣️
              </button>
              <button
                onClick={() => handleModeChange('intersection')}
                className={`cursor-pointer px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase transition-all ${
                  config.mode === 'intersection'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                路口模擬 🚦
              </button>
            </div>
          </div>
        </div>

        {/* Real-time Dashboard Metadata */}
        <div className="flex items-center gap-6 text-[11px] font-mono select-none">
          <div className="hidden md:block">
            <span className="text-[#8e9299]">ELAPSED:</span> <span className="text-white font-bold">{elapsed}</span>
          </div>
          <div className="hidden sm:block">
            <span className="text-[#8e9299]">FLOW:</span> <span className="text-white font-bold">{config.trafficDensity} VEH/M</span>
          </div>
          <div>
            <span className="text-[#8e9299]">DELAY:</span> <span className="text-white font-bold">{latency}</span>
          </div>
          <div className="hidden lg:block">
            <span className="text-[#8e9299]">CORE:</span> <span className="text-emerald-400 font-bold">{fps} FPS</span>
          </div>
        </div>
      </header>

      {/* 2. Flex Row Operational Area */}
      <main className="flex flex-1 overflow-hidden relative">
        
        {/* Left side: Render 3D Canvas Viewport */}
        <div className="flex-1 relative bg-[#0d0e12] overflow-hidden">
          
          <div 
            ref={containerRef} 
            className="w-full h-full"
            id="webgl-container"
          >
            <canvas ref={canvasRef} className="block w-full h-full" />
          </div>

          {/* Primary Viewport UI overlay HUD */}
          <ControlOverlay
            stats={stats}
            config={config}
            onCameraChange={handleCameraChange}
            onTriggerCrash={handleTriggerCrash}
            onClearAccident={handleClearAccident}
          />

          {/* Floater: Re-open report card */}
          {report && !showReport && (
            <button
              onClick={() => setShowReport(true)}
              className="absolute left-6 top-6 pointer-events-auto bg-[#1a1d23]/95 border border-[#30363d] hover:bg-[#30363d] text-amber-500 font-bold text-[10px] py-1.5 px-3.5 rounded-lg shadow-2xl z-20 flex items-center gap-1.5 cursor-pointer transition-all font-mono uppercase tracking-wider hover:border-amber-500/20"
              id="reopen-report-floating-btn"
            >
              <BarChart2 size={13} /> View Incident Evaluation
            </button>
          )}
        </div>

        {/* Right side: Parameter Pane Sidebar */}
        <aside className="w-80 bg-[#1a1d23] border-l border-[#30363d] flex flex-col overflow-hidden shrink-0 select-none z-10">
          <div className="p-4 border-b border-[#30363d] flex items-center justify-between bg-[#15181e]">
            <div className="flex items-center gap-2">
              <Settings size={13} className="text-amber-500 animate-spin-slow" />
              <span className="text-xs font-bold font-mono text-white tracking-wider uppercase">模擬參數變數</span>
            </div>
            <span className="text-[9px] bg-[#30363d] text-slate-400 px-1.5 py-0.5 rounded font-mono">HIL ENGINE</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            <div className="text-[10px] text-[#8e9299] leading-relaxed font-mono bg-[#16181d] p-3 rounded-lg border border-[#30363d]/50">
              即時模擬器人因因子（專注度、隨機反應時延、安全緩距）及基礎設施（看板警告距離），車流運行時將讀取反映相應變動。
            </div>
            
            {/* Tweakpane injected target */}
            <div 
              ref={sidebarPaneRef}
              id="tweakpane-container" 
              className="w-full"
            />
          </div>
        </aside>

      </main>

      {/* 3. Bottom Status Bar */}
      <footer className="h-8 bg-[#0f1115] border-t border-[#30363d] flex items-center justify-between px-6 text-[10px] text-[#8e9299] font-mono select-none shrink-0 z-10">
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-1.5">
            <Activity size={10} className="text-[#8e9299]" />
            GRID: <span className="text-white">x-length: 3000 K-Units</span>
          </span>
          <span className="hidden sm:inline border-r border-[#30363d] h-3" />
          <span className="hidden sm:inline">
            SYSTEM_SEED: <span className="text-white">8849-AFX-2026</span>
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Visitor Counter (vercount / busuanzi) */}
          <span
            id="busuanzi_container_site_pv"
            style={{ display: 'none' }}
            className="flex items-center gap-1 text-[9px] font-mono text-[#8e9299] border border-[#30363d] px-2 py-0.5 rounded"
          >
            <span className="text-[10px]">👁</span>
            <span className="text-[#6b7280]">PV:</span>
            <span id="busuanzi_value_site_pv" className="text-amber-400 font-bold" />
          </span>
          <span
            id="busuanzi_container_site_uv"
            style={{ display: 'none' }}
            className="flex items-center gap-1 text-[9px] font-mono text-[#8e9299] border border-[#30363d] px-2 py-0.5 rounded"
          >
            <span className="text-[10px]">👤</span>
            <span className="text-[#6b7280]">UV:</span>
            <span id="busuanzi_value_site_uv" className="text-emerald-400 font-bold" />
          </span>

          <span className="border-r border-[#30363d] h-3" />

          <span className={`w-1.5 h-1.5 rounded-full ${stats.incidentActive ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
          <span className="uppercase text-[9px] tracking-wider text-slate-400 font-bold">
            {stats.incidentActive ? '⚠ Incident Warning State Broadcasted' : '● Grid Normal Operations'}
          </span>
        </div>
      </footer>

      {/* 4. Incident Analytics Modal */}
      <AnimatePresence>
        {showReport && (
          <ReportModal
            report={report}
            onClose={() => setShowReport(false)}
            onResetSimulation={handleClearAccident}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
