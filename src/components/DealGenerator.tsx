import React, { useState } from 'react';
import { 
  Sparkles, 
  Upload, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Globe, 
  Target, 
  CheckCircle2, 
  Building2, 
  AlertTriangle, 
  Flame, 
  TrendingUp, 
  HelpCircle, 
  ShieldAlert, 
  PhoneCall, 
  Check,
  ChevronRight,
  ArrowLeft
} from 'lucide-react';
import type { DealContext } from '../types';

interface DealGeneratorProps {
  onDealGenerated: (dealId: string, dealContext: DealContext) => void;
}

type StepStage = 'input' | 'strategy' | 'persona';

export const DealGenerator: React.FC<DealGeneratorProps> = ({ onDealGenerated }) => {
  // Navigation Stage
  const [currentStage, setCurrentStage] = useState<StepStage>('input');

  // Form Inputs
  const [targetUrl, setTargetUrl] = useState('https://acme.com');
  const [sellerUrl, setSellerUrl] = useState('https://closeiq.in');
  const [productName, setProductName] = useState('CloseIQ AI Sales Copilot & Roleplay Simulator');
  const [productDescription, setProductDescription] = useState(
    'Real-time live call assistance, instant objection handling cues, and hyper-realistic voice roleplay practice that cuts sales rep onboarding time in half.'
  );
  const [targetPersonaTitle, setTargetPersonaTitle] = useState('VP of Sales');
  const [targetPersonaName, setTargetPersonaName] = useState('Sarah Chen');
  const [geminiApiKey] = useState('');

  const [playbookFile, setPlaybookFile] = useState<File | null>(null);
  const [playbookText, setPlaybookText] = useState('');

  // Generation & Intelligence State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [generatedDealId, setGeneratedDealId] = useState<string>('');
  const [generatedDealContext, setGeneratedDealContext] = useState<DealContext | null>(null);

  // 5-Second Roleplay Persona Builder State
  const [isBuildingRoleplay, setIsBuildingRoleplay] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildCountdownSec, setBuildCountdownSec] = useState(5.0);
  const [buildStepIndex, setBuildStepIndex] = useState(0);

  const roleplayBuildSteps = [
    `Committing ${generatedDealContext?.target_company || 'target client'} acute bottlenecks & pain points to Copilot vector store...`,
    'Arming objection battlecards with winning counter-tactics & exact rebuttals...',
    `Calibrating buyer skepticism profile for ${generatedDealContext?.target_persona?.name || 'Sarah Chen'} (${generatedDealContext?.target_persona?.title || 'VP of Sales'})...`,
    'Copilot remembers everything and is live for your call simulation!'
  ];

  const steps = [
    'Crawling & researching target company website footprint & tech stack...',
    'Analyzing seller company capabilities & product value drivers...',
    'Synthesizing acute pain points & operational friction with Gemini AI...',
    'Deriving high-conversion value propositions, discovery questions & battlecards...',
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPlaybookFile(file);

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setPlaybookText(text || `Uploaded file: ${file.name}`);
      };
      reader.readAsText(file);
    }
  };

  // Step 1 -> Trigger AI Research
  const handleStartResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl.trim()) return;

    setIsGenerating(true);
    setGenerationStep(0);

    const fetchPromise = fetch('/api/deal/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_url: targetUrl.trim(),
        seller_url: sellerUrl.trim(),
        product_name: productName.trim(),
        product_description: productDescription.trim(),
        target_persona_title: targetPersonaTitle.trim(),
        target_persona_name: targetPersonaName.trim(),
        geminiApiKey: geminiApiKey.trim() || undefined,
        playbook_name: playbookFile?.name || 'Uploaded_Playbook.pdf',
        playbook_text: playbookText || 'Focus on discovery, ROI quantification, handling competitor objections.',
      }),
    }).then(async (res) => {
      if (!res.ok) throw new Error('Failed to research companies & product');
      return res.json();
    });

    try {
      // Step 0: Crawling target footprint
      await new Promise((r) => setTimeout(r, 1100));
      setGenerationStep(1);

      // Step 1: Analyzing seller capabilities
      await new Promise((r) => setTimeout(r, 1200));
      setGenerationStep(2);

      // Step 2: Synthesizing acute pain points
      await new Promise((r) => setTimeout(r, 1200));
      setGenerationStep(3);

      // Step 3: Deriving value propositions & battlecards
      const data = await fetchPromise;
      const dealId = data.deal_id;
      const dealContext: DealContext = data.dealContext;

      setGeneratedDealId(dealId);
      setGeneratedDealContext(dealContext);

      // Step 4: Show all 4 steps checked and 100% complete
      setGenerationStep(4);
      await new Promise((r) => setTimeout(r, 700));

      // Transition to Stage 2 (Strategy & Value Propositions)
      setIsGenerating(false);
      setCurrentStage('strategy');
    } catch (err) {
      console.error('Error in deal research generator:', err);
      setIsGenerating(false);
    }
  };

  // Step 2 -> Move to Persona Build with 5-Second Copilot Memory Sync Countdown
  const handleProceedToPersona = () => {
    setIsBuildingRoleplay(true);
    setBuildProgress(0);
    setBuildCountdownSec(5.0);
    setBuildStepIndex(0);

    // Trigger Copilot memory sync with backend vector store
    if (generatedDealId || generatedDealContext) {
      fetch('/api/copilot/sync-deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal_id: generatedDealId,
          deal_context: generatedDealContext
        })
      }).catch(err => console.warn('Copilot sync note:', err));
    }

    const startTime = Date.now();
    const duration = 5000; // 5000ms = 5.0 seconds

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      const remainingSec = Math.max(0, ((duration - elapsed) / 1000));
      
      setBuildProgress(progress);
      setBuildCountdownSec(Number(remainingSec.toFixed(1)));

      if (progress < 25) {
        setBuildStepIndex(0);
      } else if (progress < 50) {
        setBuildStepIndex(1);
      } else if (progress < 75) {
        setBuildStepIndex(2);
      } else {
        setBuildStepIndex(3);
      }

      if (elapsed >= duration) {
        clearInterval(timer);
        setIsBuildingRoleplay(false);
        setCurrentStage('persona');
      }
    }, 50);
  };

  // Step 3 -> Launch Call Simulator
  const handleStartCall = () => {
    if (generatedDealId && generatedDealContext) {
      onDealGenerated(generatedDealId, generatedDealContext);
    }
  };

  return (
    <div className="min-h-screen bg-[#050507] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      
      {/* Top CloseIQ Header Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#050507]/90 px-4 sm:px-8 lg:px-12 py-3.5 backdrop-blur-xl">
        <div className="w-full max-w-[1720px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center gap-2.5 text-white hover:opacity-90 transition-opacity">
              <svg viewBox="0 0 32 32" fill="currentColor" className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M4 6C4 6 6 12 11 15.5C9 18 7 20 4.5 21C7.5 22.5 11.5 22 14.5 20C15.2 21.2 16.5 21.2 17.5 20C20.5 22 24.5 22.5 27.5 21C25 20 23 18 21 15.5C26 12 28 6 28 6C24.5 8.5 20.5 10 17 9.2C16.5 8 15.5 8 15 9.2C11.5 10 7.5 8.5 4 6Z" fill="currentColor"/>
                <path d="M16 16.5L13.5 20L16 23L18.5 20L16 16.5Z" fill="currentColor"/>
              </svg>
              <span className="text-xl font-bold tracking-tight text-white">CloseIQ</span>
            </a>
          </div>

          {/* Stepper Pill Indicator */}
          <div className="hidden md:flex items-center gap-3 bg-[#0c0d12] border border-white/[0.08] px-4 py-2 text-xs sm:text-sm">
            <div className={`flex items-center gap-2 ${currentStage === 'input' ? 'text-blue-400 font-bold' : 'text-slate-400'}`}>
              <span className={`h-5 w-5 flex items-center justify-center text-xs font-bold ${currentStage === 'input' ? 'bg-blue-600 text-white' : 'bg-slate-800'}`}>1</span>
              <span>Target Research</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-600" />
            <div className={`flex items-center gap-2 ${currentStage === 'strategy' ? 'text-blue-400 font-bold' : currentStage === 'persona' ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
              <span className={`h-5 w-5 flex items-center justify-center text-xs font-bold ${currentStage === 'strategy' ? 'bg-blue-600 text-white' : currentStage === 'persona' ? 'bg-blue-600 text-white' : 'bg-slate-800'}`}>2</span>
              <span>Value Props</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-600" />
            <div className={`flex items-center gap-2 ${currentStage === 'persona' ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
              <span className={`h-5 w-5 flex items-center justify-center text-xs font-bold ${currentStage === 'persona' ? 'bg-blue-600 text-white' : 'bg-slate-800'}`}>3</span>
              <span>Buyer Roleplay</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-mono text-slate-300 bg-[#0c0d12] border border-white/[0.08] px-3.5 py-1.5">
              <span className="inline-block h-2 w-2 bg-blue-400 animate-pulse" />
              <span className="hidden sm:inline">Engine Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-[1720px] mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-8 flex flex-col justify-start">
        
        {/* ========================================================
            STAGE 1: INPUT & DEEP RESEARCH
        ======================================================== */}
        {currentStage === 'input' && (
          <div className="space-y-8">
            
            {/* Clean Section Title */}
            <div className="text-center space-y-3 pt-2">
              <div className="inline-flex items-center gap-2 bg-blue-950/50 px-4 py-1.5 text-xs sm:text-sm font-bold text-blue-400 border border-blue-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span>STEP 1 OF 3 • TARGET DEAL INTELLIGENCE</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                Configure Target Account & Solution
              </h1>
              <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
                Enter your target prospect and product details below. Gemini AI will research the company, build objection patterns, and construct your strategic sales dossier.
              </p>
            </div>

            {/* Input Form Panel */}
            <div className="border border-white/[0.08] shadow-2xl p-6 sm:p-10 relative overflow-hidden bg-[#0c0d12]">
              
              {isGenerating ? (
                /* Scanning Radar Animation */
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                  <div className="relative">
                    <div className="h-20 w-20 bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-600/30 border border-blue-400">
                      <Zap className="h-10 w-10 text-white animate-bounce" />
                    </div>
                    <span className="absolute -inset-2 border border-blue-400/60 animate-ping opacity-75" />
                  </div>

                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-950/40 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase tracking-wider mb-1">
                      <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                      <span>Deep Multi-Angle Analysis Active</span>
                    </div>
                    <h3 className="text-2xl font-extrabold text-white">Gemini AI Deal Intelligence In Progress</h3>
                    <p className="text-sm text-slate-300 font-mono">{steps[generationStep] || 'Finalizing deal intelligence & value propositions...'}</p>
                  </div>

                  {/* Shimmer Progress Bar */}
                  <div className="w-full max-w-lg bg-[#050507] h-2.5 overflow-hidden border border-white/[0.08]">
                    <div 
                      className="bg-blue-600 h-full transition-all duration-700 ease-out"
                      style={{ width: `${Math.min(100, Math.max(15, ((generationStep + 1) / steps.length) * 100))}%` }}
                    />
                  </div>

                  {/* Step Progress Checklist */}
                  <div className="w-full max-w-lg space-y-2 pt-2">
                    {steps.map((stepText, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-xs sm:text-sm text-left p-3 bg-[#11131a] border border-white/[0.06] transition-all">
                        {idx < generationStep ? (
                          <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
                        ) : idx === generationStep ? (
                          <div className="h-4 w-4 border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
                        ) : (
                          <div className="h-4 w-4 border border-slate-700 shrink-0" />
                        )}
                        <span className={idx <= generationStep ? 'text-white font-medium' : 'text-slate-500'}>
                          {stepText}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-slate-400 italic">
                    Synthesizing company websites, extracting tech stacks, and tailoring objections...
                  </p>
                </div>
              ) : (
                /* Enterprise Deal Setup Form */
                <form onSubmit={handleStartResearch} className="space-y-6">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Target Company Domain */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Target Account Domain / URL <span className="text-blue-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={targetUrl}
                        onChange={(e) => setTargetUrl(e.target.value)}
                        placeholder="https://acme.com"
                        className="w-full bg-[#11131a] border border-white/[0.1] px-4 py-3.5 text-sm text-white font-mono placeholder-slate-600 focus:border-blue-500 focus:outline-none transition-colors"
                        required
                      />
                    </div>

                    {/* Your Company Website */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Your Company Domain / URL <span className="text-blue-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={sellerUrl}
                        onChange={(e) => setSellerUrl(e.target.value)}
                        placeholder="https://closeiq.in"
                        className="w-full bg-[#11131a] border border-white/[0.1] px-4 py-3.5 text-sm text-white font-mono placeholder-slate-600 focus:border-blue-500 focus:outline-none transition-colors"
                        required
                      />
                    </div>

                    {/* Product Name */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Product / Solution Name <span className="text-blue-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        placeholder="CloseIQ AI Sales Copilot"
                        className="w-full bg-[#11131a] border border-white/[0.1] px-4 py-3.5 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none transition-colors"
                        required
                      />
                    </div>

                    {/* Target Buyer Role */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Target Buyer Role / Title <span className="text-blue-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={targetPersonaTitle}
                        onChange={(e) => setTargetPersonaTitle(e.target.value)}
                        placeholder="VP of Sales"
                        className="w-full bg-[#11131a] border border-white/[0.1] px-4 py-3.5 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none transition-colors"
                        required
                      />
                    </div>

                  </div>

                  {/* Buyer Name (Optional) */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Target Buyer Name</span>
                      <span className="text-[11px] text-slate-500 font-normal">Optional</span>
                    </label>
                    <input
                      type="text"
                      value={targetPersonaName}
                      onChange={(e) => setTargetPersonaName(e.target.value)}
                      placeholder="Sarah Chen"
                      className="w-full bg-[#11131a] border border-white/[0.1] px-4 py-3.5 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Product Capabilities & Pitch */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Product Capabilities & Core Value Proposition <span className="text-blue-400">*</span>
                    </label>
                    <textarea
                      value={productDescription}
                      onChange={(e) => setProductDescription(e.target.value)}
                      placeholder="Describe what your product solves, key capabilities, and value drivers..."
                      rows={3}
                      className="w-full bg-[#11131a] border border-white/[0.1] p-4 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none transition-colors leading-relaxed"
                      required
                    />
                  </div>

                  {/* Playbook / Battlecards Upload */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Upload Sales Playbook / Collateral</span>
                      <span className="text-[11px] text-slate-500 font-normal">Optional (PDF, DOCX, TXT)</span>
                    </label>

                    <div className="relative border border-white/[0.1] bg-[#11131a] p-5 text-center hover:border-white/20 transition-all cursor-pointer group">
                      <input
                        type="file"
                        accept=".pdf,.docx,.pptx,.txt"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                      />
                      
                      <div className="flex items-center justify-center gap-3">
                        <Upload className="h-4 w-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
                        {playbookFile ? (
                          <span className="text-xs font-mono text-blue-400 font-bold">
                            {playbookFile.name} ({(playbookFile.size / 1024).toFixed(1)} KB)
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Drop sales decks, scripts, or battlecards here to upload
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Primary CTA */}
                  <div className="pt-3">
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-2.5 bg-blue-600 hover:bg-blue-500 px-6 py-4 text-sm font-bold text-white shadow-xl shadow-blue-600/30 transition-all cursor-pointer hover:scale-[1.005]"
                    >
                      <span>Continue to Strategic Briefing</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>

                </form>
              )}

            </div>

          </div>
        )}

        {/* ========================================================
            STAGE 2: VALUE PROPOSITIONS & PAIN POINTS BRIEFING
        ======================================================== */}
        {currentStage === 'strategy' && generatedDealContext && (
          <div className="space-y-8 w-full">
            
            {isBuildingRoleplay ? (
              /* 5-Second Animated Calibration Card */
              <div className="border border-white/[0.08] shadow-2xl p-8 sm:p-14 bg-[#0c0d12] text-center space-y-8 animate-in fade-in zoom-in-95 my-8">
                <div className="relative inline-flex items-center justify-center">
                  <div className="h-24 w-24 bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-600/40 border border-blue-400">
                    <Zap className="h-12 w-12 text-white animate-pulse" />
                  </div>
                  <span className="absolute -inset-3 border border-blue-400/60 animate-ping opacity-60" />
                </div>

                <div className="space-y-3 max-w-xl mx-auto">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-blue-950/60 border border-blue-500/30 text-blue-400 text-xs font-mono font-bold uppercase tracking-wider">
                    <span className="h-2 w-2 rounded-full bg-blue-400 animate-ping" />
                    <span>🧠 COPILOT MEMORY SYNC • {buildCountdownSec.toFixed(1)}s REMAINING</span>
                  </div>
                  <h3 className="text-2xl sm:text-4xl font-extrabold text-white">
                    Copilot Is Remembering Everything About {generatedDealContext.target_company}
                  </h3>
                  <p className="text-sm sm:text-base text-slate-300 font-mono">
                    {roleplayBuildSteps[buildStepIndex]}
                  </p>
                </div>

                {/* 5-Second Animated Progress Bar */}
                <div className="w-full max-w-2xl mx-auto bg-[#050507] h-3 overflow-hidden border border-white/[0.08]">
                  <div 
                    className="bg-blue-600 h-full transition-all duration-75 ease-linear"
                    style={{ width: `${buildProgress}%` }}
                  />
                </div>

                {/* 4-Step Checklist */}
                <div className="w-full max-w-2xl mx-auto space-y-2.5 pt-2">
                  {roleplayBuildSteps.map((stepMsg, idx) => (
                    <div key={idx} className="flex items-center gap-3 text-xs sm:text-sm text-left p-3.5 bg-[#11131a] border border-white/[0.06] transition-all">
                      {idx < buildStepIndex ? (
                        <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
                      ) : idx === buildStepIndex ? (
                        <div className="h-4 w-4 border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
                      ) : (
                        <div className="h-4 w-4 border border-slate-700 shrink-0" />
                      )}
                      <span className={idx <= buildStepIndex ? 'text-white font-semibold' : 'text-slate-500'}>
                        {stepMsg}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/[0.08]">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 bg-blue-950/50 px-4 py-1.5 text-xs sm:text-sm font-bold text-blue-400 border border-blue-500/30">
                      <CheckCircle2 className="h-4 w-4 text-blue-400" />
                      <span>STEP 2 OF 3 • STRATEGIC DEAL INTELLIGENCE</span>
                    </div>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
                      Target Strategy & Pain Points Dossier
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 text-sm sm:text-base text-slate-400 pt-1">
                      <span>Target Account:</span>
                      <span className="text-white font-bold bg-[#11131a] px-3 py-1 border border-white/[0.08]">{generatedDealContext.target_company}</span>
                      <span className="text-slate-600">•</span>
                      <span>Seller Platform:</span>
                      <span className="text-blue-400 font-bold bg-blue-950/40 px-3 py-1 border border-blue-500/30">{generatedDealContext.seller_company}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCurrentStage('input')}
                      className="flex items-center gap-2 text-sm sm:text-base text-slate-300 hover:text-white bg-[#11131a] border border-white/[0.08] hover:border-white/20 px-5 py-3 transition-all cursor-pointer font-semibold"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Edit Inputs</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleProceedToPersona}
                      className="flex items-center gap-2.5 bg-blue-600 hover:bg-blue-500 px-8 py-3.5 text-sm sm:text-base font-extrabold text-white shadow-xl shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                    >
                      <span>Build Buyer Persona</span>
                      <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>

            {/* Vertical Stacked Strategy Dossiers (One Below Other) */}
            <div className="space-y-8 w-full">
              
              {/* 1. Researched Companies Intel Card */}
              <div className="border border-white/[0.08] p-6 sm:p-8 bg-[#0c0d12] space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white uppercase tracking-wider">Account & Solution Intelligence</h3>
                  </div>
                  <span className="text-xs sm:text-sm font-mono text-slate-300 bg-[#11131a] border border-white/[0.08] px-3.5 py-1">
                    {generatedDealContext.company_research?.industry || 'Enterprise Software'}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="p-6 bg-[#11131a] border border-white/[0.08] space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2.5 text-white font-bold text-lg">
                        <Globe className="h-5 w-5 text-blue-400" />
                        <span>Target Account: {generatedDealContext.target_company}</span>
                      </div>
                      <p className="text-slate-200 text-sm sm:text-base leading-relaxed">
                        {generatedDealContext.company_summary}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-white/[0.06] flex flex-wrap gap-2">
                      {generatedDealContext.company_research?.techStack?.map((tech, i) => (
                        <span key={i} className="text-xs sm:text-sm font-mono bg-[#090a0f] text-slate-300 px-3 py-1 border border-white/[0.08]">
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-6 bg-[#11131a] border border-white/[0.08] space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2.5 text-white font-bold text-lg">
                        <ShieldCheck className="h-5 w-5 text-blue-400" />
                        <span>Selling: {generatedDealContext.seller_product_name || generatedDealContext.seller_company}</span>
                      </div>
                      <p className="text-slate-200 text-sm sm:text-base leading-relaxed">
                        {generatedDealContext.seller_product_summary || generatedDealContext.value_proposition}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-white/[0.06] flex flex-wrap gap-2">
                      {generatedDealContext.seller_research?.key_capabilities?.map((cap, i) => (
                        <span key={i} className="text-xs sm:text-sm font-semibold bg-blue-950/50 text-blue-300 px-3 py-1 border border-blue-500/30">
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Pain Points Breakdown Card */}
              <div className="border border-white/[0.08] p-6 sm:p-8 bg-[#0c0d12] space-y-6">
                <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4">
                  <div className="h-9 w-9 bg-rose-600/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                    <Flame className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white uppercase tracking-wider">Target Company Pain Points</h3>
                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Why their current setup is failing and where your solution wins</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {generatedDealContext.pain_points?.map((pain, idx) => (
                    <div key={idx} className="p-5 sm:p-6 bg-rose-950/20 border border-rose-800/30 flex items-start gap-4 transition-all hover:border-rose-700/50">
                      <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-1" />
                      <span className="text-sm sm:text-base text-rose-100 leading-relaxed font-medium">
                        {pain}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Value Propositions & How to Sell */}
              <div className="border border-white/[0.08] p-6 sm:p-8 bg-[#0c0d12] space-y-6">
                <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4">
                  <div className="h-9 w-9 bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white uppercase tracking-wider">Strategic Value Propositions & "How To Sell"</h3>
                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Quantifiable impact metrics & tailored positioning hooks</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {generatedDealContext.seller_value_propositions?.map((rawVp: any, idx: number) => {
                    const title = typeof rawVp === 'string' ? `Strategic Value Pillar #${idx + 1}` : (rawVp.title || rawVp.name || rawVp.headline || `Key Strategic Value Driver`);
                    const hook = typeof rawVp === 'string' ? rawVp : (rawVp.hook || rawVp.pitch || rawVp.value_proposition || rawVp.description || rawVp.value || 'Deliver quantifiable operational impact and team efficiency.');
                    const whatToMention = typeof rawVp === 'object' ? (rawVp.what_to_mention || rawVp.mention || rawVp.tactics || rawVp.key_points || rawVp.description || hook) : hook;
                    const impactMetric = typeof rawVp === 'object' ? (rawVp.impact_metric || rawVp.metric || rawVp.roi || rawVp.impact || 'High Impact Metric') : 'High ROI';

                    return (
                      <div key={idx} className="p-6 bg-[#11131a] border border-white/[0.08] space-y-4 flex flex-col justify-between transition-all hover:border-white/20">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 text-base sm:text-lg font-bold text-white">
                              <Target className="h-5 w-5 text-blue-400" />
                              <span>{title}</span>
                            </div>
                            <span className="text-xs sm:text-sm font-mono font-bold text-blue-400 bg-blue-950/60 border border-blue-500/40 px-3 py-1">
                              {impactMetric}
                            </span>
                          </div>
                          <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-medium">
                            {hook}
                          </p>
                        </div>
                        <div className="text-sm sm:text-base text-slate-300 bg-[#090a0f] p-4 border border-white/[0.06] border-l-4 border-l-blue-500">
                          <strong className="text-white">Winning Talking Point:</strong> {whatToMention}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Action Playbook (What to Mention & What to Avoid in 2 Columns) */}
              <div className="border border-white/[0.08] p-6 sm:p-8 bg-[#0c0d12] space-y-6">
                <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4">
                  <div className="h-9 w-9 bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white uppercase tracking-wider">Action Playbook & Live Tactics</h3>
                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5">High-impact talk tracks and critical negotiation pitfalls to avoid</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm sm:text-base">
                  <div className="p-6 bg-[#11131a] border border-white/[0.08] space-y-4">
                    <span className="font-bold text-white flex items-center gap-2.5 text-base sm:text-lg">
                      <Check className="h-5 w-5 text-blue-400" /> What to Mention
                    </span>
                    <ul className="space-y-3 text-slate-200">
                      {generatedDealContext.seller_action_playbook?.what_to_mention?.map((item: any, i: number) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="text-blue-400 text-lg font-bold">•</span>
                          <span className="leading-relaxed">{typeof item === 'string' ? item : (item.point || item.description || JSON.stringify(item))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-6 bg-[#11131a] border border-white/[0.08] space-y-4">
                    <span className="font-bold text-rose-400 flex items-center gap-2.5 text-base sm:text-lg">
                      <ShieldAlert className="h-5 w-5 text-rose-400" /> What to Avoid
                    </span>
                    <ul className="space-y-3 text-slate-200">
                      {generatedDealContext.seller_action_playbook?.what_to_avoid?.map((item: any, i: number) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="text-rose-400 text-lg font-bold">•</span>
                          <span className="leading-relaxed">{typeof item === 'string' ? item : (item.point || item.description || JSON.stringify(item))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* 5. High-Impact Discovery Questions */}
              <div className="border border-white/[0.08] p-6 sm:p-8 bg-[#0c0d12] space-y-6">
                <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4">
                  <div className="h-9 w-9 bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                    <HelpCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white uppercase tracking-wider">High-Impact Discovery Questions</h3>
                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Uncover pain and qualify budget with high-converting diagnostic questions</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {generatedDealContext.discovery_questions?.map((q: any, i: number) => (
                    <div key={i} className="p-5 bg-[#11131a] border border-white/[0.08] text-slate-200 italic leading-relaxed text-sm sm:text-base border-l-4 border-l-blue-500 flex items-center">
                      "{typeof q === 'string' ? q : (q.question || q.text || JSON.stringify(q))}"
                    </div>
                  ))}
                </div>
              </div>

              {/* 6. Likely Objections & Battlecard Rebuttal */}
              <div className="border border-white/[0.08] p-6 sm:p-8 bg-[#0c0d12] space-y-6">
                <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4">
                  <div className="h-9 w-9 bg-rose-600/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white uppercase tracking-wider">Top Predicted Objection & Battlecard Rebuttal</h3>
                    <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Prepare for the toughest buyer pushback before it happens</p>
                  </div>
                </div>

                {generatedDealContext.likely_objections?.[0] && (() => {
                  const rawObj: any = generatedDealContext.likely_objections[0];
                  const objTitle = typeof rawObj === 'string' ? rawObj : (rawObj.title || rawObj.objection || rawObj.name || 'We currently use an existing tool or internal process for this.');
                  const objHandling = typeof rawObj === 'object' ? (rawObj.suggestedHandling || rawObj.response || rawObj.counter || rawObj.rebuttal || rawObj.handling || 'Acknowledge current workflow before positioning live co-piloting advantage.') : 'Acknowledge current setup, highlight real-time execution benefits.';
                  return (
                    <div className="p-6 bg-rose-950/20 border border-rose-800/30 space-y-4">
                      <div className="flex items-center gap-2 text-rose-300 font-bold text-base sm:text-lg">
                        <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
                        <span>Predicted Objection: "{objTitle}"</span>
                      </div>
                      <div className="text-sm sm:text-base text-slate-200 leading-relaxed bg-[#090a0f] p-5 border-l-4 border-l-rose-500">
                        <strong className="text-white text-base block mb-1">Winning Rebuttal Talking Track:</strong>
                        {objHandling}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Bottom Action CTA Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-[#0c0d12] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setCurrentStage('input')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 text-sm sm:text-base text-slate-300 hover:text-white bg-[#11131a] border border-white/[0.08] hover:border-white/20 px-6 py-4 transition-all cursor-pointer font-semibold"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span>Back to Edit Inputs</span>
                </button>

                <button
                  type="button"
                  onClick={handleProceedToPersona}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 px-10 py-4 text-base sm:text-lg font-extrabold text-white shadow-xl shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  <span>Build Buyer Persona</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>

            </div>
          </>
        )}

      </div>
    )}

        {/* ========================================================
            STAGE 3: PERSONA BUILT & READY TO START CALL
        ======================================================== */}
        {currentStage === 'persona' && generatedDealContext && (
          <div className="space-y-8 max-w-6xl mx-auto w-full">
            
            {/* Title Hero */}
            <div className="text-center space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-3">
                <div className="inline-flex items-center gap-2 bg-blue-950/50 px-4 py-1.5 text-xs sm:text-sm font-bold text-blue-400 border border-blue-500/30">
                  <CheckCircle2 className="h-4 w-4 text-blue-400" />
                  <span>STEP 3 OF 3 • AI BUYER PERSONA CALIBRATED</span>
                </div>
                <div className="inline-flex items-center gap-2 bg-emerald-950/60 px-4 py-1.5 text-xs sm:text-sm font-mono font-bold text-emerald-400 border border-emerald-500/30">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>🧠 COPILOT MEMORY ARMED FOR {generatedDealContext.target_company.toUpperCase()}</span>
                </div>
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                Your AI Buyer Persona Is Ready
              </h2>
              <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
                Calibrated specifically to {generatedDealContext.target_company}'s pain points, objection patterns, and skepticism profile. Live Copilot is listening and will prompt you with winning battlecard cues.
              </p>
            </div>

            {/* Persona Card */}
            <div className="border border-white/[0.08] shadow-2xl p-6 sm:p-10 bg-[#0c0d12] relative overflow-hidden space-y-8">
              
              {/* Persona Header Banner */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-white/[0.08]">
                <img
                  src={generatedDealContext.target_persona?.avatarUrl || 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&auto=format&fit=crop&q=80'}
                  alt={generatedDealContext.target_persona?.name || 'Sarah Chen'}
                  className="h-24 w-24 object-cover border border-white/[0.12] shrink-0"
                />

                <div className="text-center sm:text-left space-y-2 flex-1">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
                      {generatedDealContext.target_persona?.name || 'Sarah Chen'}
                    </h3>
                    <span className="text-xs sm:text-sm font-bold bg-blue-950/60 text-blue-300 border border-blue-500/30 px-3.5 py-1">
                      {generatedDealContext.target_persona?.title || 'VP of Sales'}
                    </span>
                    <span className="text-xs sm:text-sm font-bold bg-[#11131a] text-slate-300 border border-white/[0.08] px-3.5 py-1">
                      {generatedDealContext.target_company}
                    </span>
                  </div>
                  <p className="text-sm sm:text-base text-slate-300">
                    Voice Gender: <strong className="text-white capitalize">{generatedDealContext.target_persona?.voiceGender || 'female'}</strong> • Call Style: <strong className="text-white">Short, Realistic Phone Bursts (Under 2 Sentences)</strong>
                  </p>
                </div>
              </div>

              {/* Behavioral Meters */}
              <div className="space-y-4">
                <h4 className="text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider">Psychological & Skepticism Profile</h4>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-5 bg-[#11131a] border border-white/[0.08] text-center space-y-2">
                    <span className="text-xs sm:text-sm uppercase font-bold text-slate-400">Skepticism</span>
                    <div className="text-2xl font-extrabold text-white">85%</div>
                    <div className="w-full bg-[#050507] h-2 overflow-hidden">
                      <div className="bg-blue-500 h-full w-[85%]" />
                    </div>
                  </div>

                  <div className="p-5 bg-[#11131a] border border-white/[0.08] text-center space-y-2">
                    <span className="text-xs sm:text-sm uppercase font-bold text-slate-400">Directness</span>
                    <div className="text-2xl font-extrabold text-white">90%</div>
                    <div className="w-full bg-[#050507] h-2 overflow-hidden">
                      <div className="bg-blue-500 h-full w-[90%]" />
                    </div>
                  </div>

                  <div className="p-5 bg-[#11131a] border border-white/[0.08] text-center space-y-2">
                    <span className="text-xs sm:text-sm uppercase font-bold text-slate-400">Price Sensitivity</span>
                    <div className="text-2xl font-extrabold text-white">75%</div>
                    <div className="w-full bg-[#050507] h-2 overflow-hidden">
                      <div className="bg-blue-500 h-full w-[75%]" />
                    </div>
                  </div>

                  <div className="p-5 bg-[#11131a] border border-white/[0.08] text-center space-y-2">
                    <span className="text-xs sm:text-sm uppercase font-bold text-slate-400">Technical Depth</span>
                    <div className="text-2xl font-extrabold text-white">80%</div>
                    <div className="w-full bg-[#050507] h-2 overflow-hidden">
                      <div className="bg-blue-500 h-full w-[80%]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Stance & Objection Pool */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm sm:text-base">
                
                <div className="p-6 bg-[#11131a] border border-white/[0.08] space-y-3">
                  <div className="flex items-center gap-2 font-bold text-rose-300 text-base">
                    <AlertTriangle className="h-5 w-5 text-rose-400" />
                    <span>Why {generatedDealContext.target_persona?.name || 'Sarah'} Is Skeptical</span>
                  </div>
                  <p className="text-slate-200 text-sm sm:text-base leading-relaxed">
                    {generatedDealContext.target_persona?.skepticism_reason || 
                     `Skeptical of new vendor claims. Requires measurable proof of ROI within 60 days and zero workflow disruption.`}
                  </p>
                </div>

                <div className="p-6 bg-[#11131a] border border-white/[0.08] space-y-3">
                  <div className="flex items-center gap-2 font-bold text-white text-base">
                    <CheckCircle2 className="h-5 w-5 text-blue-400" />
                    <span>Winning Criteria</span>
                  </div>
                  <p className="text-slate-200 text-sm sm:text-base leading-relaxed">
                    {generatedDealContext.target_persona?.winning_criteria || 
                     `Demonstrate clear solution to their pain point (${generatedDealContext.pain_points?.[0] || 'ramp time'}) and address existing tooling smoothly.`}
                  </p>
                </div>

              </div>

              {/* Call Objective Badge */}
              <div className="p-5 bg-[#11131a] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm sm:text-base">
                <div className="flex items-center gap-3">
                  <Target className="h-5 w-5 text-blue-400" />
                  <span className="font-bold text-white">Roleplay Call Objective:</span>
                </div>
                <span className="text-slate-200 font-semibold">
                  {generatedDealContext.call_objective || 'Secure 14-day technical pilot evaluation'}
                </span>
              </div>

              {/* Call Action Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setCurrentStage('strategy')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 text-sm sm:text-base text-slate-300 hover:text-white bg-[#11131a] border border-white/[0.08] hover:border-white/20 px-6 py-4 transition-all cursor-pointer font-semibold"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span>Back to Strategy Brief</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartCall}
                  className="w-full sm:w-auto flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 px-10 py-4 text-base sm:text-lg font-extrabold text-white shadow-xl shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  <PhoneCall className="h-5 w-5" />
                  <span>Start Roleplay Call Simulator</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>

            </div>

          </div>
        )}

      </main>

    </div>
  );
};

export default DealGenerator;
