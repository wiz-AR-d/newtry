import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { ingestDealDossier, queryClientRAG } from './copilot_rag.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// In-Memory Shared Deal Context & Session Stores
const dealStore = new Map();
const sessionStore = new Map();

// --- Speech Emotion Recognition (SER) Pipeline (Lazy Loaded) ---
let audioClassifier = null;
let isAudioClassifierLoading = false;

async function getAudioClassifier() {
  if (audioClassifier) return audioClassifier;
  if (isAudioClassifierLoading) return null;
  try {
    isAudioClassifierLoading = true;
    console.log('[Copilot SER] Pre-loading local Speech Emotion Recognition model (onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX)...');
    const { pipeline } = await import('@xenova/transformers');
    audioClassifier = await pipeline('audio-classification', 'onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX', {
      quantized: true,
      cache_dir: path.join(__dirname, '.cache')
    });
    console.log('✓ [Copilot SER] Speech Emotion Recognition model loaded successfully!');
    return audioClassifier;
  } catch (err) {
    console.warn('[Copilot SER] Speech emotion model note:', err.message);
    return null;
  } finally {
    isAudioClassifierLoading = false;
  }
}
// Start background pre-load of SER model without blocking startup
getAudioClassifier().catch(() => {});

function mapEmotionLabel(rawLabel) {
  const upper = (rawLabel || '').toUpperCase();
  switch (upper) {
    case 'NEUTRAL': return 'Calm & Receptive';
    case 'HAPPY': return 'Engaged & Enthusiastic';
    case 'ANGRY': return 'Agitated & Challenging';
    case 'SAD': return 'Hesitant & Guarded';
    case 'FEAR': return 'Anxious / Risk-Averse';
    case 'DISGUST': return 'Skeptical & Critical';
    default: return upper ? upper.charAt(0) + upper.slice(1).toLowerCase() : 'Calm';
  }
}

// --- Tavily Search API Client for Real-Time Competitor Intelligence ---
async function fetchTavilySearch(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || apiKey === 'placeholder' || apiKey.length < 10) {
    return null;
  }
  try {
    console.log(`[Tavily] In-call competitor web search: "${query}"...`);
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: 'basic',
        max_results: 2
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data && Array.isArray(data.results) ? data.results : null;
  } catch (err) {
    console.warn('[Tavily] Search failed:', err.message);
    return null;
  }
}

// Helper for timed promises
const withTimeout = (promise, ms) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
  ]);
};

// Helper to clean URLs to company names
function extractCompanyName(urlStr) {
  if (!urlStr) return 'Target Enterprise';
  try {
    const cleanUrl = urlStr.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    const domain = cleanUrl.split('/')[0].split('.')[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return 'Target Enterprise';
  }
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    groqConfigured: !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().startsWith('gsk_')),
    activeDeals: dealStore.size,
    activeSessions: sessionStore.size,
  });
});

