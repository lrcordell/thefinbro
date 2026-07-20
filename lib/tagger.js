import Anthropic from '@anthropic-ai/sdk';

const BADGE_BY_TAG = {
  bullish: '🔥',
  bearish: '📉',
  neutral: '⚖️',
};

const SYSTEM_PROMPT = `You are the editorial voice of The Fin Bro, a market news brief for
retail traders who don't have time for jargon. For each article you're given, respond with
ONLY a JSON object (no markdown, no prose) in this exact shape:

{
  "tag": "bullish" | "bearish" | "neutral",
  "title": "a punchy 8-14 word headline in plain English",
  "body": "1-2 sentences (max 40 words) explaining why a retail trader should care, in a confident, casual, no-BS tone. No hype for hype's sake — if the news is genuinely neutral, say so."
}

Never give trading advice (no "buy", "sell", "you should"). Just explain what happened and why it's relevant.`;

/**
 * Sends a raw article through Claude to get a sentiment tag + rewritten
 * headline/blurb in The Fin Bro's voice. Batches nothing — called once per
 * article, since each needs its own judgment call.
 */
export async function tagArticle({ apiKey, article }) {
  const client = new Anthropic({ apiKey });

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Headline: ${article.title}\nSource: ${article.source}\nSnippet: ${article.snippet}\nTickers mentioned: ${article.tickers.join(', ') || 'none'}`,
      },
    ],
  });

  const raw = msg.content.find((b) => b.type === 'text')?.text || '{}';

  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    // Fall back gracefully if the model returns non-JSON for some reason
    parsed = { tag: 'neutral', title: article.title, body: article.snippet.slice(0, 160) };
  }

  return {
    tag: parsed.tag,
    badge: BADGE_BY_TAG[parsed.tag] || '⚖️',
    title: parsed.title,
    body: parsed.body,
  };
}
