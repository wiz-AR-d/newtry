import React, { useState, useEffect, useRef } from 'react';
import type { DealContext, CopilotCue } from '../types';
import './CopilotExtension.css';

interface ConversationTurnProp {
  speaker: 'user' | 'agent' | string;
  text: string;
  timestamp?: number;
}

interface LiveCopilotWidgetProps {
  dealContext?: DealContext | null;
  dealId?: string;
  activeCue?: CopilotCue | null;
  allCues?: CopilotCue[];
  isAnalyzing?: boolean;
  currentTone?: string;
  turns?: ConversationTurnProp[];
  streamingText?: string;
  className?: string;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  keywords: string[];
}

export const LiveCopilotWidget: React.FC<LiveCopilotWidgetProps> = ({
  dealContext,
  dealId,
  activeCue,
  allCues = [],
  isAnalyzing = false,
  currentTone = 'Calm & Receptive',
  turns = [],
  streamingText = '',
  className = '',
}) => {
  // Swipeable Slide Tab: 'hud' | 'transcript'
  const [sidepanelTab, setSidepanelTab] = useState<'hud' | 'transcript'>('hud');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [completedCardIds, setCompletedCardIds] = useState<Set<string>>(new Set());

  // Swipe gesture detection (Touch / Pointer drag & Trackpad wheel)
  const [gestureStartX, setGestureStartX] = useState<number | null>(null);
  const wheelCooldownRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const targetCompany = dealContext?.target_company || 'Prospect';
  const personaName = dealContext?.target_persona?.name || 'Customer';

  // Dynamic Call Checklist synthesized from DealContext
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);

  useEffect(() => {
    if (dealContext) {
      const p1 = dealContext.pain_points?.[0] || 'Uncover operational bottlenecks';
      const vp1 = dealContext.seller_value_propositions?.[0];
      const obj1 = dealContext.likely_objections?.[0];
      const diff1 = dealContext.seller_action_playbook?.key_differentiators?.[0] || 'Sub-second real-time battlecards';
      const avoid1 = dealContext.seller_action_playbook?.what_to_avoid?.[0] || 'Do not offer premature discounts';
      const objOutcome = dealContext.call_objective || 'Confirm 14-day technical sandbox pilot';

      const items: ChecklistItem[] = [
        {
          id: 'step-intro',
          title: 'Rapport & Introduction',
          description: `Introduce CloseIQ and build initial rapport with ${personaName}`,
          completed: false,
          keywords: ['hello', 'hi', 'welcome', 'closeiq', 'doing today', 'thanks for connecting']
        },
        {
          id: 'step-pain',
          title: 'Probe Core Pain Point',
          description: `Unpack bottleneck: "${p1.slice(0, 65)}..."`,
          completed: false,
          keywords: ['bottleneck', 'ramp', 'challenge', 'takes', 'months', 'quota', 'problem', 'delay']
        },
        {
          id: 'step-value',
          title: 'Pitch Value & ROI Metric',
          description: vp1 ? `${vp1.title} (${vp1.impact_metric})` : 'Demonstrate quantifiable ramp reduction',
          completed: false,
          keywords: ['metric', 'ramp', 'percent', 'fast', 'save', 'roi', 'hours', 'impact']
        },
        {
          id: 'step-objection',
          title: 'Address Key Objection',
          description: obj1 ? `Handle "${obj1.title.slice(0, 50)}..."` : 'Address competitor / pricing hesitation',
          completed: false,
          keywords: ['gong', 'cost', 'budget', 'price', 'expensive', 'already', 'tool', 'quarter']
        },
        {
          id: 'step-playbook',
          title: 'Deploy Differentiators',
          description: `Highlight ${diff1.slice(0, 45)} (Avoid: ${avoid1.slice(0, 40)})`,
          completed: false,
          keywords: ['live', 'real-time', 'copilot', 'different', 'whisper', 'in-call', 'sandbox']
        },
        {
          id: 'step-close',
          title: 'Secure Call Objective',
          description: objOutcome,
          completed: false,
          keywords: ['pilot', 'trial', 'sandbox', 'next step', 'schedule', 'demo', 'evaluation', 'tuesday']
        }
      ];
      setChecklistItems(items);
    }
  }, [dealContext, personaName]);

  // Auto-complete checklist items when rep/customer mentions keywords
  useEffect(() => {
    if (turns.length === 0 || checklistItems.length === 0) return;
    const latestTurn = turns[turns.length - 1]?.text?.toLowerCase() || '';
    if (!latestTurn) return;

    setChecklistItems(prev => prev.map(item => {
      if (item.completed) return item;
      const matched = item.keywords.some(kw => latestTurn.includes(kw));
      return matched ? { ...item, completed: true } : item;
    }));
  }, [turns]);

  // Auto-scroll transcript on new speech
  useEffect(() => {
    if (sidepanelTab === 'transcript') {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [turns, streamingText, sidepanelTab]);

  // Gesture Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    setGestureStartX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (gestureStartX === null) return;
    const deltaX = e.clientX - gestureStartX;
    if (deltaX > 20) {
      // Swiped right -> Live Feed / Transcript
      setSidepanelTab('transcript');
    } else if (deltaX < -20) {
      // Swiped left -> HUD Cues
      setSidepanelTab('hud');
    }
    setGestureStartX(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (wheelCooldownRef.current) return;
    if (Math.abs(e.deltaX) > 12) {
      if (e.deltaX > 12) {
        setSidepanelTab('transcript');
      } else if (e.deltaX < -12) {
        setSidepanelTab('hud');
      }
      wheelCooldownRef.current = true;
      setTimeout(() => {
        wheelCooldownRef.current = false;
      }, 250);
    }
  };

  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const toggleChecklist = (id: string) => {
    setChecklistItems(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Checklist calculations
  const totalChecklist = checklistItems.length;
  const completedChecklist = checklistItems.filter(i => i.completed).length;
  const checklistPercent = totalChecklist > 0 ? Math.round((completedChecklist / totalChecklist) * 100) : 0;

  // Normalized cue cards list
  const cueCards = (allCues.length > 0 ? allCues : (activeCue ? [activeCue] : [])).map((cue, idx) => {
    const cardId = cue.id || `cue-${idx}`;
    const category = (cue.category || cue.type || 'TACTIC').toUpperCase();
    const searchQuery = cue.searchQuery || cue.title || 'Client Objection Guidance';
    const exactResponse = cue.exactResponse || cue.winningRebuttal || cue.suggestedQuestion || '';
    
    // Normalize bullets
    let bullets = cue.bullets;
    if (!bullets || bullets.length === 0) {
      bullets = [
        {
          id: `${cardId}-b0`,
          tag: cue.type ? cue.type.toUpperCase().replace('_', ' ') : 'TACTIC',
          directionText: cue.description || cue.suggestedAction || 'Deliver high-leverage talking track.'
        }
      ];
      if (cue.suggestedAction && cue.description && cue.suggestedAction !== cue.description) {
        bullets.push({
          id: `${cardId}-b1`,
          tag: 'ACTION',
          directionText: cue.suggestedAction
        });
      }
      if (cue.suggestedQuestion) {
        bullets.push({
          id: `${cardId}-b2`,
          tag: 'PROBE',
          directionText: cue.suggestedQuestion
        });
      }
    }

    return {
      id: cardId,
      category,
      searchQuery,
      exactResponse,
      bullets,
      isReflex: cue.isReflex
    };
  });

  // Exact 1:1 scrolling & focus state from copilot/packages/ui/src/App.jsx
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const focusedCardIdRef = useRef<string | null>(null);
  useEffect(() => {
    focusedCardIdRef.current = focusedCardId;
  }, [focusedCardId]);

  const suggestionsContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProgrammaticScrollingRef = useRef(false);
  const cueCardsRef = useRef(cueCards);
  useEffect(() => {
    cueCardsRef.current = cueCards;
  }, [cueCards]);

  // Measure container height dynamically to lock exact 2-card viewport sizing
  const [containerHeight, setContainerHeight] = useState<number>(0);

  useEffect(() => {
    const container = suggestionsContainerRef.current;
    if (!container) return;
    
    const updateHeight = () => {
      if (container.clientHeight > 0) {
        setContainerHeight(container.clientHeight);
      }
    };
    
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(container);
    return () => observer.disconnect();
  }, [sidepanelTab]);

  const slotHeight = containerHeight > 0 
    ? (cueCards.length > 1 ? Math.floor((containerHeight - 10) / 2) : containerHeight)
    : 0;

  // triggerFocusOnCard: sets focused card and smooth-scrolls to (cardIndex - 1) * itemHeight
  const triggerFocusOnCard = (cardId: string) => {
    setFocusedCardId(cardId);
    
    setTimeout(() => {
      const container = suggestionsContainerRef.current;
      if (!container) return;
      const cardIndex = cueCardsRef.current.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return;
      
      const itemHeight = container.clientHeight > 0 ? (container.clientHeight / 2) : 220;
      const targetScrollTop = Math.max(0, (cardIndex - 1) * itemHeight);
      
      isProgrammaticScrollingRef.current = true;
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      
      setTimeout(() => {
        isProgrammaticScrollingRef.current = false;
      }, 500);
    }, 50);
  };

  // handleSuggestionsScroll: snaps debounced scroll to nearest index and focuses card in Slot 2
  const handleSuggestionsScroll = () => {
    if (isProgrammaticScrollingRef.current) return;

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      const container = suggestionsContainerRef.current;
      if (!container || cueCardsRef.current.length === 0) return;

      const itemHeight = container.clientHeight > 0 ? (container.clientHeight / 2) : 220;
      const scrollTop = container.scrollTop;

      // Find nearest index to snap
      const nearestIndex = Math.round(scrollTop / itemHeight);
      const targetScrollTop = nearestIndex * itemHeight;

      // Snap scroll
      isProgrammaticScrollingRef.current = true;
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      
      setTimeout(() => {
        isProgrammaticScrollingRef.current = false;
      }, 500);

      // Focus card in Slot 2 (nearestIndex + 1)
      const targetCardIndex = Math.min(cueCardsRef.current.length - 1, nearestIndex + 1);
      if (targetCardIndex >= 0) {
        const targetCard = cueCardsRef.current[targetCardIndex];
        setFocusedCardId(targetCard.id);
      }
    }, 800);
  };

  // Auto-focus and scroll forward to newest cards on mount, resize, or when cue cards update
  useEffect(() => {
    if (cueCards.length > 0) {
      const latestCard = cueCards[cueCards.length - 1];
      triggerFocusOnCard(latestCard.id);
    }
  }, [cueCards.length, containerHeight > 0]);

  // Proportional line sizing logic exactly from copilot/packages/ui/src/App.jsx:
  const cardContentLines = cueCards.map(card => {
    const bulletLines = card.bullets ? card.bullets.length : 0;
    const responseLines = card.exactResponse ? Math.ceil(card.exactResponse.length / 35) : 0;
    const headerLine = 1;
    return headerLine + bulletLines + responseLines;
  });

  const totalLines = cardContentLines.reduce((sum, l) => sum + l, 0) || 1;

  return (
    <div 
      className={`copilot-extension-host ${theme === 'dark' ? 'theme-dark' : 'theme-light'} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Top Extension Header */}
      <header className="ext-header-bar">
        <div className="ext-brand-wrap">
          <span className="ext-brand-logo">CloseIQ</span>
          <span className="ext-brand-badge">
            {sidepanelTab === 'hud' ? 'HUD' : 'LIVE FEED'}
          </span>
          {isAnalyzing && (
            <span className="text-[10px] text-purple-400 font-mono animate-pulse">
              ● Analyzing...
            </span>
          )}
        </div>

        <div className="ext-controls-wrap">
          {/* 2-Slide Swipe Dots Indicator */}
          <div 
            className="ext-view-dots" 
            title="Swipe left/right or click to switch view"
          >
            <span 
              onClick={() => setSidepanelTab('hud')} 
              className={`ext-dot ${sidepanelTab === 'hud' ? 'active' : 'inactive'}`}
              title="HUD Battlecards"
            />
            <span 
              onClick={() => setSidepanelTab('transcript')} 
              className={`ext-dot ${sidepanelTab === 'transcript' ? 'active' : 'inactive'}`}
              title="Live Transcript Feed"
            />
          </div>

          {/* Light / Dark Mode Toggle */}
          <button 
            type="button" 
            onClick={toggleTheme} 
            className="ext-theme-btn"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>

          {/* Connection / Memory Status */}
          <div className="ext-status-pill">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>ARMED</span>
          </div>
        </div>
      </header>

      {/* Top Window: Call Milestones Checklist */}
      <section className="hud-checklist-container">
        <div className="checklist-header">
          <div className="checklist-title-row">
            <span className="checklist-title">Call Checklist</span>
            <span className="playbook-badge">{targetCompany.toUpperCase()}</span>
          </div>
          
          <div className="checklist-progress-wrapper">
            <div className="checklist-progress-bar">
              <div 
                className="checklist-progress-fill" 
                style={{ width: `${checklistPercent}%` }}
              />
            </div>
            <span className="checklist-progress-text">
              {completedChecklist}/{totalChecklist} Completed ({checklistPercent}%)
            </span>
          </div>
        </div>

        <div className="checklist-items-list">
          {checklistItems.map(item => (
            <div 
              key={item.id}
              className={`checklist-item ${item.completed ? 'completed' : ''}`}
              onClick={() => toggleChecklist(item.id)}
              title="Click to check/uncheck milestone"
            >
              <div className="checklist-checkbox">
                {item.completed && <span className="checkmark-icon">✓</span>}
              </div>
              <div className="checklist-item-details">
                <span className="checklist-item-title">{item.title}</span>
                <span className="checklist-item-desc">{item.description}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Window: 2-Slide Viewport */}
      <div className="copilot-slide-viewport">
        {sidepanelTab === 'hud' ? (
          /* Slide 1: Live Dynamic HUD Cues (Exact Two-Card View from copilot/packages/ui) */
          <section className="hud-suggestions-scroll">
            {cueCards.length === 0 ? (
              /* Empty State Radar Pulse */
              <div className="hud-background-canvas">
                <div className="radar-icon-wrapper">
                  <div className="radar-pulse ring-1" />
                  <div className="radar-pulse ring-2" />
                  <div className="radar-pulse ring-3" />
                  <div className="radar-core">💡</div>
                </div>
                <p className="hud-empty-title">Monitoring live pitch...</p>
                <span className="hud-empty-sub">
                  Groq LPU will inject real-time objection battlecards and negotiation cues here.
                </span>
              </div>
            ) : (
              /* Two-Card View with Proportional Line Math and Smooth Snap-Scroll */
              <div 
                ref={suggestionsContainerRef}
                className="suggestions-timeline-container"
                onScroll={handleSuggestionsScroll}
              >
                {cueCards.map((card, idx) => {
                  const isCompleted = completedCardIds.has(card.id);
                  const isFocused = card.id === (focusedCardId || cueCards[cueCards.length - 1]?.id);

                  const myLines = cardContentLines[idx] || 1;
                  const ratio = cueCards.length <= 2 ? (myLines / totalLines) : 0.5;
                  const flexValue = cueCards.length <= 2 ? ratio : 1;

                  // Dynamic font scaling to prevent tall cards from overflowing too much
                  const N = card.bullets ? card.bullets.length : 0;
                  const responseLen = card.exactResponse ? card.exactResponse.length : 0;

                  let bulletFontSize = '13px';
                  let responseFontSize = '12px';
                  let bulletGap = '8px';
                  let cardPad = '14px 18px';
                  let exactResponseMarginTop = '10px';
                  let exactResponsePadding = '8px 10px';

                  if (N >= 5 || (N >= 4 && responseLen > 100)) {
                    bulletFontSize = '11px';
                    responseFontSize = '10.5px';
                    bulletGap = '3px';
                    cardPad = '8px 12px';
                    exactResponseMarginTop = '4px';
                    exactResponsePadding = '4px 6px';
                  } else if (N >= 3 || responseLen > 120) {
                    bulletFontSize = '11.5px';
                    responseFontSize = '11px';
                    bulletGap = '4px';
                    cardPad = '10px 14px';
                    exactResponseMarginTop = '6px';
                    exactResponsePadding = '6px 8px';
                  }

                  const cardStyle: React.CSSProperties = {
                    height: slotHeight > 0 ? `${slotHeight}px` : 'calc(50% - 5px)',
                    minHeight: slotHeight > 0 ? `${slotHeight}px` : 'calc(50% - 5px)',
                    maxHeight: slotHeight > 0 ? `${slotHeight}px` : 'calc(50% - 5px)',
                    flexShrink: 0,
                    scrollSnapAlign: 'start',
                    boxSizing: 'border-box',
                    padding: cardPad,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    overflow: 'hidden',
                  };

                  return (
                    <div 
                      key={card.id}
                      id={`timeline-card-${card.id}`}
                      className={`timeline-cue-item ${isFocused ? 'focused' : ''} ${isCompleted ? 'completed' : ''}`}
                      style={cardStyle}
                      onClick={() => triggerFocusOnCard(card.id)}
                    >
                      <div className="timeline-cue-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                        <div className="timeline-cue-header">
                          <span className="timeline-cue-number">
                            Card {idx + 1} • {card.category}
                          </span>
                          {card.searchQuery && (
                            <span className="timeline-cue-query-badge" title={card.searchQuery}>
                              {card.searchQuery}
                            </span>
                          )}
                        </div>

                        {/* Direction Bullets with Tag Badges */}
                        <div className="card-bullets-list" style={{ gap: bulletGap, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          {card.bullets.map(b => (
                            <div key={b.id} className="bullet-item" style={{ marginBottom: bulletGap }}>
                              {b.tag && (
                                <span className="bullet-tag-badge" style={{ padding: '2px 6px', fontSize: '9px' }}>
                                  {b.tag}
                                </span>
                              )}
                              <span className="timeline-cue-instruction" style={{ fontSize: bulletFontSize, lineHeight: '1.2' }}>
                                {b.directionText}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Exact Speech Quote with 1-Click Copy */}
                        {card.exactResponse && (
                          <div 
                            className="card-exact-response-speech"
                            style={{ marginTop: exactResponseMarginTop, padding: exactResponsePadding }}
                          >
                            <p className="speech-quote-text" style={{ fontSize: responseFontSize }}>
                              "{card.exactResponse}"
                            </p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(card.exactResponse, card.id);
                              }}
                              className="copy-speech-btn"
                              title="Copy exact response to clipboard"
                            >
                              {copiedId === card.id ? '✓' : '⎘'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          /* Slide 2: Live Conversation Transcript Feed */
          <section className="transcript-scroll-area">
            {turns.length === 0 && !streamingText && (
              <div className="text-center text-slate-500 my-auto text-xs py-8 px-4 leading-relaxed">
                No speech transcribed yet.<br />
                Speak into the microphone to see real-time conversation feed here.
              </div>
            )}

            {turns.map((turn, index) => {
              const isRep = turn.speaker === 'user';
              const cardClass = isRep ? 'align-rep' : 'align-customer';
              const themeClass = isRep ? 'theme-rep' : 'theme-customer';
              const speakerLabel = isRep ? 'You (Rep)' : `${personaName} (${targetCompany})`;

              return (
                <div key={index} className={`utterance-card-row ${cardClass}`}>
                  <div className={`utterance-card ${themeClass}`}>
                    <div className="utt-meta">
                      <span className="utt-speaker-label">{speakerLabel}</span>
                      {turn.timestamp && (
                        <span className="utt-timestamp">
                          {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="m-0 leading-relaxed text-left">
                      {turn.text}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Interim Speech Drafting Indicator */}
            {streamingText && (
              <div className="utterance-card-row align-customer">
                <div className="utterance-card theme-interim">
                  <div className="utt-meta">
                    <span className="utt-speaker-label text-slate-400">Listening...</span>
                  </div>
                  <p className="m-0 leading-relaxed text-left italic text-slate-400">
                    {streamingText}
                  </p>
                </div>
              </div>
            )}

            <div ref={transcriptEndRef} />
          </section>
        )}
      </div>
    </div>
  );
};