async function fetchCompanySnippet(urlStr) {
  if (!urlStr) return '';
  try {
    const formattedUrl = urlStr.startsWith('http') ? urlStr : `https://${urlStr}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(formattedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const html = await res.text();
    
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) || 
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
                          html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    
    const title = titleMatch ? titleMatch[1].trim() : '';
    const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : '';
    
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);

    return `Website Title: ${title}\nMeta Summary: ${metaDesc}\nPage Text: ${cleanText}`;
  } catch (err) {
    return '';
  }
}

// 1. DEAL GENERATOR & RESEARCH ENDPOINTS: POST /api/deal/generate & POST /api/deal/research
const handleDealResearch = async (req, res) => {
  try {
    const { 
      target_url, 
      seller_url, 
      product_name, 
      product_description, 
      target_persona_name, 
      target_persona_title, 
      playbook_name, 
      playbook_text,
      geminiApiKey: customGeminiKey,
      customApiKey: customGroqKey
    } = req.body;

    const targetCompany = extractCompanyName(target_url);
    const sellerCompany = extractCompanyName(seller_url || 'https://closeiq.in');
    const dealId = `deal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    const geminiApiKey = customGeminiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
    const groqApiKey = customGroqKey?.trim() || process.env.GROQ_API_KEY?.trim();

    const productName = product_name?.trim() || 'AI Sales Copilot & Roleplay Simulator';
    const productDesc = product_description?.trim() || 'Real-time call assistance, objection handling cues, and hyper-realistic roleplay training.';
    const personaTitle = target_persona_title?.trim() || 'VP of Sales';
    const personaName = target_persona_name?.trim() || 'Sarah Chen';

    const [targetScrapedData, sellerScrapedData] = await Promise.all([
      fetchCompanySnippet(target_url),
      fetchCompanySnippet(seller_url || 'https://closeiq.in'),
    ]);

    let dealContext = null;

    // Helper for timed promises
    const withTimeout = (promise, ms) => {
      return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
      ]);
    };

    // Define researchPrompt
    const researchPrompt = `
You are an elite enterprise sales strategist and buyer persona researcher.
Perform authentic, highly-accurate intelligence gathering and sales strategy synthesis for an upcoming high-stakes sales call.

TARGET COMPANY:
- Website: ${target_url} (${targetCompany})
- Target Buyer Role: ${personaTitle} (${personaName})
- LIVE SCRAPED WEBSITE FOOTPRINT:
"""
${targetScrapedData || 'Target company domain: ' + targetCompany + ' (' + target_url + ')'}
"""

SELLER COMPANY:
- Website: ${seller_url || 'https://closeiq.in'} (${sellerCompany})
- Product Being Sold: ${productName}
- Product Capabilities & Pitch: ${productDesc}
- Playbook / Sales Collateral: ${playbook_text?.slice(0, 1500) || 'Focus on discovery, ROI quantification, and competitor objection handling.'}
- LIVE SCRAPED SELLER FOOTPRINT:
"""
${sellerScrapedData || 'Seller company platform: ' + sellerCompany}
"""

RESEARCH OBJECTIVES:
1. Target Company Reality Check: What does ${targetCompany} ACTUALLY do based on their website footprint? (e.g. if they are an AI interview / recruitment platform like InCruiter, explain their exact service). Describe their real industry, product offerings, target buyers, tech stack, and strategic priorities.
2. Seller Solution Mapping: How does ${sellerCompany}'s product (${productName}) specifically help ${targetCompany}'s team solve their acute bottlenecks?
3. Pain Points: Identify 4-6 specific, acute pain points ${targetCompany} faces in their daily operations, revenue generation, or team execution.
4. Value Propositions & How to Sell:
   - "How to Target": Strategic hook and angle of attack tailored to ${targetCompany}'s actual business.
   - "How to Sell": Value proposition points with quantifiable impact metrics.
   - Seller Action Playbook: "What to Mention" (3 items), "What to Do" (3 items), "What to Avoid" (3 items), and "Key Differentiators" (3 items).
5. Discovery Questions: 4-5 high-leverage questions to uncover pain, urgency, and budget.
6. Likely Objections & Battlecard: 3-4 realistic buyer objections (pricing, competition, timing, complexity) with winning counter-tactics.
7. Buyer Persona Profile:
   - Psychological Matrix: openness (0-100), conscientiousness (0-100), extraversion (0-100), agreeableness (0-100), neuroticism (0-100).
   - Behavioral Matrix: directness (0-100), priceSensitivity (0-100), riskAversion (0-100), decisionSpeed (0-100), technicalDepth (0-100), patienceDecayRate (1-10).
   - Skepticism rationale: why they are skeptical and what proof they demand to say yes.
   - Realistic phone call system prompt.

Return ONLY valid JSON with exact structure:
{
  "target_company": "${targetCompany}",
  "target_company_url": "${target_url}",
  "target_company_description": "...",
  "seller_company": "${sellerCompany}",
  "seller_company_url": "${seller_url || 'https://closeiq.in'}",
  "seller_product_name": "${productName}",
  "seller_product_description": "${productDesc}",
  "seller_product_summary": "...",
  "company_summary": "...",
  "company_research": {
    "industry": "...",
    "companySize": "...",
    "techStack": ["...", "..."],
    "initiatives": ["...", "..."]
  },
  "seller_research": {
    "overview": "...",
    "key_capabilities": ["...", "..."],
    "unique_advantages": ["...", "..."]
  },
  "pain_points": ["...", "...", "...", "..."],
  "buyer_priorities": ["...", "...", "..."],
  "value_proposition": "...",
  "seller_value_propositions": [
    {
      "title": "...",
      "hook": "...",
      "what_to_mention": "...",
      "impact_metric": "..."
    }
  ],
  "seller_action_playbook": {
    "what_to_mention": ["...", "...", "..."],
    "what_to_do": ["...", "...", "..."],
    "what_to_avoid": ["...", "...", "..."],
    "key_differentiators": ["...", "...", "..."]
  },
  "discovery_questions": ["...", "...", "..."],
  "likely_objections": [
    {
      "title": "...",
      "category": "competition",
      "description": "...",
      "suggestedHandling": "..."
    }
  ],
  "talking_points": ["...", "...", "..."],
  "call_objective": "...",
  "target_persona": {
    "name": "${personaName}",
    "title": "${personaTitle}",
    "company": "${targetCompany}",
    "avatarUrl": "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&auto=format&fit=crop&q=80",
    "voiceGender": "female",
    "skepticism_reason": "...",
    "winning_criteria": "...",
    "personality": {
      "openness": 60,
      "conscientiousness": 85,
      "extraversion": 60,
      "agreeableness": 45,
      "neuroticism": 55
    },
    "behavior": {
      "directness": 85,
      "priceSensitivity": 75,
      "riskAversion": 85,
      "decisionSpeed": 50,
      "technicalDepth": 75,
      "patienceDecayRate": 6
    }
  }
}
`.trim();

    // Priority 1: High-Speed Groq API Engine (openai/gpt-oss-120b) with 15s timeout
    if (groqApiKey && (groqApiKey.startsWith('gsk_') || groqApiKey.length > 20)) {
      try {
        const groqCall = fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: researchPrompt }],
            temperature: 0.2,
            response_format: { type: 'json_object' },
          }),
        });

        const response = await withTimeout(groqCall, 15000);
        if (response.ok) {
          const resData = await response.json();
          const jsonText = resData.choices?.[0]?.message?.content || '';
          dealContext = JSON.parse(jsonText);
        }
      } catch (err) {
        console.warn('Groq Deal Research error, trying Gemini fallback:', err);
      }
    }

    // Priority 2: Gemini API Fallback (gemini-2.5-flash) with 15s timeout
    if (!dealContext && geminiApiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const geminiCall = ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: researchPrompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            maxOutputTokens: 2500,
          },
        });

        const response = await withTimeout(geminiCall, 15000);
        const jsonText = response.text || '';
        dealContext = JSON.parse(jsonText);
      } catch (err) {
        console.warn('Gemini Deal Research timed out or failed:', err);
      }
    }

    // Priority 3: Fallback Deal Context Synthesizer
    if (!dealContext) {
      dealContext = {
        target_company: targetCompany,
        seller_company: sellerCompany,
        seller_product_name: productName,
        seller_product_description: productDesc,
        seller_product_summary: `${productName} empowers sales teams with real-time call guidance and hyper-realistic roleplay training.`,
        company_summary: `${targetCompany} is an enterprise organization focused on scaling operational efficiency, reducing rep ramp times, and driving predictable revenue.`,
        company_research: {
          industry: 'Enterprise Software & Technology',
          companySize: '500 - 2,500 employees',
          techStack: ['AWS Cloud', 'Salesforce CRM', 'Slack', 'Modern SaaS Stack'],
          initiatives: ['Sales Velocity Optimization', 'Manager Coaching Efficiency', 'Predictable Quota Attainment'],
        },
        seller_research: {
          overview: `${sellerCompany} develops ${productName} to supercharge enterprise revenue teams.`,
          key_capabilities: ['Sub-800ms live call assistance', 'Voice-first AI roleplay simulator', 'Real-time objection detection'],
          unique_advantages: ['Live in-call assistance vs passive post-call recording', 'Custom persona calibration'],
        },
        pain_points: [
          `Slow sales rep ramp time at ${targetCompany}, taking 3+ months to reach quota`,
          `Manager bandwidth constraints preventing consistent 1-on-1 call coaching`,
          `Reps pitching features too early before quantifying target company pain`,
          `Loss of winnable deals during unscripted competitor and pricing objections`,
        ],
        buyer_priorities: [
          'Measurable rep ramp reduction within 60 days',
          'Zero downtime integration with current sales workflows',
          'Enterprise SOC2 compliance and data security',
        ],
        value_proposition: `Empower ${targetCompany}'s revenue team to practice realistic buyer calls and receive live real-time guidance to accelerate win rates.`,
        seller_value_propositions: [
          {
            title: 'Accelerate Rep Ramp by 45%',
            hook: 'Enable new hires to practice realistic objection scenarios before calling live prospects.',
            what_to_mention: 'Automated practice simulations tailored to your exact ICP and battlecards.',
            impact_metric: 'Cut ramp time from 90 days to 45 days'
          },
          {
            title: 'Live Real-Time Call Co-Piloting',
            hook: 'Provide reps with the right objection answer and discovery question at the exact second they need it.',
            what_to_mention: 'Unobtrusive, sub-800ms cues triggered by buyer hesitations.',
            impact_metric: '28% higher call-to-pilot conversion'
          },
          {
            title: 'Automate Manager Coaching',
            hook: 'Free up manager hours by replacing manual call reviews with automated, objective scorecards.',
            what_to_mention: 'Identify rep weak spots and missed objections instantly.',
            impact_metric: 'Save 10+ manager coaching hours/week'
          }
        ],
        seller_action_playbook: {
          what_to_mention: ['Live in-call guidance', 'Pre-call practice roleplays', 'Zero disruption to Salesforce/Slack'],
          what_to_do: ['Ask about current onboarding timeline', 'Acknowledge existing tools before showing live difference', 'Tie solution to quota attainment'],
          what_to_avoid: ['Do not claim existing recording tools are useless', 'Do not pitch pricing before establishing onboarding pain'],
          key_differentiators: ['Real-time active guidance vs retrospective recording', 'Interactive voice simulation']
        },
        discovery_questions: [
          `How long does it currently take a new sales rep at ${targetCompany} to become fully productive?`,
          `How much time do your managers spend listening to call recordings versus active coaching?`,
          `Where do your reps struggle most during difficult competitor and pricing objections?`,
          `What would be the revenue impact if your team improved deal conversion by just 15% this quarter?`
        ],
        likely_objections: [
          {
            title: 'We already use Gong or existing call recording tools.',
            category: 'competition',
            description: 'Prospect believes post-call analytics are sufficient.',
            suggestedHandling: `Acknowledge Gong's strength for post-call recording, then explain how ${productName} assists reps live while the call is actually happening.`
          },
          {
            title: 'Our managers already coach reps directly.',
            category: 'authority',
            description: 'Relies solely on manual manager coaching.',
            suggestedHandling: 'Highlight manager bandwidth constraints and how automated roleplay frees managers to focus only on late-stage deal closing.'
          },
          {
            title: 'Concern that live AI cues will distract reps during calls.',
            category: 'complexity',
            description: 'Concerned about cognitive overload.',
            suggestedHandling: 'Explain the lightweight, micro-cue design that only surfaces relevant battlecards when an objection is detected.'
          },
          {
            title: 'Budget constraints for additional sales software.',
            category: 'pricing',
            description: 'Protective of department budget.',
            suggestedHandling: 'Show how reducing rep ramp time by 3 weeks pays for the platform tenfold within the first quarter.'
          }
        ],
        talking_points: [
          'Pre-call practice on hyper-realistic buyer personas',
          'Sub-800ms live co-pilot guidance during live phone calls',
          'Instant objective post-call scorecard and weakness detection'
        ],
        call_objective: 'Secure agreement for a 14-day live pilot evaluation with 5 sales reps.',
        target_persona: {
          name: personaName,
          title: personaTitle,
          company: targetCompany,
          avatarUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&auto=format&fit=crop&q=80',
          voiceGender: 'female',
          skepticism_reason: `Skeptical of sales tools that promise AI magic without tangible quota improvements.`,
          winning_criteria: `Proof that reps ramp faster and handle tough competitor objections with confidence.`
        }
      };
    }

    // Attach metadata
    dealContext.deal_id = dealId;
    dealContext.target_company_url = target_url;
    dealContext.seller_company_url = seller_url || 'https://closeiq.in';
    dealContext.seller_product_name = productName;
    dealContext.seller_product_description = productDesc;
    dealContext.sales_playbook = {
      filename: playbook_name || 'Uploaded_Playbook.pdf',
      summary: playbook_text ? playbook_text.slice(0, 300) : 'Playbook loaded: Focus on discovery, pain quantification, and competitor reframing.',
      contentSnippet: playbook_text?.slice(0, 1000) || '',
    };
    dealContext.created_at = Date.now();

    // Normalize seller_value_propositions to ensure complete objects
    if (!Array.isArray(dealContext.seller_value_propositions) || dealContext.seller_value_propositions.length === 0) {
      dealContext.seller_value_propositions = [
        {
          title: `Accelerate Operational Efficiency for ${targetCompany}`,
          hook: `Empower ${targetCompany}'s team to streamline bottlenecks with high precision and faster turnaround.`,
          what_to_mention: `Dedicated workflows tailored specifically to ${targetCompany}'s operational goals.`,
          impact_metric: '40% efficiency boost'
        },
        {
          title: 'Measurable Time-to-Value & ROI',
          hook: `Reduce ramp-up friction and deliver quantifiable productivity metrics in under 30 days.`,
          what_to_mention: `Automated benchmarks and performance tracking dashboards.`,
          impact_metric: '3X faster adoption'
        }
      ];
    } else {
      dealContext.seller_value_propositions = dealContext.seller_value_propositions.map((vp, idx) => {
        if (typeof vp === 'string') {
          return {
            title: `Strategic Value Driver #${idx + 1}`,
            hook: vp,
            what_to_mention: vp,
            impact_metric: 'High Impact'
          };
        }
        return {
          title: vp.title || vp.name || vp.headline || `Strategic Value Driver #${idx + 1}`,
          hook: vp.hook || vp.pitch || vp.description || vp.value || 'Deliver measurable operational impact and team efficiency.',
          what_to_mention: vp.what_to_mention || vp.mention || vp.tactics || vp.description || vp.hook || 'Highlight workflow integration and immediate efficiency gains.',
          impact_metric: vp.impact_metric || vp.metric || vp.roi || vp.impact || 'Proven ROI'
        };
      });
    }

    // Normalize likely_objections
    if (!Array.isArray(dealContext.likely_objections) || dealContext.likely_objections.length === 0) {
      dealContext.likely_objections = [
        {
          title: `We already have existing processes in place at ${targetCompany}.`,
          category: 'competition',
          description: 'Prospect relies on legacy workflows and tools.',
          suggestedHandling: 'Acknowledge current setup and highlight the unique real-time differentiation.'
        }
      ];
    } else {
      dealContext.likely_objections = dealContext.likely_objections.map((obj) => {
        if (typeof obj === 'string') {
          return {
            title: obj,
            category: 'competition',
            description: obj,
            suggestedHandling: 'Acknowledge their concern and provide verifiable data points.'
          };
        }
        return {
          title: obj.title || obj.objection || obj.name || 'Concern regarding tool adoption and workflow integration.',
          category: obj.category || 'process',
          description: obj.description || obj.reason || obj.title || 'Prospect is cautious about adopting new technology.',
          suggestedHandling: obj.suggestedHandling || obj.response || obj.counter || obj.rebuttal || 'Demonstrate frictionless setup and measurable ROI.'
        };
      });
    }

    // Construct full Persona object for roleplay engine
    const targetObj = dealContext.likely_objections?.[0] || {
      title: 'We already use an existing solution and our current process works fine.',
      suggestedHandling: 'Acknowledge their current setup and demonstrate how our live assistance eliminates lost deals.',
      category: 'competition'
    };

    const builtPersona = {
      id: `persona-${dealId}`,
      deal_id: dealId,
      name: dealContext.target_persona?.name || personaName,
      title: dealContext.target_persona?.title || personaTitle,
      company: targetCompany,
      avatarUrl: dealContext.target_persona?.avatarUrl || 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&auto=format&fit=crop&q=80',
      voiceGender: dealContext.target_persona?.voiceGender || 'female',
      personality: dealContext.target_persona?.personality || { openness: 60, conscientiousness: 85, extraversion: 60, agreeableness: 45, neuroticism: 55 },
      behavior: dealContext.target_persona?.behavior || { directness: 85, priceSensitivity: 75, riskAversion: 85, decisionSpeed: 50, technicalDepth: 75, patienceDecayRate: 6 },
      communication: { speechRateMultiplier: 1.05, pauseFrequency: 'medium', hesitationFrequency: 'medium', vocabularyLevel: 'business', sentenceLengthTarget: 'short', interruptionSensitivity: 80 },
      knowledge: {
        industry: dealContext.company_research?.industry || 'Enterprise Technology',
        companySize: dealContext.company_research?.companySize || '500+ employees',
        techStack: dealContext.company_research?.techStack || ['AWS', 'Salesforce CRM'],
        currentPainPoints: dealContext.pain_points || [],
        competitorsEvaluated: ['Gong', 'Legacy Coaching'],
        budgetRange: '$50k - $150k / year',
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
            id: `obj-deal-${dealId}`,
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
        id: `obj-pool-${dealId}-${idx}`,
        category: obj.category || 'pricing',
        title: obj.title,
        description: obj.description,
        triggerThreshold: { maxTrust: 50 },
        hidden: true,
        isResolved: false,
        resolutionCriteria: obj.suggestedHandling || 'Demonstrate ROI',
      })) || [],
      systemContext: `You are ${dealContext.target_persona?.name || personaName}, ${dealContext.target_persona?.title || personaTitle} at ${targetCompany}. You are on a sales discovery phone call with ${sellerCompany} discussing ${productName}. Your core pain point is: ${dealContext.pain_points?.[0] || 'slow rep ramp'}. Your main objection is: ${targetObj?.title || 'We already use existing tools'}. Speak like a real busy executive on a phone call. Keep replies strictly under 2 short sentences.`,
    };

    dealContext.built_persona = builtPersona;
    dealStore.set(dealId, dealContext);

    // Auto-index deal dossier into Copilot local vector store in background
    ingestDealDossier(dealContext).catch(e => console.warn('[Copilot RAG] Auto-index warning:', e.message));

    return res.json({ deal_id: dealId, dealContext, persona: builtPersona });
  } catch (err) {
    console.error('Server Deal Generator error:', err);
    return res.status(500).json({ error: 'Failed to generate deal context' });
  }
};

