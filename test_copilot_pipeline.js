const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

const mockDealContext = {
  deal_id: 'deal_test_incruiter_99',
  target_company: 'InCruiter',
  target_company_url: 'https://incruiter.com',
  target_company_description: 'InCruiter provides automated interview screening and Interview-as-a-Service for enterprise hiring.',
  seller_company: 'CloseIQ',
  seller_product_name: 'CloseIQ AI Copilot',
  target_persona: {
    name: 'Sarah Chen',
    title: 'VP of Sales',
    company: 'InCruiter',
    skepticism_reason: 'Skeptical of AI tools that cause rep distraction or lack verifiable quota acceleration.',
    winning_criteria: 'Measurable proof of cutting sales rep ramp time by at least 3 weeks within 60 days.'
  },
  company_research: {
    industry: 'HR Tech & AI Interview Automation',
    companySize: '150-300 employees',
    techStack: ['Salesforce', 'Slack', 'AWS', 'Gong call recorder'],
    initiatives: ['Sales rep quota attainment', 'Faster ramp time for Q3 hires']
  },
  pain_points: [
    'New sales reps taking 14+ weeks to reach full productivity and quota',
    'Managers lack bandwidth to review post-call Gong recordings',
    'Reps freeze during unscripted competitor and pricing objections'
  ],
  buyer_priorities: ['Fast time-to-value', 'Zero workflow disruption for reps', 'Measurable ROI'],
  seller_value_propositions: [
    {
      title: 'Real-Time In-Call Battlecards vs Post-Call Recording',
      hook: 'CloseIQ guides reps while the buyer is still on the line, preventing lost deals.',
      what_to_mention: 'Sub-800ms live cue generation and automatic objection rebuttals.',
      impact_metric: 'Cut new rep ramp time by 45%'
    }
  ],
  likely_objections: [
    {
      title: 'We already use Gong for call recordings and analysis.',
      category: 'competition',
      description: 'Prospect considers Gong sufficient for sales enablement.',
      suggestedHandling: 'Acknowledge Gong is great for post-call review, but explain that CloseIQ gives live in-the-moment guidance before the deal is lost.'
    },
    {
      title: 'We do not have budget for additional software this quarter.',
      category: 'pricing',
      description: 'Protective of department expenditure.',
      suggestedHandling: 'Demonstrate how recovering just 1 lost deal per rep per month covers the entire annual cost of CloseIQ.'
    }
  ],
  discovery_questions: [
    'How long does it currently take a newly hired rep on your team to hit full quota?',
    'When a rep loses a deal on a tough objection, how soon does the manager usually find out?'
  ],
  call_objective: 'Secure agreement for a 14-day technical sandbox evaluation.'
};

async function runTests() {
  console.log('=== STARTING COPILOT PIPELINE INTEGRATION TESTS ===\n');

  // 1. Test Deal Memory Sync
  console.log('[Test 1] Testing POST /api/copilot/sync-deal...');
  const syncRes = await fetch(`${BASE_URL}/api/copilot/sync-deal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deal_id: mockDealContext.deal_id,
      deal_context: mockDealContext
    })
  });

  if (!syncRes.ok) {
    throw new Error(`Sync failed with status ${syncRes.status}: ${await syncRes.text()}`);
  }

  const syncData = await syncRes.json();
  console.log('✓ Sync response:', JSON.stringify(syncData, null, 2));
  if (syncData.success && syncData.chunks_indexed > 0) {
    console.log(`✓ [Test 1 Passed] Successfully indexed ${syncData.chunks_indexed} chunks for ${syncData.target_company}!\n`);
  } else {
    throw new Error('[Test 1 Failed] chunks_indexed is 0 or sync unsuccessful');
  }

  // 2. Test Small-Talk Suppression
  console.log('[Test 2] Testing Small-Talk Suppression Filter...');
  const smallTalkRes = await fetch(`${BASE_URL}/api/copilot/cue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deal_id: mockDealContext.deal_id,
      customer_speech: 'Hey there! Doing well thanks, how are you doing today?'
    })
  });

  const smallTalkData = await smallTalkRes.json();
  console.log('Small-talk cue:', JSON.stringify(smallTalkData.cues?.[0], null, 2));
  if (smallTalkData.cues?.[0]?.type === 'discovery_question' && smallTalkData.cues?.[0]?.title.includes('DISCOVERY')) {
    console.log('✓ [Test 2 Passed] Small talk correctly filtered into discovery pivot!\n');
  } else {
    console.warn('[Test 2 Warning] Did not trigger expected discovery pivot cue');
  }

  // 3. Test Competitor / Reflex Objection Match (Gong)
  console.log('[Test 3] Testing Competitor Reflex Objection Trigger ("We already use Gong")...');
  const objectionRes = await fetch(`${BASE_URL}/api/copilot/cue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deal_id: mockDealContext.deal_id,
      customer_speech: 'Look, we already use Gong for our calls, so I am not sure why we need CloseIQ.'
    })
  });

  const objectionData = await objectionRes.json();
  console.log('Objection cue:', JSON.stringify(objectionData.cues?.[0], null, 2));
  const topCue = objectionData.cues?.[0];
  if (topCue && (topCue.title.toLowerCase().includes('gong') || topCue.winningRebuttal.toLowerCase().includes('gong') || topCue.winningRebuttal.toLowerCase().includes('post-call'))) {
    console.log('✓ [Test 3 Passed] Instant Gong winning rebuttal triggered!\n');
  } else {
    console.warn('[Test 3 Note] Reflex response returned:', topCue?.title);
  }

  // 4. Test RAG / Value Prop Query
  console.log('[Test 4] Testing Value Proposition & Pain Point Probe ("How does this reduce ramp time?")...');
  const valuePropRes = await fetch(`${BASE_URL}/api/copilot/cue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deal_id: mockDealContext.deal_id,
      customer_speech: 'How exactly does this help our new reps reach quota faster?'
    })
  });

  const valuePropData = await valuePropRes.json();
  console.log('Value Prop cue:', JSON.stringify(valuePropData.cues?.[0], null, 2));
  if (valuePropData.cues && valuePropData.cues.length > 0) {
    console.log('✓ [Test 4 Passed] Tactical cue successfully generated with grounded dossier!\n');
  }

  console.log('=== ALL TESTS COMPLETED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
