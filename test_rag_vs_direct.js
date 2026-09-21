import dotenv from 'dotenv';
dotenv.config();

import { ingestDealDossier, queryClientRAG, getEmbedder } from './copilot_rag.js';

// Realistic Mock Data representing the output of the Friend's Research Engine
// (User Inputs: InCruiter target url, CloseIQ seller url, sales copilot product + Live Web Scrape -> LLM Deal Synthesis)
const mockFriendEngineOutput = {
  deal_id: 'deal_benchmark_incruiter_2026',
  target_company: 'InCruiter',
  target_company_url: 'https://incruiter.com',
  target_company_description: 'InCruiter provides automated interview screening, Video Interview Platforms, and Interview-as-a-Service for enterprise tech hiring.',
  seller_company: 'CloseIQ',
  seller_product_name: 'CloseIQ Live AI Copilot & Battlecards',
  seller_product_description: 'Real-time in-call objection handling, automated CRM sync, and sub-second live sales battlecards.',
  company_research: {
    industry: 'HR Tech / Automated Interviewing',
    companySize: '180-250 employees',
    techStack: ['Salesforce CRM', 'HubSpot', 'Gong.io Call Recording', 'Zoom', 'Slack'],
    initiatives: [
      'Scale SDR team from 15 to 40 reps in Q3',
      'Reduce sales rep ramp time from 14 weeks down to 6 weeks',
      'Improve enterprise demo-to-close win rates against HackerRank and Karat'
    ]
  },
  seller_research: {
    overview: 'CloseIQ is an in-call real-time guidance platform that listens to live sales calls and surfaces sub-500ms winning battlecards.',
    key_capabilities: [
      '0ms Reflex trigger for competitor and pricing rebuttals',
      'Sub-500ms live cue generation on Groq LPU',
      'Automated CRM sync with zero rep typing'
    ],
    unique_advantages: [
      'Active during the call (live assist) unlike Gong which is passive post-call review',
      'Trained specifically on client ICP and real-time deal intelligence'
    ]
  },
  pain_points: [
    'New sales reps take 14+ weeks to reach quota, burning $12k/month per rep in unproductive ramp salary',
    'Reps consistently freeze or discount heavily when prospects mention legacy competitors like HackerRank or Karat',
    'Sales managers spend 6+ hours/week manually reviewing Gong recordings after deals are already lost',
    'Reps fail to uncover executive budget and decision timeline during initial 30-minute discovery calls'
  ],
  buyer_priorities: [
    'Immediate time-to-value with < 10 minute rep onboarding',
    'Zero desktop clutter or screen lag during live Zoom calls',
    'Verifiable reduction in SDR ramp time within first 60 days'
  ],
  seller_value_propositions: [
    {
      title: 'In-Call Rescue vs Post-Call Autopsy (Gong Alternative/Complement)',
      hook: 'Gong tells you why you lost the deal yesterday; CloseIQ whispers the winning move while the buyer is still on the line.',
      what_to_mention: 'Sub-second battlecards that feed reps exact differentiation when competitors are brought up.',
      impact_metric: 'Cut SDR ramp time by 48% and reduce lost enterprise deals by 22%'
    },
    {
      title: 'Guaranteed Rep Quota Acceleration',
      hook: 'Turn month-2 junior reps into top-tier closers by eliminating knowledge gaps in real-time.',
      what_to_mention: 'Zero prep battlecard sync that ingests buyer tech stack and pain points before the call starts.',
      impact_metric: 'Accelerate first-quota attainment by 5.5 weeks'
    }
  ],
  seller_action_playbook: {
    what_to_mention: [
      'Specific integration with InCruiter Zoom and Salesforce setup',
      'Live in-call assistance vs passive post-call recording',
      '48% faster onboarding ramp metric'
    ],
    what_to_do: [
      'Anchor immediately on the cost of SDR ramp delay ($12k/month per rep)',
      'Acknowledge Gong is great for call recording, position CloseIQ as the live copilot',
      'Offer a 14-day live sandbox with 3 of their newest SDRs'
    ],
    what_to_avoid: [
      'Do NOT tell them to replace Gong; position CloseIQ as the real-time execution layer on top of Gong',
      'Do NOT get bogged down in deep LLM architecture details; focus on speed and quota impact',
      'Do NOT offer discounts before establishing value'
    ],
    key_differentiators: [
      'Sub-500ms real-time latency vs 2-hour post-call processing',
      'Reflex objection matching that triggers before the rep gets flustered',
      'Zero CRM data entry fatigue'
    ]
  },
  discovery_questions: [
    'When a junior rep gets hit with a tough objection about HackerRank or pricing, how do they usually respond right now?',
    'How many new SDRs are you planning to ramp this quarter, and what is your target ramp time?',
    'How many hours do your sales managers currently spend listening to recorded calls each week?'
  ],
  likely_objections: [
    {
      title: 'We already use Gong for call recording and conversation intelligence.',
      category: 'competition',
      description: 'Prospect thinks Gong is already solving their sales enablement needs.',
      suggestedHandling: 'We love Gong—it is the gold standard for call recording and post-game autopsy. But Gong tells you why you lost after the call ends. CloseIQ is your live coach in the rep\'s earpiece while the buyer is still on the line, preventing the deal from being lost in the first place.'
    },
    {
      title: 'Our software budget is completely frozen until Q4.',
      category: 'pricing',
      description: 'Prospect is hesitant about approving new software spend.',
      suggestedHandling: 'Totally understand budget caution. At an average deal size of $25k, if CloseIQ helps just one of your reps save a single deal this quarter that would have slipped, the platform pays for itself 3x over. Would you be open to testing it with 3 reps to verify that math?'
    },
    {
      title: 'Will this distract reps during live customer calls?',
      category: 'complexity',
      description: 'Fear that popups or cues will break rep flow.',
      suggestedHandling: 'We designed CloseIQ specifically with cognitive ergonomics in mind: cues are max 20 words, silent, and only trigger when an objection or critical pivot is detected, not continuous chatter.'
    }
  ],
  target_persona: {
    name: 'Sarah Chen',
    title: 'VP of Sales',
    company: 'InCruiter',
    skepticism_reason: 'Burned by previous AI tools that added rep noise without boosting closed-won revenue.',
    winning_criteria: 'Proof of cutting sales rep ramp time by at least 3 weeks within 60 days.'
  },
  call_objective: 'Secure agreement for a 14-day sandbox pilot with 3 ramping SDRs.'
};