app.post('/api/deal/generate', handleDealResearch);
app.post('/api/deal/research', handleDealResearch);

// 2. GET DEAL CONTEXT: GET /api/deal/:deal_id
app.get('/api/deal/:deal_id', (req, res) => {
  const dealId = req.params.deal_id;
  const deal = dealStore.get(dealId);

  if (!deal) {
    return res.status(404).json({ error: 'Deal Context not found' });
  }

  res.json(deal);
});

// 3. SAVE ROLEPLAY SESSION: POST /api/deal/:deal_id/session
app.post('/api/deal/:deal_id/session', (req, res) => {
  const dealId = req.params.deal_id;
  const deal = dealStore.get(dealId);

  if (!deal) {
    return res.status(404).json({ error: 'Deal Context not found' });
  }

  const {
    session_id,
    transcript,
    score,
    grade,
    strengths,
    weaknesses,
    missed_opportunities,
    missed_objections,
    coaching_feedback,
    buyer_reactions,
    scorecard,
  } = req.body;

  const sessionId = session_id || `session_${Date.now().toString(36)}`;

  const roleplaySession = {
    session_id: sessionId,
    deal_id: dealId,
    transcript: transcript || [],
    score: score || 75,
    grade: grade || 'B',
    strengths: strengths || ['Good discovery question cadence'],
    weaknesses: weaknesses || ['Pitched solution too early before quantifying pain', 'Did not directly address competitor objection'],
    missed_opportunities: missed_opportunities || ['Failed to ask about decision timeline'],
    missed_objections: missed_objections || ['We already use Gong'],
    coaching_feedback: coaching_feedback || ['Focus on asking 2 pain questions before introducing product features.'],
    buyer_reactions: buyer_reactions || ['Prospect expressed skepticism regarding deployment timeline.'],
    call_progress: 100,
    scorecard,
    created_at: Date.now(),
  };

  sessionStore.set(sessionId, roleplaySession);

  res.json({
    session_id: sessionId,
    roleplaySession,
  });
});

