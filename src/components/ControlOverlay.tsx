import { useState } from 'react';
import { 
  Gauge, 
  Car, 
  AlertTriangle, 
  Camera, 
  Zap, 
  Trash2, 
  BookOpen, 
  Milestone,
  Fingerprint
} from 'lucide-react';
import { SimulationConfig } from '../types';

interface ControlOverlayProps {
  stats: {
    activeCars: number;
    avgSpeed: number;
    incidentActive: boolean;
    crashedCount: number;
    vmsStatus: boolean;
    ewLightState?: 'green' | 'yellow' | 'red';
    nsLightState?: 'green' | 'yellow' | 'red';
    pedestrianActive?: boolean;
  };
  config: SimulationConfig;
  onCameraChange: (view: SimulationConfig['cameraView']) => void;
  onTriggerCrash: () => void;
  onClearAccident: () => void;
}

export default function ControlOverlay({
  stats,
  config,
  onCameraChange,
  onTriggerCrash,
  onClearAccident
}: ControlOverlayProps) {
  const [showGuide, setShowGuide] = useState(true);

  return (
    <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-3 md:p-6 font-sans select-none overflow-hidden">
      
      {/* --- TOP BANNER HUD: STATS PANEL & SIGNBOARD EXPLANATION --- */}
      <div className="w-full flex flex-col xl:flex-row gap-2 md:gap-4 items-start justify-between pointer-events-auto">
        
        {/* Real-time Diagnostics HUD */}
        <div className="bg-[#1a1d23]/95 border border-[#30363d] backdrop-blur-md rounded-xl p-3 md:p-4 shadow-2xl flex gap-3 md:gap-6 items-center flex-wrap md:flex-nowrap w-full xl:w-auto">
          {/* Logo Title */}
          <div className="border-r border-[#30363d] pr-3 md:pr-5">
            <h1 className="text-[10px] md:text-sm font-extrabold text-white tracking-widest uppercase flex items-center gap-1.5 font-mono">
              <Milestone className="text-amber-500" size={14} />
              <span className="hidden xs:inline">{config.mode === 'highway' ? 'EXPRESSWAY 3D' : 'SMART INTERSECTION'}</span>
              <span className="xs:hidden">{config.mode === 'highway' ? 'EXPWY' : 'INTSEC'}</span>
            </h1>
            <p className="text-[8px] md:text-[9px] font-mono text-[#8e9299] mt-0.5 tracking-wider uppercase font-semibold">
              {config.mode === 'highway' ? 'CRASH SIM' : 'SMART JUNCTION'}
            </p>
          </div>

          {/* Metric 1: Live Vehicles count */}
          <div className="flex items-center gap-2 md:gap-2.5">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/15">
              <Car size={14} />
            </div>
            <div>
              <span className="block text-[7px] md:text-[8px] font-semibold text-[#8e9299] uppercase tracking-widest font-mono">
                VEH
              </span>
              <span className="text-xs md:text-base font-extrabold font-mono text-white leading-none">
                {stats.activeCars}
              </span>
            </div>
          </div>

          {/* Metric 2: Avg speed */}
          <div className="flex items-center gap-2 md:gap-2.5">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-400 border border-sky-500/15">
              <Gauge size={14} />
            </div>
            <div>
              <span className="block text-[7px] md:text-[8px] font-semibold text-[#8e9299] uppercase tracking-widest font-mono">
                VEL
              </span>
              <span className="text-xs md:text-base font-extrabold font-mono text-white leading-none">
                {stats.avgSpeed}
              </span>
            </div>
          </div>

          {/* Metric 3: Incident status */}
          <div className="flex items-center gap-2 md:gap-2.5">
            <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center border transition-all ${
              stats.incidentActive 
                ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' 
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15'
            }`}>
              <AlertTriangle size={14} />
            </div>
            <div>
              <span className="block text-[7px] md:text-[8px] font-semibold text-[#8e9299] uppercase tracking-widest font-mono">
                EVENT
              </span>
              <span className={`text-[10px] md:text-xs font-bold leading-none uppercase font-mono ${stats.incidentActive ? 'text-red-400 text-glow-orange' : 'text-emerald-400'}`}>
                {stats.incidentActive ? 'CRASH' : 'OK'}
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Digital Display: VMS billboard for highway, traffic signal cycles for intersection */}
        {config.mode === 'highway' ? (
          <div className="bg-[#1a1d23]/95 border border-[#30363d] rounded-xl p-2 md:p-3 shadow-2xl max-w-sm w-full font-mono flex items-center gap-2 md:gap-3" id="vms-hud-display">
            <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${stats.vmsStatus ? 'bg-orange-500 animate-ping' : 'bg-emerald-500'} flex-shrink-0`} />
            <div className="flex-1">
              <div className="flex justify-between text-[8px] md:text-[9px] text-[#8e9299] mb-1 font-semibold">
                <span>VMS SIGN</span>
                <span className="font-bold tracking-wider">{stats.vmsStatus ? 'WARNING' : 'STANDBY'}</span>
              </div>
              <div className={`text-center py-1 md:py-1.5 px-2 md:px-3 rounded border text-[10px] md:text-xs font-extrabold uppercase tracking-widest ${
                stats.vmsStatus 
                  ? 'bg-orange-950/30 border-orange-500/40 text-orange-400 text-glow-orange' 
                  : 'bg-emerald-950/10 border-emerald-500/30 text-emerald-400 text-glow-green'
              }`}>
                {stats.vmsStatus ? '⚠ 前方車禍 減速慢行 ⚠' : '✔ 國道一號 路網順暢'}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#1a1d23]/95 border border-[#30363d] rounded-xl p-2 md:p-3 shadow-2xl max-w-sm w-full font-mono flex flex-col gap-1 md:gap-1.5" id="signal-hud-display">
            <div className="flex justify-between text-[8px] md:text-[9px] text-[#8e9299] font-semibold select-none">
              <span>CONTROL</span>
              <span className={`${stats.pedestrianActive ? 'text-red-400 animate-pulse' : 'text-emerald-400'} font-bold tracking-widest`}>
                {stats.pedestrianActive ? '🚶 行人中' : '● SIGNAL'}
              </span>
            </div>
            <div className="flex gap-1 md:gap-2 text-[9px] md:text-[10px] uppercase font-bold text-center">
              <div className={`flex-1 py-0.5 md:py-1 px-1.5 md:px-2.5 rounded border transition-colors ${
                stats.ewLightState === 'green' ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400' :
                stats.ewLightState === 'yellow' ? 'bg-yellow-950/25 border-yellow-500/30 text-yellow-500' :
                'bg-red-950/20 border-red-500/30 text-red-500'
              }`}>
                EW: {stats.ewLightState}
              </div>
              <div className={`flex-1 py-0.5 md:py-1 px-1.5 md:px-2.5 rounded border transition-colors ${
                stats.nsLightState === 'green' ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400' :
                stats.nsLightState === 'yellow' ? 'bg-yellow-950/25 border-yellow-500/30 text-yellow-500' :
                'bg-red-950/20 border-red-500/30 text-red-500'
              }`}>
                NS: {stats.nsLightState}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- SIDE & BOTTOM CONTROLS --- */}
      <div className="w-full flex flex-col md:flex-row gap-3 md:gap-4 items-end justify-between">
        
        {/* Human Factor Science Explainer Side Overlay */}
        <div className="pointer-events-auto max-w-sm w-full hidden md:block">
          {showGuide ? (
            <div className="bg-[#1a1d23]/95 border border-[#30363d] backdrop-blur-md rounded-xl p-4 shadow-2xl text-slate-200">
              <div className="flex justify-between items-center border-b border-[#30363d] pb-2 mb-2.5">
                <h3 className="text-[10px] font-bold text-amber-500 tracking-wider uppercase flex items-center gap-1 font-mono">
                  <Fingerprint size={13} /> 
                  智慧跟車人因演算法說明
                </h3>
                <button 
                  onClick={() => setShowGuide(false)}
                  className="text-slate-400 hover:text-white text-[9px] cursor-pointer px-1.5 py-0.5 bg-slate-800 rounded font-mono"
                >
                  HIDE
                </button>
              </div>
              
              <ul className="space-y-2 text-[10px] leading-relaxed text-slate-300 font-mono">
                <li className="flex items-start gap-1">
                  <span className="text-amber-500 font-bold">•</span>
                  <span><strong>巡航跟車：</strong>保持以安全延遲為準的車隊緩衝。</span>
                </li>
                <li className="flex items-start gap-1">
                  <span className="text-amber-500 font-bold">•</span>
                  <span><strong>反應延遲：</strong>前車煞急時，駕駛觀測落差時段為 <code className="text-yellow-400 font-mono">Reaction Time ≈ 0.2 / 專注度</code>。專注度降低會急遽放大連環追尾機率！</span>
                </li>
                <li className="flex items-start gap-1">
                  <span className="text-amber-500 font-bold">•</span>
                  <span><strong>VMS 告示防禦：</strong>當遭遇車禍，電子牌激活預警。車輛開過立牌橫切面，人車專注度瞬間拉高至 100% 提早備煞避難。</span>
                </li>
              </ul>
            </div>
          ) : (
            <button 
              onClick={() => setShowGuide(true)}
              className="bg-[#1a1d23]/95 border border-[#30363d] hover:bg-[#30363d] text-slate-300 text-[10px] py-1.5 px-3 rounded-lg shadow-2xl flex items-center gap-1.5 font-bold cursor-pointer transition-colors font-mono"
            >
              <BookOpen size={13} className="text-amber-500" />
              GUIDE EXPLAINER PANEL
            </button>
          )}
        </div>

        {/* Dynamic Multi-Perspective Camera & Core Action Triggers */}
        <div className="pointer-events-auto flex flex-col gap-2 md:gap-3 w-full md:w-auto">
          
          {/* Camera View Switcher */}
          <div className="bg-[#1a1d23]/95 border border-[#30363d] backdrop-blur-md rounded-xl p-2 md:p-3 shadow-2xl flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[9px] md:text-[10px] font-bold text-[#8e9299] uppercase tracking-widest font-mono flex items-center gap-1 md:gap-1.5 border-r border-[#30363d] pr-2 md:pr-3 select-none shrink-0">
              <Camera size={12} className="text-amber-500" /> CAMERA
            </span>
            <div className="flex gap-1 shrink-0">
              {[
                { id: 'free', label: '自由' },
                { id: 'follow', label: '跟隨' },
                { id: 'vms', label: '看板', cond: config.mode === 'highway' },
                { id: 'accident', label: '事故' },
                { id: 'drone', label: '上帝' },
                { id: 'intersection', label: '路口', cond: config.mode === 'intersection' }
              ].filter(view => view.cond !== false).map((view) => (
                <button
                  key={view.id}
                  onClick={() => onCameraChange(view.id as any)}
                  className={`text-[9px] md:text-[10px] font-bold py-1 px-2 md:px-2.5 rounded-lg border transition-all cursor-pointer font-mono tracking-wide shrink-0 ${
                    config.cameraView === view.id
                      ? 'bg-amber-500 border-amber-500 text-slate-950 font-extrabold shadow-lg shadow-amber-500/10'
                      : 'bg-[#15171c]/80 border-[#30363d] text-slate-400 hover:text-white hover:border-[#4f5966]'
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Immediate Event Triggers */}
          <div className="flex gap-2 md:gap-2.5">
            <button
              onClick={onTriggerCrash}
              className="flex-1 bg-gradient-to-r from-red-600 via-orange-600 to-amber-500 hover:from-red-500 hover:to-orange-400 text-slate-950 font-extrabold py-2 md:py-3 px-3 md:px-5 rounded-lg flex items-center justify-center gap-1.5 md:gap-2 shadow-lg shadow-red-500/10 hover:shadow-red-500/20 transition-all cursor-pointer text-[10px] md:text-[11px] tracking-wider font-mono uppercase"
              id="hud-trigger-crash"
            >
              <Zap size={13} /> {config.mode === 'highway' ? '💥 觸發事故' : '💥 觸發撞車'}
            </button>
            
            <button
              onClick={onClearAccident}
              className="bg-[#15171c] hover:bg-[#1e2126] border border-[#30363d] text-slate-200 font-bold py-2 md:py-3 px-3 md:px-4.5 rounded-lg flex items-center justify-center gap-1.5 md:gap-2 transition-all cursor-pointer text-[10px] md:text-[11px] font-mono tracking-wider uppercase hover:border-[#4f5966]"
              id="hud-clear-accident"
            >
              <Trash2 size={12} className="text-[#8e9299]" />
              清理排除
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