// Formatter for Direct In-Context Injection (Zero-RAG)
function formatDirectDossierPrompt(deal, focusText) {
  const p = deal.target_persona;
  const ap = deal.seller_action_playbook;
  
  return `You are CloseIQ's elite live AI Sales Copilot. You are listening to an active call with ${deal.target_company}.
TARGET BUYER: ${p?.name || 'Prospect'}, ${p?.title || 'Decision Maker'} at ${deal.target_company}.
BUYER SKEPTICISM & WINNING CRITERIA: ${p?.skepticism_reason} | Must see: ${p?.winning_criteria}
CALL OBJECTIVE: ${deal.call_objective}

=== COMPLETE REAL-TIME CLIENT INTELLIGENCE DOSSIER ===
COMPANY REALITY:
- What they do: ${deal.target_company_description}
- Tech Stack: ${deal.company_research?.techStack?.join(', ')}
- Key Strategic Initiatives: ${deal.company_research?.initiatives?.join('; ')}

ACUTE PAIN POINTS:
${deal.pain_points?.map((pt, i) => `${i+1}. ${pt}`).join('\n')}

VALUE PROPOSITIONS & QUANTIFIABLE METRICS:
${deal.seller_value_propositions?.map(vp => `• [${vp.title}]: Hook: "${vp.hook}" | Metric: ${vp.impact_metric}`).join('\n')}

LIKELY OBJECTIONS & WINNING REBUTTAL TRACKS:
${deal.likely_objections?.map(o => `• [${o.category.toUpperCase()}] "${o.title}" -> REBUTTAL: "${o.suggestedHandling}"`).join('\n')}

PLAYBOOK TACTICS:
• MENTION: ${ap?.what_to_mention?.join('; ')}
• DO: ${ap?.what_to_do?.join('; ')}
• CRITICAL TO AVOID: ${ap?.what_to_avoid?.join('; ')}
• KEY DIFFERENTIATORS: ${ap?.key_differentiators?.join('; ')}

RECOMMENDED DISCOVERY QUESTIONS:
${deal.discovery_questions?.map((q, i) => `${i+1}. ${q}`).join('\n')}

=== ACTIVE CALL TRANSCRIPT JUST HEARD ===
PROSPECT JUST SAID: "${focusText}"

TASK:
Generate ONE hyper-targeted tactical battlecard cue for the sales rep.
STRICT OUTPUT FORMAT: Output ONLY valid JSON:
{
  "type": "objection" | "value_prop" | "discovery_question",
  "title": "Short Punchy Title with Emoji (under 6 words)",
  "description": "1 concise sentence explaining the tactical angle",
  "winningRebuttal": "Exact quote for the rep to speak out loud, under 25 words",
  "suggestedAction": "Tactical action for the rep (under 15 words)",
  "suggestedQuestion": "High-leverage follow up question"
}`.trim();
}

// Formatter for Vector RAG Prompt (Top 2 chunks only)
function formatRagPrompt(deal, focusText, retrievedChunks) {
  const p = deal.target_persona;
  const ragFacts = retrievedChunks.map(c => c.parent_text).join('\n\n');

  return `You are CloseIQ's live AI Sales Copilot listening to an active call with ${deal.target_company}.
TARGET BUYER: ${p?.name || 'Prospect'}, ${p?.title || 'Decision Maker'}.
BUYER SKEPTICISM: ${p?.skepticism_reason}

GROUNDED CLIENT DOSSIER FACTS (RETRIEVED VIA VECTOR SEARCH):
${ragFacts}

THE CALL TRANSCRIPT JUST HEARD:
PROSPECT: "${focusText}"

TASK:
Provide the sales rep with ONE instant, high-conversion tactical battlecard cue.
STRICT OUTPUT FORMAT: Output ONLY valid JSON matching this schema:
{
  "type": "objection" | "value_prop" | "discovery_question",
  "title": "Short Punchy Title with Emoji",
  "description": "1 concise sentence explaining the tactical angle",
  "winningRebuttal": "Exact quote for the rep to speak out loud, under 25 words",
  "suggestedAction": "Tactical action for the rep (under 15 words)",
  "suggestedQuestion": "High-leverage follow up question"
}`.trim();
}