// 4. GET ROLEPLAY SESSION: GET /api/deal/:deal_id/session/:session_id
app.get('/api/deal/:deal_id/session/:session_id', (req, res) => {
  const sessionId = req.params.session_id;
  const session = sessionStore.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Roleplay Session not found' });
  }

  res.json(session);
});

// 5. COPILOT DEAL MEMORY SYNC ENDPOINT: POST /api/copilot/sync-deal
app.post('/api/copilot/sync-deal', async (req, res) => {
  try {
    const { deal_id, deal_context } = req.body;
    let deal = deal_context;
    if (!deal && deal_id) {
      deal = dealStore.get(deal_id);
    }
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found in memory store' });
    }

    // Ensure deal is persisted in dealStore
    if (deal.deal_id) {
      dealStore.set(deal.deal_id, deal);
    }

    // Embed and index all chunks into Copilot RAG
    const ragResult = await ingestDealDossier(deal);

    return res.json({
      success: true,
      deal_id: deal.deal_id,
      target_company: deal.target_company,
      chunks_indexed: ragResult.chunksCount,
      objections_armed: (deal.likely_objections || []).length,
      value_props_loaded: (deal.seller_value_propositions || []).length,
      persona_name: deal.target_persona?.name || 'Target Buyer',
      persona_title: deal.target_persona?.title || 'Decision Maker',
      status: 'ready'
    });
  } catch (err) {
    console.error('Error during Copilot deal sync:', err);
    res.status(500).json({ error: 'Failed to sync deal to Copilot memory' });
  }
});

