import React, { useState, useEffect, useRef } from 'react';
import type { Persona, DynamicState, ConversationTurn, TelemetryMetrics, TurnEvaluation, PostCallScorecard, DealContext, RoleplaySession, CopilotCue } from '../types';
import { BUILTIN_PERSONAS } from '../data/personas';
import { StateEngine } from '../engine/StateEngine';
import { PersonaEngine } from '../engine/PersonaEngine';
import { AudioStreamEngine } from '../engine/AudioStreamEngine';
import { MemoryEngine } from '../engine/MemoryEngine';
import { LatencyTracker } from '../engine/LatencyTracker';
import { EvaluationEngine } from '../engine/EvaluationEngine';
import { TranscriptStream } from './TranscriptStream';
import { AudioControls } from './AudioControls';
import { VoiceAgentOrb } from './VoiceAgentOrb';
import { EvaluationDashboard } from './EvaluationDashboard';
import { PersonaSelector } from './PersonaSelector';
import { CustomPersonaModal } from './CustomPersonaModal';
import { LiveCopilotWidget } from './LiveCopilotWidget';
import { ArrowRight, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';

interface RoleplayStudioProps {
  dealId?: string;
  dealContext?: DealContext | null;
  onNavigateToCopilot?: (dealId: string, sessionId: string) => void;
  onBackToDealPrep?: () => void;
}

export const RoleplayStudio: React.FC<RoleplayStudioProps> = ({
  dealId: propDealId,
  dealContext: propDealContext,
  onNavigateToCopilot,
  onBackToDealPrep,
}) => {
  // 1. Core State & Deal Context
  const [dealId] = useState<string>(propDealId || '');
  const [dealContext, setDealContext] = useState<DealContext | null>(propDealContext || null);

  const [customPersonas, setCustomPersonas] = useState<Persona[]>(() => {
    try {
      const saved = localStorage.getItem('pulse_custom_personas');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activePersona, setActivePersona] = useState<Persona>(BUILTIN_PERSONAS[0]);
  const [dynamicState, setDynamicState] = useState<DynamicState>(BUILTIN_PERSONAS[0].initialState);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);

  // 2. Audio & Streaming State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isStreamingResponse, setIsStreamingResponse] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const [showTranscripts, setShowTranscripts] = useState(false);

  // 3. Telemetry & Evaluation State
  const [telemetry, setTelemetry] = useState<TelemetryMetrics>({
    sttMs: 110,
    llmFirstTokenMs: 240,
    llmTotalMs: 410,
    ttsFirstByteMs: 120,
    totalRoundtripMs: 420,
    isSub800ms: true,
    tokensPerSec: 52,
  });
  const [latestEvaluation, setLatestEvaluation] = useState<TurnEvaluation | undefined>(undefined);
  const [scorecard, setScorecard] = useState<PostCallScorecard | undefined>(undefined);
  const [sessionStartTime] = useState<number>(Date.now());

  // 4. Modals & Transition State
  const [isOpenPersonaSelector, setIsOpenPersonaSelector] = useState(false);
  const [isOpenCreateModal, setIsOpenCreateModal] = useState(false);
  const [isOpenScorecardModal, setIsOpenScorecardModal] = useState(false);
  const [isOpenTransitionModal, setIsOpenTransitionModal] = useState(false);
  const [latestSession, setLatestSession] = useState<RoleplaySession | null>(null);
  const [apiKey] = useState<string>('');

  // 5. Live In-Call Copilot State
  const [copilotCues, setCopilotCues] = useState<CopilotCue[]>([]);
  const [isCopilotAnalyzing, setIsCopilotAnalyzing] = useState(false);
  const [copilotTone, setCopilotTone] = useState<string>('Calm & Receptive');

  const fetchCopilotCue = async (userSpeech?: string, customerSpeech?: string) => {
    try {
      setIsCopilotAnalyzing(true);
      const res = await fetch('/api/copilot/cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal_id: dealContext?.deal_id || dealId || 'deal_demo',
          user_speech: userSpeech || '',
          customer_speech: customerSpeech || '',
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.cues && data.cues.length > 0) {
          setCopilotCues(prev => [data.cues[0], ...prev.filter(c => c.id !== data.cues[0].id).slice(0, 5)]);
        }
        if (data.tone) {
          setCopilotTone(data.tone);
        }
      }
    } catch (err) {
      console.warn('Live Copilot cue fetch note:', err);
    } finally {
      setIsCopilotAnalyzing(false);
    }
  };

  // 6. Engine Instances (Refs)
  const memoryEngineRef = useRef(new MemoryEngine());
  const latencyTrackerRef = useRef(new LatencyTracker());
  const evaluationEngineRef = useRef(new EvaluationEngine());
  const personaEngineRef = useRef(new PersonaEngine(apiKey));
  const audioEngineRef = useRef<AudioStreamEngine | null>(null);
  const handleUserSpeechSubmittedRef = useRef<(text: string) => Promise<void>>(async () => {});

  // Fetch DealContext if dealId provided and not in prop
  useEffect(() => {
    async function loadDeal() {
      if (!dealContext && dealId) {
        try {
          const res = await fetch(`/api/deal/${dealId}`);
          if (res.ok) {
            const data = await res.json();
            setDealContext(data);
          }
        } catch (err) {
          console.warn('Error fetching deal context in roleplay studio:', err);
        }
      }
    }
    loadDeal();
  }, [dealId, dealContext]);

  // Initial Copilot opening discovery cue trigger
  useEffect(() => {
    if (dealContext && copilotCues.length === 0) {
      fetchCopilotCue('', "Thanks for taking the time to speak with me today.");
    }
  }, [dealContext]);

  // Dynamically configure Persona from DealContext
  useEffect(() => {
    if (dealContext) {
      if (dealContext.built_persona) {
        handleSelectPersona(dealContext.built_persona);
        return;
      }

      const targetObj = dealContext.likely_objections?.[0];
      const targetPersona: Persona = {
        id: `deal-persona-${dealContext.deal_id}`,
        name: dealContext.target_persona?.name || 'Sarah Chen',
        title: dealContext.target_persona?.title || 'VP of Operations',
        company: dealContext.target_company,
        avatarUrl: dealContext.target_persona?.avatarUrl || 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&auto=format&fit=crop&q=80',
        voiceGender: dealContext.target_persona?.voiceGender || 'female',
        personality: dealContext.target_persona?.personality || { openness: 60, conscientiousness: 85, extraversion: 60, agreeableness: 45, neuroticism: 55 },
        behavior: dealContext.target_persona?.behavior || { directness: 85, priceSensitivity: 75, riskAversion: 85, decisionSpeed: 50, technicalDepth: 75, patienceDecayRate: 6 },
        communication: { speechRateMultiplier: 1.05, pauseFrequency: 'medium', hesitationFrequency: 'medium', vocabularyLevel: 'business', sentenceLengthTarget: 'short', interruptionSensitivity: 80 },
        knowledge: {
          industry: dealContext.company_research?.industry || 'Enterprise Software',
          companySize: dealContext.company_research?.companySize || '500+ employees',
          techStack: dealContext.company_research?.techStack || ['AWS', 'Salesforce'],
          currentPainPoints: dealContext.pain_points || [],
          competitorsEvaluated: ['Gong', 'Legacy Tools'],
          budgetRange: '$50k - $150k',
          companyDescription: dealContext.company_summary,
          servicesProvided: dealContext.company_research?.initiatives?.join(', '),
          currentNeeds: dealContext.value_proposition,
        },
        initialState: {
          trustScore: 35,
          mood: 'skeptical',
          patienceLevel: 75,
          buyingIntent: 30,
          perceivedValue: 35,
          riskPerception: 80,
          turnCount: 0,
          activeObjections: [
            {
              id: `obj-deal-${dealContext.deal_id}`,
              category: targetObj?.category || 'competition',
              title: targetObj?.title || 'We already use Gong and our managers coach reps.',
              description: targetObj?.description || 'Prospect believes existing post-call recording tools are sufficient.',
              triggerThreshold: { maxTrust: 60 },
              hidden: false,
              isResolved: false,
              resolutionCriteria: targetObj?.suggestedHandling || 'Explain difference between live real-time call guidance vs. post-call recording.',
            }
          ],
          resolvedObjections: [],
        },
        objectionPool: dealContext.likely_objections?.slice(1).map((obj, idx) => ({
          id: `obj-pool-${dealContext.deal_id}-${idx}`,
          category: obj.category || 'pricing',
          title: obj.title,
          description: obj.description,
          triggerThreshold: { maxTrust: 50 },
          hidden: true,
          isResolved: false,
          resolutionCriteria: obj.suggestedHandling || 'Demonstrate ROI',
        })) || [],
        systemContext: `You are ${dealContext.target_persona?.name || 'Sarah Chen'}, ${dealContext.target_persona?.title || 'VP of Operations'} at ${dealContext.target_company}. You are on a sales discovery call with ${dealContext.seller_company}. Your main pain point is: ${dealContext.pain_points?.[0] || 'slow rep ramp'}. Your main objection is: ${targetObj?.title || 'We already use existing tools'}. Speak like a real busy executive on a mobile phone call. Keep replies strictly under 2 sentences.`,
      };

      handleSelectPersona(targetPersona);
    }
  }, [dealContext]);

  // Persist Custom Personas to localStorage whenever modified
  useEffect(() => {
    try {
      localStorage.setItem('pulse_custom_personas', JSON.stringify(customPersonas));
    } catch (err) {
      console.warn('Failed to save custom personas to localStorage:', err);
    }
  }, [customPersonas]);

  // Update PersonaEngine when API key changes
  useEffect(() => {
    personaEngineRef.current.setApiKey(apiKey);
  }, [apiKey]);

  // Initialize Audio Engine
  useEffect(() => {
    audioEngineRef.current = new AudioStreamEngine({
      onSTTResult: (text, isFinal) => {
        if (isFinal && text.length > 2) {
          handleUserSpeechSubmittedRef.current(text);
        }
      },
      onInterruption: () => {
        setWasInterrupted(true);
        setIsSpeaking(false);
        setIsStreamingResponse(false);
      },
      onAudioLevel: (level) => {
        setAudioLevel(level);
      },
      onSpeechStarted: () => {
        setIsListening(true);
      },
      onSpeechEnded: () => {
        setIsListening(false);
      },
    });

    return () => {
      audioEngineRef.current?.stopListening();
    };
  }, []);

  // Handle switching persona
  const handleSelectPersona = (persona: Persona) => {
    setActivePersona(persona);
    setDynamicState(persona.initialState);
    setTurns([]);
    setWasInterrupted(false);
    memoryEngineRef.current = new MemoryEngine();
    evaluationEngineRef.current.reset();
    setLatestEvaluation(undefined);
    setScorecard(undefined);

    if (audioEngineRef.current) {
      audioEngineRef.current.setContextualKeywords([persona.company, persona.name, 'InCruiter', 'CloseIQ']);
    }
  };

  // Delete Custom Persona
  const handleDeleteCustomPersona = (personaId: string) => {
    setCustomPersonas(prev => prev.filter(p => p.id !== personaId));
    if (activePersona.id === personaId) {
      handleSelectPersona(BUILTIN_PERSONAS[0]);
    }
  };

  // Toggle Full Duplex Microphone
  const handleToggleListening = async () => {
    if (!audioEngineRef.current) return;

    if (isListening) {
      audioEngineRef.current.stopListening();
      setIsListening(false);
    } else {
      const success = await audioEngineRef.current.startListening();
      if (success) setIsListening(true);
    }
  };

  // Main Turn Pipeline (User Speech -> State Update -> Persona Response -> TTS -> Evaluation)
  const handleUserSpeechSubmitted = async (rawUserText: string) => {
    if (!rawUserText.trim()) return;

    // Apply phonetic entity normalization
    const userText = audioEngineRef.current?.normalizeTranscript(rawUserText.trim()) || rawUserText.trim();

    latencyTrackerRef.current.markSpeechEnd();
    const isInterruptionTurn = wasInterrupted;
    setWasInterrupted(false);

    memoryEngineRef.current.processTurn(turns.length + 1, 'user', userText, activePersona);

    const { nextState, delta } = StateEngine.computeTurnState(
      activePersona,
      dynamicState,
      userText,
      isInterruptionTurn,
      userText.split(' ').length / 3
    );

    setDynamicState(nextState);

    const userTurn: ConversationTurn = {
      id: `turn-user-${Date.now()}`,
      timestamp: Date.now(),
      speaker: 'user',
      text: userText,
      wasInterrupted: isInterruptionTurn,
    };

    const updatedTurns = [...turns, userTurn];
    setTurns(updatedTurns);

    setIsStreamingResponse(true);
    setStreamingText('');

    const memoryPrompt = memoryEngineRef.current.getMemoryContextPrompt();

    const { fullText, hesitationUsed } = await personaEngineRef.current.streamResponse(
      activePersona,
      nextState,
      memoryPrompt,
      updatedTurns,
      userText,
      isInterruptionTurn,
      (chunk) => {
        setStreamingText(prev => prev + chunk);
      },
      () => {
        latencyTrackerRef.current.markLLMFirstToken();
      }
    );

    latencyTrackerRef.current.markLLMComplete();
    setIsStreamingResponse(false);
    setStreamingText('');

    const telemetryResult = latencyTrackerRef.current.markTTSFirstByte();
    setTelemetry(telemetryResult);

    const personaTurn: ConversationTurn = {
      id: `turn-persona-${Date.now()}`,
      timestamp: Date.now(),
      speaker: 'persona',
      text: fullText,
      hesitationsDetected: hesitationUsed ? [hesitationUsed] : undefined,
      stateDelta: delta,
      telemetry: telemetryResult,
    };

    const finalTurns = [...updatedTurns, personaTurn];
    setTurns(finalTurns);

    // Trigger Live Copilot Cue Evaluation with prospect's latest speech
    fetchCopilotCue(userText, fullText);

    if (audioEngineRef.current) {
      audioEngineRef.current.speak(
        fullText,
        activePersona,
        nextState,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false)
      );
    }

    const turnEval = evaluationEngineRef.current.evaluateTurn(
      finalTurns.length,
      userText,
      fullText,
      activePersona,
      nextState,
      memoryPrompt,
      apiKey
    );
    setLatestEvaluation(turnEval);
  };

  handleUserSpeechSubmittedRef.current = handleUserSpeechSubmitted;

  // Complete Roleplay & Save Session to Backend -> Trigger Transition to Co-Pilot
  const handleCompleteRoleplay = async () => {
    const durationSec = Math.max(25, Math.round((Date.now() - sessionStartTime) / 1000));
    const card = evaluationEngineRef.current.generatePostCallScorecard(
      activePersona,
      dynamicState,
      turns,
      durationSec
    );
    setScorecard(card);

    const sessionId = `session_${Date.now().toString(36)}`;
    const sessionData: RoleplaySession = {
      session_id: sessionId,
      deal_id: dealContext?.deal_id || dealId || 'deal_demo',
      transcript: turns,
      score: card.overallScore,
      grade: card.grade,
      strengths: card.keyWins.length > 0 ? card.keyWins : ['Maintained positive conversational rhythm', 'Clear discovery questions'],
      weaknesses: [
        'Pitched solution details early before fully quantifying buyer pain',
        'Did not directly address competitor tool distinction',
      ],
      missed_opportunities: card.missedOpportunities.length > 0 ? card.missedOpportunities : ['Failed to probe deeper into manager bandwidth'],
      missed_objections: [dealContext?.likely_objections?.[0]?.title || 'We already use Gong'],
      coaching_feedback: [
        'Ask 2 pain discovery questions before explaining product capabilities.',
        'Acknowledge existing tools before showing CloseIQ live call advantage.',
      ],
      buyer_reactions: [`Prospect at ${activePersona.company} was skeptical about integration friction.`],
      call_progress: 100,
      scorecard: card,
      created_at: Date.now(),
    };

    // Save to backend endpoint
    try {
      if (dealContext?.deal_id || dealId) {
        await fetch(`/api/deal/${dealContext?.deal_id || dealId}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionData),
        });
      }
    } catch (err) {
      console.warn('Failed to save session to backend:', err);
    }

    setLatestSession(sessionData);
    setIsOpenTransitionModal(true);
  };

  const handleOpenScorecard = () => {
    const durationSec = Math.round((Date.now() - sessionStartTime) / 1000);
    const card = evaluationEngineRef.current.generatePostCallScorecard(
      activePersona,
      dynamicState,
      turns,
      durationSec
    );
    setScorecard(card);
    setIsOpenScorecardModal(true);
  };

  return (
    <div className="min-h-screen bg-[#050507] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Clean CloseIQ Top Header Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#050507]/90 px-4 sm:px-8 lg:px-12 py-3.5 backdrop-blur-xl">
        <div className="w-full max-w-[1720px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span className="text-blue-500 font-mono">⌘</span> CloseIQ
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-bold bg-blue-950/60 text-blue-400 border border-blue-500/30">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              LIVE ROLEPLAY SIMULATOR
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleOpenScorecard}
              className="px-4 py-2 border border-white/[0.1] bg-[#11131a] hover:bg-[#181a24] text-xs font-semibold text-slate-200 hover:text-white transition-all cursor-pointer"
            >
              View Scorecard
            </button>
            <button
              type="button"
              onClick={handleCompleteRoleplay}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-5 py-2 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-600/25 transition-all cursor-pointer"
            >
              <span>Finish Roleplay → Launch Co-Pilot</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Interactive Product Card on closeiq.in/try */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto p-4 sm:p-8 lg:p-12 flex flex-col gap-6">
        
        {/* Deal Context Top Bar */}
        {dealContext && (
          <div className="w-full border border-white/[0.08] bg-[#0c0d12] p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {onBackToDealPrep && (
                <button
                  onClick={onBackToDealPrep}
                  className="p-2.5 bg-[#151722] border border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20 transition-all cursor-pointer"
                  title="Back to Deal Generator"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Target Deal</span>
                  <span className="text-base font-bold text-white">{dealContext.target_company}</span>
                  <span className="text-sm text-slate-400">• {dealContext.target_persona?.title || activePersona.title} ({dealContext.target_persona?.name || activePersona.name})</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  <strong className="text-blue-400">Primary Angle:</strong> {dealContext.pain_points?.[0] || 'Accelerating sales rep ramp time and objection handling'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenScorecard}
                className="px-5 py-2.5 border border-white/[0.1] bg-[#151722] hover:bg-[#1e2230] text-xs sm:text-sm font-semibold text-white transition-all cursor-pointer"
              >
                View Scorecard
              </button>
            </div>
          </div>
        )}

        {/* Main 2-Column Grid: Voice Stage (Left) & Live Copilot Panel (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-start">
          
          {/* Left Column: Voice Orb Stage & Audio Controls (7 cols on lg) */}
          <div className="lg:col-span-7 flex flex-col gap-6 w-full">
            <div className="w-full border border-white/[0.08] bg-[#0c0d12] relative overflow-hidden min-h-[460px] flex flex-col items-center justify-center">
              <VoiceAgentOrb
                isSpeaking={isSpeaking}
                isListening={isListening}
                audioLevel={audioLevel}
                isStreamingResponse={isStreamingResponse}
                activePersona={activePersona}
                wasInterrupted={wasInterrupted}
              />
            </div>

            {/* Audio Controls Bar */}
            <div className="w-full">
              <AudioControls
                isListening={isListening}
                isSpeaking={isSpeaking}
                audioLevel={audioLevel}
                onToggleListening={handleToggleListening}
                onSendTextMessage={handleUserSpeechSubmitted}
                wasInterrupted={wasInterrupted}
                roundtripMs={telemetry.totalRoundtripMs}
                showTranscripts={showTranscripts}
                onToggleTranscripts={() => setShowTranscripts(!showTranscripts)}
                turnCount={turns.length}
              />
            </div>
          </div>

          {/* Right Column: Live AI Copilot Battlecard Panel (5 cols on lg) */}
          <div className="lg:col-span-5 w-full">
            <LiveCopilotWidget
              dealContext={dealContext}
              dealId={dealId}
              activeCue={copilotCues[0] || null}
              allCues={copilotCues}
              isAnalyzing={isCopilotAnalyzing}
              currentTone={copilotTone}
              turns={turns}
              streamingText={streamingText}
              className="w-full h-[620px]"
            />
          </div>

        </div>

        {/* Collapsible Transcript Stream (Shown only when 'Show Transcripts' is pressed) */}
        {showTranscripts && (
          <div className="w-full border border-white/[0.08] bg-[#0c0d12] p-6 space-y-4 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <span className="text-blue-400">✦</span> Live Call Transcripts ({turns.length} Turns)
              </h3>
              <button
                type="button"
                onClick={() => setShowTranscripts(false)}
                className="text-xs font-semibold text-slate-400 hover:text-white bg-[#11131a] px-3 py-1 border border-white/[0.08] hover:border-white/20 transition-all cursor-pointer"
              >
                Hide Transcripts ✕
              </button>
            </div>

            <TranscriptStream
              activePersona={activePersona}
              turns={turns}
              isStreamingResponse={isStreamingResponse}
              streamingText={streamingText}
            />
          </div>
        )}

      </main>

      {/* Roleplay -> Co-Pilot Transition Modal */}
      {isOpenTransitionModal && latestSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
          <div className="border border-white/[0.1] bg-[#0c0d12] shadow-2xl p-6 sm:p-8 space-y-6 w-full max-w-lg animate-in fade-in zoom-in-95">
            <div className="text-center space-y-2">
              <div className="inline-flex h-12 w-12 items-center justify-center bg-blue-950/50 border border-blue-500/30 text-blue-400 mb-2">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-white uppercase tracking-wider">Roleplay Session Complete</h3>
              <p className="text-xs sm:text-sm text-slate-300">You're ready for the real customer conversation.</p>
            </div>

            {/* Practice Insights Box */}
            <div className="space-y-3 bg-[#11131a] p-5 border border-white/[0.08] text-xs sm:text-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Key Performance Insights:
              </div>
              <div className="space-y-2 text-slate-200">
                {latestSession.weaknesses.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-rose-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                    <span>{w}</span>
                  </div>
                ))}
                {latestSession.strengths.slice(0, 2).map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-blue-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Likely Objection to Watch */}
            <div className="bg-blue-950/30 p-4 border border-blue-500/30 space-y-1.5 text-xs sm:text-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Top Objection to Watch</span>
              <p className="text-slate-200 font-semibold italic">"{dealContext?.likely_objections?.[0]?.title || 'We already use existing tooling.'}"</p>
            </div>

            <p className="text-xs text-slate-400 text-center">
              CloseIQ will keep these insights in mind during your live call.
            </p>

            {/* Launch Co-Pilot CTA */}
            <button
              onClick={() => {
                setIsOpenTransitionModal(false);
                onNavigateToCopilot?.(dealContext?.deal_id || dealId || 'deal_demo', latestSession.session_id);
              }}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-4 text-sm font-extrabold text-white shadow-xl shadow-blue-600/30 transition-all cursor-pointer hover:scale-[1.01]"
            >
              <span>Launch Live Co-Pilot</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {isOpenPersonaSelector && (
        <PersonaSelector
          activePersona={activePersona}
          customPersonas={customPersonas}
          onSelectPersona={handleSelectPersona}
          onDeleteCustomPersona={handleDeleteCustomPersona}
          onOpenCreateModal={() => {
            setIsOpenPersonaSelector(false);
            setIsOpenCreateModal(true);
          }}
          onClose={() => setIsOpenPersonaSelector(false)}
        />
      )}

      {isOpenCreateModal && (
        <CustomPersonaModal
          onSave={(newPersona) => {
            setCustomPersonas(prev => [...prev, newPersona]);
            handleSelectPersona(newPersona);
          }}
          onClose={() => setIsOpenCreateModal(false)}
        />
      )}

      {/* Scorecard Modal */}
      <EvaluationDashboard
        latestEvaluation={latestEvaluation}
        scorecard={scorecard}
        activePersona={activePersona}
        isOpenModal={isOpenScorecardModal}
        onCloseModal={() => setIsOpenScorecardModal(false)}
      />

    </div>
  );
};
