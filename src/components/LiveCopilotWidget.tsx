import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Sparkles, 
  ShieldAlert, 
  CheckCircle2, 
  HelpCircle, 
  Flame, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  Zap, 
  Target, 
  AlertTriangle 
} from 'lucide-react';
import type { DealContext, CopilotCue } from '../types';

interface LiveCopilotWidgetProps {
  dealContext?: DealContext | null;
  dealId?: string;
  activeCue?: CopilotCue | null;
  allCues?: CopilotCue[];
  isAnalyzing?: boolean;
  currentTone?: string;
  className?: string;
}

export const LiveCopilotWidget: React.FC<LiveCopilotWidgetProps> = ({
  dealContext,
  dealId,
  activeCue,
  allCues = [],
  isAnalyzing = false,
  currentTone = 'Calm & Receptive',
  className = '',
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'live' | 'battlecards' | 'discovery'>('live');

  const targetCompany = dealContext?.target_company || 'Target Prospect';
  const personaName = dealContext?.target_persona?.name || 'Buyer';
  const personaTitle = dealContext?.target_persona?.title || 'Decision Maker';

  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const displayCue = activeCue || allCues[0] || null;

  return (
    <div className={`flex flex-col bg-[#0c0d12] border border-white/[0.08] shadow-2xl relative overflow-hidden ${className}`}>
      
      {/* Top Header Bar */}
      <div className="p-4 bg-[#11131a] border-b border-white/[0.08] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
            <Bot className={`h-4 w-4 ${isAnalyzing ? 'animate-spin text-blue-300' : 'text-blue-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                Live AI Copilot
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                MEMORY ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono truncate max-w-[260px]">
              Remembering {targetCompany} • {personaName} ({personaTitle})
            </p>
          </div>
        </div>

        {/* Emotion / Tone Badge */}
        <div className="flex items-center gap-1.5 bg-[#090a0f] border border-white/[0.08] px-2.5 py-1 text-[11px]">
          <span className="text-slate-400">Buyer Tone:</span>
          <span className={`font-semibold ${
            currentTone.toLowerCase().includes('skeptical') || currentTone.toLowerCase().includes('agitated')
              ? 'text-rose-400'
              : 'text-blue-400'
          }`}>
            {currentTone}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-white/[0.08] bg-[#090a0f] px-4 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setSelectedTab('live')}
          className={`py-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            selectedTab === 'live'
              ? 'border-blue-500 text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="h-3.5 w-3.5" />
          <span>Live Tactical Cues</span>
          {allCues.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-blue-900/60 text-blue-300 text-[10px] font-mono">
              {allCues.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('battlecards')}
          className={`py-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            selectedTab === 'battlecards'
              ? 'border-blue-500 text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="h-3.5 w-3.5" />
          <span>Objection Battlecards</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedTab('discovery')}
          className={`py-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
            selectedTab === 'discovery'
              ? 'border-blue-500 text-blue-400 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Target className="h-3.5 w-3.5" />
          <span>Discovery Questions</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4 sm:p-5 flex-1 overflow-y-auto max-h-[480px] space-y-4">
        
        {/* ========================================================
            TAB 1: LIVE TACTICAL CUES
        ======================================================== */}
        {selectedTab === 'live' && (
          <div className="space-y-4">
            
            {/* Analyzing Indicator */}
            {isAnalyzing && (
              <div className="flex items-center gap-2 text-xs font-mono text-blue-400 bg-blue-950/30 border border-blue-500/20 p-2.5 animate-pulse">
                <Sparkles className="h-3.5 w-3.5 animate-spin" />
                <span>Copilot is scanning speech against {targetCompany} memory & battlecards...</span>
              </div>
            )}

            {/* Active Highlight Cue */}
            {displayCue ? (
              <div className={`p-4 sm:p-5 border transition-all ${
                displayCue.type === 'objection'
                  ? 'bg-rose-950/20 border-rose-800/40'
                  : displayCue.type === 'coaching_alert'
                  ? 'bg-amber-950/20 border-amber-800/40'
                  : 'bg-blue-950/20 border-blue-800/40'
              }`}>
                {/* Cue Badge & Title */}
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-2">
                    {displayCue.type === 'objection' ? (
                      <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                    ) : displayCue.type === 'coaching_alert' ? (
                      <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
                    )}
                    <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-white">
                      {displayCue.title}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-white/5 text-slate-300 border border-white/10 shrink-0">
                    {displayCue.type}
                  </span>
                </div>

                {/* Tactical Description */}
                <p className="text-xs sm:text-sm text-slate-300 mb-3 leading-relaxed">
                  {displayCue.description}
                </p>

                {/* Winning Rebuttal Box (The Exact Quote) */}
                {displayCue.winningRebuttal && (
                  <div className="p-3.5 bg-[#07080c] border-l-4 border-l-blue-500 border-y border-r border-white/[0.06] mb-3 relative group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                        Exact Winning Talking Track:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(displayCue.winningRebuttal || '', displayCue.id)}
                        className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title="Copy Rebuttal"
                      >
                        {copiedId === displayCue.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-sm font-medium text-slate-100 italic leading-relaxed">
                      "{displayCue.winningRebuttal.replace(/^"|"$/g, '')}"
                    </p>
                  </div>
                )}

                {/* Suggested Action or Question */}
                <div className="space-y-1.5 text-xs">
                  {displayCue.suggestedAction && (
                    <div className="flex items-center gap-2 text-slate-300">
                      <strong className="text-slate-200">Recommended Action:</strong>
                      <span>{displayCue.suggestedAction}</span>
                    </div>
                  )}
                  {displayCue.suggestedQuestion && (
                    <div className="flex items-center gap-2 text-slate-300">
                      <strong className="text-blue-400">Follow-up Probe:</strong>
                      <span className="italic text-slate-200">{displayCue.suggestedQuestion}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-[#090a0f] border border-white/[0.05] space-y-2">
                <Bot className="h-8 w-8 text-blue-500/50 mx-auto" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Copilot Is Listening</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Speak into your microphone or wait for {personaName}'s response. As soon as pain or objections arise, tactical cues will appear here in real time.
                </p>
              </div>
            )}

            {/* History Cue Stack */}
            {allCues.length > 1 && (
              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Recent Call Guidance ({allCues.length - 1} more):
                </span>
                {allCues.slice(1, 4).map((cue) => (
                  <div key={cue.id} className="p-3 bg-[#11131a] border border-white/[0.05] text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{cue.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{cue.type}</span>
                    </div>
                    {cue.winningRebuttal && (
                      <p className="text-slate-400 text-[11px] italic truncate">
                        "{cue.winningRebuttal}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ========================================================
            TAB 2: OBJECTION BATTLECARDS (From Researched Deal)
        ======================================================== */}
        {selectedTab === 'battlecards' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Pre-loaded counter-arguments tailored specifically for {targetCompany}:
            </p>

            {dealContext?.likely_objections && dealContext.likely_objections.length > 0 ? (
              dealContext.likely_objections.map((obj, idx) => (
                <div key={idx} className="p-3.5 bg-[#11131a] border border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-rose-300">
                      "{obj.title}"
                    </span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-rose-950/50 text-rose-400 border border-rose-800/30">
                      {obj.category}
                    </span>
                  </div>
                  <div className="p-2.5 bg-[#090a0f] border-l-2 border-l-rose-500 text-xs text-slate-200 leading-relaxed">
                    <strong className="block text-slate-300 text-[11px] mb-0.5">Winning Rebuttal Track:</strong>
                    {obj.suggestedHandling}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic">No objection battlecards loaded.</p>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 3: DISCOVERY QUESTIONS (From Researched Deal)
        ======================================================== */}
        {selectedTab === 'discovery' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Target questions to uncover acute friction and guide {personaName} to urgency:
            </p>

            {dealContext?.discovery_questions && dealContext.discovery_questions.length > 0 ? (
              dealContext.discovery_questions.map((q, idx) => (
                <div key={idx} className="p-3.5 bg-[#11131a] border border-white/[0.06] space-y-1.5 flex items-start gap-3">
                  <span className="h-5 w-5 bg-blue-900/40 border border-blue-500/30 text-blue-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="text-xs text-slate-200 leading-relaxed">
                    "{q.replace(/^"|"$/g, '')}"
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic">No discovery questions loaded.</p>
            )}

            {dealContext?.call_objective && (
              <div className="p-3 bg-blue-950/30 border border-blue-500/30 text-xs text-slate-200 space-y-1 mt-4">
                <span className="font-bold text-blue-400 block text-[11px] uppercase tracking-wider">
                  Call Target Objective:
                </span>
                <p>{dealContext.call_objective}</p>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
};

export default LiveCopilotWidget;