// 6. LIVE COPILOT CUE ENDPOINT (Full 4-Tier Pipeline): POST /api/copilot/cue
app.post('/api/copilot/cue', async (req, res) => {
  try {
    const { deal_id, session_id, user_speech, customer_speech, deal_context } = req.body;

    const deal = dealStore.get(deal_id) || deal_context;
    const session = sessionStore.get(session_id);

    const focusText = (customer_speech || user_speech || '').trim();
    const lowerSpeech = focusText.toLowerCase();

    if (!focusText) {
      return res.json({ cues: [] });
    }

    const cues = [];
    let detectedTone = 'Calm & Receptive';

    // Tier 1: Small-Talk Suppression Filter
    const isSmallTalk = /^(hi|hello|hey|good morning|good afternoon|how are you|how's it going|doing well|thanks for having me|can you hear me|yes|yeah|sure|okay|sounds good)[!.,?]?$/i.test(lowerSpeech.trim()) ||
      (lowerSpeech.split(' ').length <= 4 && (lowerSpeech.includes('how are you') || lowerSpeech.includes('doing well') || lowerSpeech.includes('nice to meet') || lowerSpeech.includes('thanks for reaching')));

    if (isSmallTalk) {
      const openingQuestion = deal?.discovery_questions?.[0] || '"How long does it currently take a new sales rep on your team to ramp to quota?"';
      cues.push({
        id: `cue-smalltalk-${Date.now()}`,
        timestamp: Date.now(),
        type: 'discovery_question',
        title: '🎯 OPENING DISCOVERY PIVOT',
        description: `Prospect is warming up. Acknowledge briefly and pivot directly to uncovering their acute pain at ${deal?.target_company || 'the company'}.`,
        suggestedAction: 'Ask opening discovery question before introducing any product features.',
        suggestedQuestion: openingQuestion,
        winningRebuttal: `Great to connect! Before we jump in, curious: ${openingQuestion.replace(/^"|"$/g, '')}`
      });
      return res.json({ cues, tone: detectedTone });
    }

    // Tier 0: Reflex Objection Scanner (0ms Exact Rebuttal)
    let matchedObjection = null;
    if (deal && Array.isArray(deal.likely_objections)) {
      for (const obj of deal.likely_objections) {
        const objKeywords = (obj.title + ' ' + (obj.category || '')).toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const hasKeywordMatch = objKeywords.some(kw => lowerSpeech.includes(kw));
        
        const isCompetitorMatch = (lowerSpeech.includes('gong') || lowerSpeech.includes('competitor') || lowerSpeech.includes('already use')) && 
          (obj.category === 'competition' || obj.title.toLowerCase().includes('existing') || obj.title.toLowerCase().includes('tool'));

        const isPricingMatch = (lowerSpeech.includes('cost') || lowerSpeech.includes('expensive') || lowerSpeech.includes('budget') || lowerSpeech.includes('price')) &&
          (obj.category === 'pricing' || obj.title.toLowerCase().includes('budget') || obj.title.toLowerCase().includes('price'));

        const isDisruptionMatch = (lowerSpeech.includes('distract') || lowerSpeech.includes('hard to use') || lowerSpeech.includes('adoption')) &&
          (obj.category === 'complexity');

        if (hasKeywordMatch || isCompetitorMatch || isPricingMatch || isDisruptionMatch) {
          matchedObjection = obj;
          break;
        }
      }
    }

    if (matchedObjection) {
      detectedTone = 'Skeptical & Critical';
      cues.push({
        id: `cue-reflex-${Date.now()}`,
        timestamp: Date.now(),
        type: 'objection',
        title: `⚠️ OBJECTION: ${matchedObjection.title.slice(0, 45)}...`,
        description: matchedObjection.description || `Prospect is raising a ${matchedObjection.category || 'core'} objection.`,
        winningRebuttal: matchedObjection.suggestedHandling || 'Acknowledge their setup and emphasize quantifiable ramp reduction ROI.',
        suggestedAction: 'Deliver the winning rebuttal below immediately, then follow up with a validation question.',
        suggestedQuestion: `"Does that make sense, or would you like to see how that works in practice?"`,
        isReflex: true
      });
    }

    // Tier 2: MiniLM Client RAG Semantic Search
    let ragChunks = [];
    try {
      ragChunks = await queryClientRAG(focusText, deal_id, 2);
    } catch (ragErr) {
      console.warn('[Copilot RAG] Query failed:', ragErr.message);
    }

    // Tavily External Competitor Search if relevant
    let tavilyContext = '';
    if (lowerSpeech.includes('gong') || lowerSpeech.includes('competitor') || lowerSpeech.includes('alternative')) {
      const tavilyHits = await fetchTavilySearch(`${focusText} sales software vs real-time copilot`);
      if (tavilyHits && tavilyHits.length > 0) {
        tavilyContext = `EXTERNAL MARKET INTEL: ${tavilyHits.map(h => h.content).slice(0, 2).join(' ')}`;
      }
    }

    // Tier 3: Low-Latency Groq LLM Inference (with Gemini Fallback)
    const groqApiKey = process.env.GROQ_API_KEY?.trim();
    const geminiApiKey = process.env.GEMINI_API_KEY?.trim();

    const targetCompany = deal?.target_company || 'Target Enterprise';
    const personaName = deal?.target_persona?.name || 'Sarah Chen';
    const personaTitle = deal?.target_persona?.title || 'VP of Sales';
    const winningCriteria = deal?.target_persona?.winning_criteria || 'Quantifiable ROI and minimal workflow disruption';
    const mainPainPoint = deal?.pain_points?.[0] || 'Accelerating sales rep ramp time';

    // Direct In-Context Dossier Formatting (Guarantees 100% recall of facts & metrics without retrieval loss)
    const ap = deal?.seller_action_playbook;
    const structuredDossier = deal ? `
TARGET REALITY: ${deal.target_company_description || deal.company_summary || ''}
TECH STACK: ${deal.company_research?.techStack?.join(', ') || 'Enterprise standard'}
KEY INITIATIVES: ${deal.company_research?.initiatives?.join('; ') || 'Scale revenue'}

ACUTE PAIN POINTS:
${(deal.pain_points || []).map((pt, i) => `${i+1}. ${pt}`).join('\n')}

VALUE PROPOSITIONS & IMPACT METRICS:
${(deal.seller_value_propositions || []).map(vp => `• [${vp.title}]: Hook: "${vp.hook}" | Metric: ${vp.impact_metric}`).join('\n')}

KNOWN OBJECTIONS & REBUTTALS:
${(deal.likely_objections || []).map(o => `• [${(o.category || 'general').toUpperCase()}] "${o.title}" -> REBUTTAL: "${o.suggestedHandling}"`).join('\n')}

PLAYBOOK RULES:
• What Rep Should Mention: ${(ap?.what_to_mention || []).join('; ')}
• What Rep Should Do: ${(ap?.what_to_do || []).join('; ')}
• CRITICAL TO AVOID: ${(ap?.what_to_avoid || []).join('; ')}
• Key Differentiators: ${(ap?.key_differentiators || []).join('; ')}
`.trim() : (ragChunks.map(c => c.parent_text).join('\n') || `Primary Pain Point: ${mainPainPoint}.`);

    const copilotSystemPrompt = `You are an elite live AI Sales Copilot listening to an active call with ${targetCompany}.
TARGET BUYER: ${personaName}, ${personaTitle}.
BUYER SKEPTICISM & WINNING CRITERIA: ${winningCriteria}.
PRIMARY CLIENT BOTTLENECK: ${mainPainPoint}.

GROUNDED CLIENT DOSSIER & STRATEGY:
${structuredDossier}
${tavilyContext}

THE CALL TRANSCRIPT JUST HEARD:
${customer_speech ? `PROSPECT: "${customer_speech}"` : ''}
${user_speech ? `SALES REP: "${user_speech}"` : ''}

TASK:
Provide the sales rep with ONE instant, high-conversion tactical battlecard cue.
STRICT OUTPUT FORMAT: Output ONLY valid JSON matching this schema:
{
  "type": "objection" | "value_prop" | "discovery_question" | "coaching_alert",
  "title": "Short Punchy Title with Emoji (e.g. 🎯 REFRAME GONG COMPARISON)",
  "description": "1 concise sentence explaining the tactical angle",
  "winningRebuttal": "Exact quote for the rep to speak out loud, under 25 words",
  "suggestedAction": "Tactical action for the rep (under 15 words)",
  "suggestedQuestion": "High-leverage follow up question"
}`.trim();

    let llmCue = null;

    if (groqApiKey && (groqApiKey.startsWith('gsk_') || groqApiKey.length > 20)) {
      try {
        const groqCall = fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: copilotSystemPrompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
            max_tokens: 800
          }),
        });

        const response = await withTimeout(groqCall, 4000);
        if (response.ok) {
          const resData = await response.json();
          const jsonText = resData.choices?.[0]?.message?.content || '';
          llmCue = JSON.parse(jsonText);
        }
      } catch (err) {
        console.warn('[Copilot Groq] Inference timed out or failed, falling back to Gemini:', err.message);
      }
    }

    if (!llmCue && geminiApiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const geminiCall = ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: copilotSystemPrompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 500,
          },
        });

        const response = await withTimeout(geminiCall, 4000);
        const jsonText = response.text || '';
        llmCue = JSON.parse(jsonText);
      } catch (err) {
        console.warn('[Copilot Gemini] Fallback failed:', err.message);
      }
    }

    if (llmCue && llmCue.title && llmCue.winningRebuttal) {
      cues.push({
        id: `cue-llm-${Date.now()}`,
        timestamp: Date.now(),
        type: llmCue.type || 'value_prop',
        title: llmCue.title,
        description: llmCue.description,
        winningRebuttal: llmCue.winningRebuttal,
        suggestedAction: llmCue.suggestedAction || 'Deliver winning talking track.',
        suggestedQuestion: llmCue.suggestedQuestion,
        relatedPracticeWeakness: session?.weaknesses?.[0]
      });
    }

    // Fallback if both reflex and LLM returned nothing
    if (cues.length === 0) {
      cues.push({
        id: `cue-fallback-${Date.now()}`,
        timestamp: Date.now(),
        type: 'discovery_question',
        title: '💡 RECOMMENDED DISCOVERY QUESTION',
        description: `Uncover the operational bottleneck at ${targetCompany}.`,
        suggestedAction: 'Ask about manager bandwidth constraints.',
        suggestedQuestion: deal?.discovery_questions?.[0] || '"How long does it currently take a new rep to become productive?"',
        winningRebuttal: `That makes complete sense. How does that currently impact your team's quarterly target?`
      });
    }

    res.json({ cues, tone: detectedTone });
  } catch (err) {
    console.error('Error generating Copilot cue:', err);
    res.status(500).json({ error: 'Failed to generate copilot cue' });
  }
});

