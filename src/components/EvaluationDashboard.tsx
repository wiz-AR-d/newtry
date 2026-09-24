import React from 'react';
import type { TurnEvaluation, PostCallScorecard, Persona } from '../types';
import { Award, CheckCircle2, AlertTriangle, Lightbulb, X, TrendingUp } from 'lucide-react';

interface EvaluationDashboardProps {
  latestEvaluation?: TurnEvaluation;
  scorecard?: PostCallScorecard;
  activePersona: Persona;
  isOpenModal: boolean;
  onCloseModal: () => void;
  onTryNewPersona?: () => void;
}

export const EvaluationDashboard: React.FC<EvaluationDashboardProps> = ({
  scorecard,
  activePersona,
  isOpenModal,
  onCloseModal,
  onTryNewPersona,
}) => {
  if (!isOpenModal || !scorecard) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
      <div className="border border-white/[0.1] bg-[#0c0d12] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] p-5 bg-[#090a0f]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-blue-950/50 border border-blue-500/30 text-blue-400">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white uppercase tracking-wider">Post-Call Evaluation Scorecard</h2>
              <p className="text-xs text-slate-400">Roleplay session report vs {activePersona.name} ({activePersona.title})</p>
            </div>
          </div>

          <button 
            onClick={onCloseModal} 
            className="p-2 text-slate-400 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Overall Grade Banner */}
          <div className="bg-[#11131a] border border-blue-500/30 p-6 flex items-center justify-between shadow-xl">
            <div>
              <span className="text-xs uppercase tracking-wider text-blue-400 font-bold">Overall Sales Performance Score</span>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-4xl font-extrabold text-white font-mono">{scorecard.overallScore}</span>
                <span className="text-sm text-slate-400">/ 100</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Completed {scorecard.totalTurns} conversational turns in {scorecard.callDurationSeconds} seconds.
              </p>
            </div>

            {/* Grade Letter Badge */}
            <div className="flex h-20 w-20 items-center justify-center bg-blue-600 border border-blue-400 shadow-xl shadow-blue-600/30">
              <span className="text-3xl font-black text-white font-mono">{scorecard.grade}</span>
            </div>
          </div>

          {/* 5-Axis Competency Matrix */}
          <div className="border border-white/[0.08] p-5 bg-[#090a0f] space-y-3">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              Competency Matrix Breakdown
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-xs">
              <div className="bg-[#11131a] p-3 border border-white/[0.08]">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Rapport</div>
                <div className="text-base font-bold text-blue-400 mt-1">{scorecard.categories.rapport.score}%</div>
              </div>
              <div className="bg-[#11131a] p-3 border border-white/[0.08]">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Objections</div>
                <div className="text-base font-bold text-amber-400 mt-1">{scorecard.categories.objectionHandling.score}%</div>
              </div>
              <div className="bg-[#11131a] p-3 border border-white/[0.08]">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Pitch Clarity</div>
                <div className="text-base font-bold text-emerald-400 mt-1">{scorecard.categories.pitchClarity.score}%</div>
              </div>
              <div className="bg-[#11131a] p-3 border border-white/[0.08]">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Confidence</div>
                <div className="text-base font-bold text-blue-300 mt-1">{scorecard.categories.confidence.score}%</div>
              </div>
              <div className="bg-[#11131a] p-3 border border-white/[0.08] col-span-2 sm:col-span-1">
                <div className="text-slate-400 text-[10px] uppercase font-bold">Listening</div>
                <div className="text-base font-bold text-cyan-400 mt-1">{scorecard.categories.activeListening.score}%</div>
              </div>
            </div>
          </div>

          {/* Key Wins & Missed Opportunities Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
            
            {/* Key Wins */}
            <div className="bg-emerald-950/20 border border-emerald-500/20 p-5 space-y-2">
              <h4 className="font-bold text-emerald-300 flex items-center gap-2 text-xs uppercase tracking-wider">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Key Wins
              </h4>
              <ul className="space-y-2 text-slate-200">
                {scorecard.keyWins.map((win, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>{win}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Missed Opportunities */}
            <div className="bg-rose-950/20 border border-rose-500/20 p-5 space-y-2">
              <h4 className="font-bold text-rose-300 flex items-center gap-2 text-xs uppercase tracking-wider">
                <AlertTriangle className="h-4 w-4 text-rose-400" /> Improvement Areas
              </h4>
              <ul className="space-y-2 text-slate-200">
                {scorecard.missedOpportunities.length === 0 ? (
                  <li className="text-slate-400">None detected! Exceptional performance.</li>
                ) : (
                  scorecard.missedOpportunities.map((opp, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-rose-400 font-bold">•</span>
                      <span>{opp}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>

          </div>

          {/* Actionable Recommendations */}
          <div className="bg-[#11131a] border border-white/[0.08] p-5 space-y-3 text-xs sm:text-sm">
            <h4 className="font-bold text-white flex items-center gap-2 text-xs uppercase tracking-wider">
              <Lightbulb className="h-4 w-4 text-blue-400" /> Actionable Recommendations
            </h4>
            <ul className="space-y-2 text-slate-200">
              {scorecard.actionableRecommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold">→</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="border-t border-white/[0.08] p-4 bg-[#090a0f] flex items-center justify-between gap-3">
          {onTryNewPersona && (
            <button
              onClick={() => {
                onCloseModal();
                onTryNewPersona();
              }}
              className="flex items-center gap-2 border border-white/[0.12] bg-[#14161f] hover:bg-[#1c1f2b] text-slate-200 hover:text-white px-5 py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer"
            >
              <span>← Try New Persona</span>
            </button>
          )}
          <button
            onClick={onCloseModal}
            className="bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition-all cursor-pointer ml-auto"
          >
            Close Scorecard
          </button>
        </div>

      </div>
    </div>
  );
};