async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const startTime = Date.now();
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
      max_tokens: 1000
    })
  });

  const duration = Date.now() - startTime;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API Error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return { cue: parsed, duration, usage: data.usage };
}

async function main() {
  console.log('================================================================');
  console.log('  CLOSEIQ-TRY BENCHMARK: VECTOR RAG vs DIRECT IN-CONTEXT DOSSIER');
  console.log('================================================================\n');

  // Step 1: Pre-index into MiniLM RAG for testing
  console.log('[Setup] Indexing Deal Dossier into Vector Store...');
  const ingestStart = Date.now();
  await ingestDealDossier(mockFriendEngineOutput);
  console.log(`✓ Vector Indexing Complete in ${Date.now() - ingestStart}ms.\n`);

  // Test Test Scenarios
  const testScenarios = [
    {
      name: 'Scenario 1: Competitor Objection (Gong)',
      speech: "We already invested a fortune in Gong last year, so why would we need another tool?"
    },
    {
      name: 'Scenario 2: Subtle Pain Point (SDR Ramp Delay)',
      speech: "Our biggest headache right now is onboarding 25 new SDRs next month. It takes them almost 4 months before they start hitting quota."
    },
    {
      name: 'Scenario 3: Budget Freeze Objection',
      speech: "Honestly, software spend is totally frozen until Q4 unless you can prove this pays for itself immediately."
    }
  ];

  for (const scenario of testScenarios) {
    console.log(`----------------------------------------------------------------`);
    console.log(`TEST: ${scenario.name}`);
    console.log(`PROSPECT UTTERANCE: "${scenario.speech}"\n`);

    // --- APPROACH A: VECTOR RAG ---
    const ragStart = Date.now();
    const retrieved = await queryClientRAG(scenario.speech, mockFriendEngineOutput.deal_id, 2);
    const retrievalTime = Date.now() - ragStart;
    
    console.log(`[RAG Retrieval] Retrieved ${retrieved.length} chunks in ${retrievalTime}ms:`);
    retrieved.forEach((c, idx) => {
      console.log(`  Chunk ${idx + 1} (${c.metadata?.type}): ${c.text.slice(0, 75)}...`);
    });

    const ragPrompt = formatRagPrompt(mockFriendEngineOutput, scenario.speech, retrieved);
    const ragLlmRes = await callGroq(ragPrompt);
    const totalRagLatency = retrievalTime + ragLlmRes.duration;

    console.log(`\n[APPROACH A: VECTOR RAG RESULT]`);
    console.log(`  Total Latency: ${totalRagLatency}ms (Embed/Search: ${retrievalTime}ms, Groq: ${ragLlmRes.duration}ms)`);
    console.log(`  Prompt Tokens: ${ragLlmRes.usage?.prompt_tokens}`);
    console.log(`  Cue Title: "${ragLlmRes.cue.title}"`);
    console.log(`  Winning Rebuttal: "${ragLlmRes.cue.winningRebuttal}"`);
    console.log(`  Suggested Question: "${ragLlmRes.cue.suggestedQuestion}"`);

    // --- APPROACH B: DIRECT IN-CONTEXT (ZERO-RAG) ---
    const directPrompt = formatDirectDossierPrompt(mockFriendEngineOutput, scenario.speech);
    const directLlmRes = await callGroq(directPrompt);
    const totalDirectLatency = directLlmRes.duration;

    console.log(`\n[APPROACH B: DIRECT IN-CONTEXT DOSSIER (ZERO-RAG)]`);
    console.log(`  Total Latency: ${totalDirectLatency}ms (Embed/Search: 0ms, Groq: ${directLlmRes.duration}ms)`);
    console.log(`  Prompt Tokens: ${directLlmRes.usage?.prompt_tokens}`);
    console.log(`  Cue Title: "${directLlmRes.cue.title}"`);
    console.log(`  Winning Rebuttal: "${directLlmRes.cue.winningRebuttal}"`);
    console.log(`  Suggested Question: "${directLlmRes.cue.suggestedQuestion}"`);

    // Comparison summary
    const latencyDiff = totalRagLatency - totalDirectLatency;
    console.log(`\n>>> DELTA: Direct In-Context was ${latencyDiff > 0 ? `${latencyDiff}ms FASTER` : `${Math.abs(latencyDiff)}ms slower`}. Token Difference: ${directLlmRes.usage?.prompt_tokens - ragLlmRes.usage?.prompt_tokens} tokens.`);
    console.log('----------------------------------------------------------------\n');
  }

  console.log('================================================================');
  console.log('BENCHMARK COMPLETE');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Benchmark Error:', err);
  process.exit(1);
});