// Dual Groq & Gemini API Persona Chat Backend Endpoint
app.post('/api/persona/chat', async (req, res) => {
  try {
    const { persona, state, memoryContext, history, userText, customApiKey, geminiApiKey: customGeminiKey } = req.body;

    const groqApiKey = customApiKey?.trim() || process.env.GROQ_API_KEY?.trim();
    const geminiApiKey = customGeminiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
    const k = persona?.knowledge || {};
    const systemPrompt = `
You are strictly roleplaying as ${persona?.name || 'Sarah Chen'}, ${persona?.title || 'VP of Sales'} at ${persona?.company || 'InCruiter'}.
This is a live SCHEDULED discovery phone / Zoom call with a sales representative from CloseIQ.

CRITICAL DIRECTIVE: ULTRA-SHORT, PUNCHY PHONE CONVERSATION
1. STRICT SPOKEN BREVITY (UNDER 20-25 WORDS MAX):
   - Real humans on phone calls speak in rapid, concise conversational bursts (1 to 2 short sentences max).
   - NEVER recite long marketing paragraphs, lists of features, or multi-clause descriptions.
   - Be concise and punchy: give a quick 1-sentence answer and hand the mic back to the rep.
   - Example when asked about your company: "Yeah, sure—at InCruiter we provide AI interview automation to help companies screen candidates 4x faster. What's on your agenda today?" (23 words).

2. WARM, REALISTIC CALL OPENINGS (Turns 1-2):
   - If the rep says hello or asks how you are ("hi", "how are you doing", "good morning"):
     Respond with natural, friendly warmth: "Hey! Doing well, thanks. How are you doing today?"

3. SKEPTICISM & BUYER EVALUATION (Later Turns):
   - Ask about tangible ROI, integration, and differences from Gong in quick 1-sentence questions.

4. VOICE RECOGNITION ACOUSTIC TOLERANCE:
   - The caller speaks via live microphone speech-to-text.
   - Recognize that words like "include us", "in recruiter", "include a", or "include or" mean your company (${persona?.company || 'InCruiter'}).
   - NEVER question minor phonetic slips or say "what do you mean by include us". Seamlessly interpret their true business intent.

COMPANY CONTEXT:
- Company: ${persona?.company || 'InCruiter'} (${k.companySize || 'Enterprise'}, Industry: ${k.industry || 'AI Recruitment & HR Tech'})
- What You Do: ${k.companyDescription || 'AI candidate screening, automated video assessments, and Interview-as-a-Service.'}
- Current Needs & Pain Points: ${k.currentNeeds || (k.currentPainPoints && k.currentPainPoints.length > 0 ? k.currentPainPoints.join(' | ') : 'Sales ramp times and high recruiter workload')}
- Current Mood: ${(state?.mood || 'neutral').toUpperCase()} (Trust: ${state?.trustScore || 35}/100).

${memoryContext || ''}
`.trim();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 1. Primary Engine: Groq API Key
    if (groqApiKey && (groqApiKey.startsWith('gsk_') || groqApiKey.length > 20)) {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).slice(-6).map((h) => ({
          role: h.speaker === 'user' ? 'user' : 'assistant',
          content: h.text,
        })),
        { role: 'user', content: userText },
      ];

      const groqModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];
      let streamedSuccessfully = false;

      for (const model of groqModels) {
        try {
          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${groqApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.6,
              max_tokens: 280,
              stream: true,
            }),
          });

          if (groqResponse.ok && groqResponse.body) {
            const reader = groqResponse.body.getReader();
            const decoder = new TextDecoder('utf-8');
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunkText = decoder.decode(value, { stream: true });
              res.write(chunkText);
            }
            streamedSuccessfully = true;
            break;
          }
        } catch (modelErr) {
          console.warn(`Groq model ${model} error, trying next:`, modelErr);
        }
      }

      if (streamedSuccessfully) {
        return res.end();
      }
    }

    // Option B: Stream with Gemini 2.5 Flash
    if (geminiApiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const chatContents = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        ...(history || []).slice(-6).map((h) => ({
          role: h.speaker === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }]
        })),
        { role: 'user', parts: [{ text: userText || 'hello' }] }
      ];

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: chatContents,
        config: {
          temperature: 0.6,
          maxOutputTokens: 350,
        }
      });

      for await (const chunk of responseStream) {
        const textChunk = chunk.text || '';
        if (textChunk) {
          const ssePayload = JSON.stringify({
            choices: [{ delta: { content: textChunk } }]
          });
          res.write(`data: ${ssePayload}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Option C: Natural conversational fallback
    const fallbackReply = `Hey. I'm just reviewing our candidate pipelines right now. What's on your mind?`;
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: fallbackReply } }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();

  } catch (err) {
    console.error('Backend server error handling chat:', err);
    const fallbackReply = `Look, I have a few minutes before my next meeting. What's this regarding?`;
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: fallbackReply } }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }
});

