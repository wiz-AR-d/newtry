import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-Memory Client Vector/Text Database: deal_id -> Array of { id, text, parent_text, tokens, metadata }
const clientVectorStore = new Map();
const RAG_CACHE_PATH = path.join(__dirname, '.client_rag_cache.json');

// Restore cached deal chunks on startup if exists
if (fs.existsSync(RAG_CACHE_PATH)) {
  try {
    const raw = JSON.parse(fs.readFileSync(RAG_CACHE_PATH, 'utf-8'));
    for (const [dealId, chunks] of Object.entries(raw)) {
      clientVectorStore.set(dealId, chunks);
    }
    console.log(`[Copilot RAG] Restored ${clientVectorStore.size} deal vectors from disk cache.`);
  } catch (e) {
    console.warn('[Copilot RAG] Failed to restore cache:', e.message);
  }
}

// Tokenize text into frequency map for zero-memory, instant lexical-semantic matching
function tokenize(text) {
  if (!text) return new Map();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
  
  const tf = new Map();
  for (const word of words) {
    tf.set(word, (tf.get(word) || 0) + 1);
  }
  return tf;
}

// Fast lexical cosine similarity between token frequency maps
function tokenSimilarity(tfA, tfB) {
  if (!tfA || !tfB || tfA.size === 0 || tfB.size === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const count of tfA.values()) {
    normA += count * count;
  }
  for (const count of tfB.values()) {
    normB += count * count;
  }

  for (const [word, countA] of tfA.entries()) {
    const countB = tfB.get(word) || 0;
    dotProduct += countA * countB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function persistCache() {
  try {
    const obj = {};
    for (const [k, v] of clientVectorStore.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(RAG_CACHE_PATH, JSON.stringify(obj, null, 2));
  } catch (e) {
    // Non-critical background save failure
  }
}

/**
 * Ingests a complete DealContext into high-precision parent-child chunks
 * @param {Object} dealContext 
 * @returns {Promise<{ chunksCount: number, deal_id: string }>}
 */
export async function ingestDealDossier(dealContext) {
  if (!dealContext || !dealContext.deal_id) {
    throw new Error('dealContext with deal_id is required for RAG ingestion');
  }

  const dealId = dealContext.deal_id;
  const targetCompany = dealContext.target_company || 'Target Enterprise';
  const rawChunks = [];

  // 1. Target Company Overview & Tech Stack
  const techStack = dealContext.company_research?.techStack?.join(', ') || 'Enterprise standard tools';
  const initiatives = dealContext.company_research?.initiatives?.join('; ') || 'Digital acceleration';
  rawChunks.push({
    child_text: `${targetCompany} industry: ${dealContext.company_research?.industry || 'Technology'}, tech stack: ${techStack}. Initiatives: ${initiatives}`,
    parent_text: `TARGET REALITY FOR ${targetCompany}: ${dealContext.target_company_description || dealContext.company_summary || ''}. Current Tech Stack: ${techStack}. Key Business Initiatives: ${initiatives}.`,
    metadata: { type: 'company_reality', deal_id: dealId, targetCompany }
  });

  // 2. Acute Pain Points & Buyer Priorities
  if (dealContext.pain_points && dealContext.pain_points.length > 0) {
    const painList = dealContext.pain_points.map((p, idx) => `${idx + 1}. ${p}`).join(' | ');
    const priorities = dealContext.buyer_priorities?.join(', ') || 'Operational efficiency';
    rawChunks.push({
      child_text: `Acute pain points for ${targetCompany}: ${painList}. Priorities: ${priorities}`,
      parent_text: `PROSPECT BOTTLENECKS: ${targetCompany} is experiencing severe friction in: ${painList}. Their strategic decision criteria prioritize: ${priorities}.`,
      metadata: { type: 'pain_points', deal_id: dealId, targetCompany }
    });
  }

  // 3. Value Propositions & Impact Metrics
  if (dealContext.seller_value_propositions && dealContext.seller_value_propositions.length > 0) {
    dealContext.seller_value_propositions.forEach((vp) => {
      rawChunks.push({
        child_text: `Value hook ${vp.title}: ${vp.hook}. Impact metric: ${vp.impact_metric}`,
        parent_text: `WINNING VALUE PROPOSITION: "${vp.title}". Hook to deploy: ${vp.hook}. What to explicitly mention: ${vp.what_to_mention}. Quantifiable ROI Metric: ${vp.impact_metric}.`,
        metadata: { type: 'value_proposition', deal_id: dealId, title: vp.title }
      });
    });
  }

  // 4. Likely Objections with Winning Rebuttals
  if (dealContext.likely_objections && dealContext.likely_objections.length > 0) {
    dealContext.likely_objections.forEach((obj) => {
      rawChunks.push({
        child_text: `Objection: "${obj.title}". Category: ${obj.category}. Detail: ${obj.description}`,
        parent_text: `PREDICTED OBJECTION: "${obj.title}" (${obj.category}). Description: ${obj.description}. WINNING REBUTTAL TALKING TRACK: "${obj.suggestedHandling}".`,
        metadata: { 
          type: 'objection', 
          deal_id: dealId, 
          title: obj.title, 
          category: obj.category, 
          handling: obj.suggestedHandling 
        }
      });
    });
  }

  // 5. Seller Action Playbook
  if (dealContext.seller_action_playbook) {
    const ap = dealContext.seller_action_playbook;
    rawChunks.push({
      child_text: `Differentiators: ${ap.key_differentiators?.join('; ')}. What to avoid: ${ap.what_to_avoid?.join('; ')}`,
      parent_text: `ACTION PLAYBOOK FOR CALL: What to mention: ${ap.what_to_mention?.join(', ')}. What to do: ${ap.what_to_do?.join(', ')}. CRITICAL TO AVOID: ${ap.what_to_avoid?.join(', ')}. KEY COMPETITIVE DIFFERENTIATORS: ${ap.key_differentiators?.join('; ')}.`,
      metadata: { type: 'action_playbook', deal_id: dealId }
    });
  }

  // 6. Discovery Questions & Call Objective
  if (dealContext.discovery_questions && dealContext.discovery_questions.length > 0) {
    const dqText = dealContext.discovery_questions.join(' | ');
    rawChunks.push({
      child_text: `Discovery questions: ${dqText}. Call objective: ${dealContext.call_objective || 'Lock in next step'}`,
      parent_text: `DISCOVERY & CLOSING OBJECTIVE: Target Outcome: ${dealContext.call_objective || 'Lock in evaluation'}. Recommended High-Leverage Questions: ${dqText}`,
      metadata: { type: 'discovery_questions', deal_id: dealId }
    });
  }

  const embeddedChunks = rawChunks.map((chunk, index) => {
    return {
      id: `${dealId}_chunk_${index}`,
      text: chunk.child_text,
      parent_text: chunk.parent_text,
      tokens: Array.from(tokenize(`${chunk.child_text} ${chunk.parent_text}`).entries()),
      metadata: chunk.metadata
    };
  });

  clientVectorStore.set(dealId, embeddedChunks);
  persistCache();

  console.log(`✓ [Copilot RAG] Successfully indexed ${embeddedChunks.length} chunks for deal ${dealId}!`);
  return { chunksCount: embeddedChunks.length, deal_id: dealId };
}

/**
 * Query RAG strictly scoped to a client deal_id
 * @param {string} queryText 
 * @param {string} dealId 
 * @param {number} limit 
 * @returns {Promise<Array<{ text: string, parent_text: string, score: number, metadata: Object }>>}
 */
export async function queryClientRAG(queryText, dealId, limit = 3) {
  if (!queryText || !queryText.trim() || !dealId) return [];

  const chunks = clientVectorStore.get(dealId);
  if (!chunks || chunks.length === 0) {
    return [];
  }

  const queryTf = tokenize(queryText);
  if (queryTf.size === 0) return [];

  const scored = chunks.map(chunk => {
    const chunkTf = new Map(chunk.tokens);
    const score = tokenSimilarity(queryTf, chunkTf);
    return {
      text: chunk.text,
      parent_text: chunk.parent_text,
      score,
      metadata: chunk.metadata
    };
  });

  return scored
    .filter(item => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Get all indexed deal IDs
 */
export function getIndexedDeals() {
  return Array.from(clientVectorStore.keys());
}
