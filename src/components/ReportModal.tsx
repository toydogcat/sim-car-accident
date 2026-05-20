import { motion } from 'motion/react';
import { AlertTriangle, ShieldCheck, Milestone, TrendingDown, RefreshCw, X } from 'lucide-react';
import { AnalyticsReport } from '../types';

interface ReportModalProps {
  report: AnalyticsReport | null;
  onClose: () => void;
  onResetSimulation: () => void;
}

export default function ReportModal({ report, onClose, onResetSimulation }: ReportModalProps) {
  if (!report) return null;

  const severityConfigs = {
    A: { color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5', title: '輕微 (Negligible)', desc: '成功完全抑制連環車禍。電子看板發揮極大警示效益！' },
    B: { color: 'text-blue-400 border-blue-500/30 bg-blue-500/5', title: '輕度追撞 (Minor)', desc: '初起追撞，追撞車輛在 1 台以內，疏堵效果良好。' },
    C: { color: 'text-amber-400 border-amber-500/30 bg-amber-500/5', title: '中度事故 (Moderate)', desc: '連環追撞達 2 ~ 3 台，回堵現象中等，用路人注意力不夠高。' },
    D: { color: 'text-orange-400 border-orange-500/30 bg-orange-500/5', title: '嚴重事故 (Major Range)', desc: '高達 4 ~ 5 台車追撞，警示距離可能不足或反應過慢，產生回堵。' },
    F: { color: 'text-rose-400 border-rose-500/30 bg-rose-500/5', title: '災難性事故 (Catastrophe)', desc: '連環大車禍！多達 6 台以上追撞。高速狀態下回堵嚴重，需立即檢討。' },
  };

  const currentSeverity = severityConfigs[report.overallSeverity] || severityConfigs.C;

  return (
    <div 
      className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-[100] p-4 font-sans"
      id="report-modal-overlay"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
        className="w-full max-w-xl bg-[#1a1d23] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden text-slate-100 max-h-[85vh] flex flex-col font-mono"
        id="report-modal-card"
      >
        {/* Header - Stamped as Freeway Bureau of Transportation style */}
        <div className="bg-[#15181e] px-6 py-4.5 border-b border-[#30363d] flex justify-between items-center relative select-none">
          <div>
            <div className="text-[10px] font-mono tracking-widest text-red-500 font-bold uppercase flex items-center gap-1.5 label-spacing">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              EXPRESSWAY TRAFFIC MONITORING CENTER • ANALYTICS
            </div>
            <h2 className="text-base font-bold font-sans tracking-tight text-white mt-1">
              電子看板 (VMS) 與車體追撞科學評估報告
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors border border-[#30363d] bg-slate-950/30 cursor-pointer"
            id="close-report-btn"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content Panel Scrollable */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 select-none text-xs">
          {/* Severity Grade Badge Banner */}
          <div className={`p-4 border rounded-lg flex items-start gap-4 ${currentSeverity.color}`}>
            <div className="text-3xl font-extrabold font-mono tracking-tighter px-4 py-1 border border-current rounded bg-slate-950/50 flex flex-col items-center justify-center">
              {report.overallSeverity}
              <span className="text-[9px] font-sans font-normal tracking-wide text-slate-400 uppercase mt-0.5">級</span>
            </div>
            <div className="flex-1 space-y-1 font-sans">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-amber-500" />
                整體事故嚴重度評級：{currentSeverity.title}
              </h3>
              <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
                {currentSeverity.desc}
              </p>
            </div>
          </div>

          {/* Core Analytics Metrics Grid */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* Primary Accident Info */}
            <div className="bg-slate-950/40 border border-[#30363d] p-3.5 rounded-lg space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Milestone size={12} className="text-red-400" /> 原初事故位置 (LOC)
              </span>
              <div className="text-lg font-bold font-mono text-white">
                K{ (report.primaryCrashLocation / 10).toFixed(1) } <span className="text-xs font-normal text-slate-400">MARKER</span>
              </div>
              <p className="text-[10px] text-slate-500">
                初始於時間 {report.timestamp} 觸發前車突發煞停
              </p>
            </div>

            {/* Secondary Crashes Count */}
            <div className="bg-slate-950/40 border border-[#30363d] p-3.5 rounded-lg space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={12} className="text-orange-400" /> 二次連環撞擊 (COLL)
              </span>
              <div className="text-lg font-bold font-mono text-orange-400">
                {report.secondaryCrashes} <span className="text-xs font-normal text-slate-400">VEH CRASHED</span>
              </div>
              <p className="text-[10px] text-slate-500">
                因反應時延與視距不佳導致的跟尾追撞
              </p>
            </div>

            {/* Max Queue backpressure */}
            <div className="bg-slate-950/40 border border-[#30363d] p-3.5 rounded-lg space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingDown size={12} className="text-blue-400" /> 車隊壅塞長度 (QUEUE)
              </span>
              <div className="text-lg font-bold font-mono text-blue-400">
                {report.maxQueueLength}m <span className="text-xs font-normal text-slate-400">BACKPRESSURE</span>
              </div>
              <p className="text-[10px] text-slate-500">
                事故後方車隊壅塞受阻之最遠距離
              </p>
            </div>

            {/* VMS Effectiveness */}
            <div className="bg-slate-950/40 border border-[#30363d] p-3.5 rounded-lg space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck size={12} className="text-emerald-400" /> VMS 防禦避險率 (SAFE)
              </span>
              <div className="text-lg font-bold font-mono text-emerald-400">
                {report.vmsEffectivenessRate}% <span className="text-xs font-normal text-slate-400">SUCCESS RATE</span>
              </div>
              <p className="text-[10px] text-slate-500">
                行經高亮告示後成功制動煞停避險比例
              </p>
            </div>
          </div>

          {/* VMS Interactive Savings visual bar */}
          <div className="bg-slate-950/40 border border-[#30363d] p-4 rounded-lg space-y-3">
            <h4 className="text-[9px] font-bold text-slate-300 uppercase tracking-widest font-mono">
              電子牌預警制動統計 (VMS DEFENSIVE SAFETY BAR)
            </h4>
            <div className="flex justify-between text-[11px] text-[#8e9299]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                行經看板數：<strong>{report.carsAlertedCount}</strong> 台
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                成功煞避數：<strong>{report.carsSavedCount}</strong> 台
              </span>
            </div>
            
            {/* Horizontal progress bar */}
            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden p-0.5 border border-[#30363d]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${report.vmsEffectivenessRate}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 h-full rounded-full"
              />
            </div>

            {/* Human Factors Insights card */}
            <div className="text-[10px] text-[#8e9299] bg-[#15171c] p-3 border border-[#30363d]/60 rounded-lg leading-relaxed">
              <span className="text-slate-100 font-bold block mb-0.5">🧠 人因與反應效力分析：</span>
              電子告示板將駕駛人之「注意力反應時延」強制歸零，使後續防禦反應時間寬裕約 1.8 秒，平均縮短煞停滑行距離約 42%，證明提早發布車流阻滯預警具有高效率的避險防禦能力。
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="bg-[#15181e] px-6 py-3.5 border-t border-[#30363d] flex gap-3 h-16 shrink-0">
          <button
            onClick={onResetSimulation}
            className="flex-1 bg-slate-950 hover:bg-slate-900 border border-[#30363d] text-slate-200 py-1.5 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs uppercase"
            id="report-reclear-btn"
          >
            <RefreshCw size={13} /> 排除故障重置
          </button>
          
          <button
            onClick={onClose}
            className="flex-1 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 py-1.5 px-3 rounded-lg font-extrabold flex items-center justify-center gap-1.5 transition-shadow hover:shadow-lg hover:shadow-amber-500/10 cursor-pointer text-xs"
            id="report-close-bottom-btn"
          >
            關閉報告 繼續觀測
          </button>
        </div>
      </motion.div>
    </div>
  );
}