// Deepgram Aura Neural TTS Endpoint
app.post('/api/tts/speak', async (req, res) => {
  try {
    const { text, voiceGender } = req.body;
    const deepgramKey = process.env.DEEPGRAM_API_KEY?.trim();

    if (!deepgramKey) {
      return res.status(400).json({ error: 'DEEPGRAM_API_KEY not configured' });
    }

    let spokenText = (text || '')
      .replace(/\b4x\b/gi, 'four times')
      .replace(/\b3x\b/gi, 'three times')
      .replace(/\b2x\b/gi, 'two times')
      .replace(/\b10x\b/gi, 'ten times')
      .replace(/\bROI\b/g, 'R.O.I.')
      .replace(/\bAI\b/g, 'A.I.')
      .replace(/\bB2B\b/gi, 'B to B')
      .replace(/\$([0-9]+)k\b/gi, '$1 thousand dollars')
      .replace(/—/g, ', ')
      .trim();

    const model = voiceGender === 'male' ? 'aura-orion-en' : 'aura-asteria-en';

    const dgRes = await fetch(`https://api.deepgram.com/v1/speak?model=${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: spokenText }),
    });

    if (!dgRes.ok) {
      const errText = await dgRes.text();
      throw new Error(`Deepgram error (${dgRes.status}): ${errText}`);
    }

    const audioBuffer = await dgRes.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength.toString());
    return res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error('Server Deepgram TTS Error:', err?.message || err);
    return res.status(500).json({ error: 'Deepgram TTS failed' });
  }
});

// Serve static client assets in production
app.use(express.static(path.join(__dirname, 'dist')));

// Express 5 compatible SPA fallback
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
  next();
});

app.listen(PORT, () => {
  console.log(`🚀 CloseIQ Application Server listening on port ${PORT}`);
});
