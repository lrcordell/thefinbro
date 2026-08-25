import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are the editorial voice of The Fin Bro, a market news brief for
retail traders who don't have time for jargon. You'll be given today's biggest market
headlines. Write a single longer-form analysis piece (400-600 words) synthesizing the most
important 2-4 stories into one cohesive "here's what actually matters today and why" article.

Confident, casual, no-BS tone — like a smart friend explaining the day over coffee, not a
press release. Never give trading advice (no "buy", "sell", "you should"). Use short
paragraphs, no markdown formatting of any kind — no headers, no bold, no asterisks.

Respond in EXACTLY this format, nothing before or after it, no preamble like "Here's the article":

TITLE: <a punchy headline, 8-14 words>
===BODY===
<the full article text, 400-600 words, with a blank line between paragraphs>`;

function parseDraft(raw) {
  let titleMatch = raw.match(/^TITLE:\s*(.+?)\s*(?:\r?\n)/);
  let bodySplit = raw.split('===BODY===');
  if (titleMatch && bodySplit.length >= 2 && bodySplit[1].trim()) {
    return { title: titleMatch[1].trim(), body: bodySplit[1].trim() };
  }

  const looseTitleMatch = raw.match(/\**\s*TITLE:\s*\**\s*(.+?)\s*(?:\r?\n)/i);
  const looseBodySplit = raw.split(/\**\s*===\s*BODY\s*===\s*\**/i);
  if (looseTitleMatch && looseBodySplit.length >= 2 && looseBodySplit[1].trim()) {
    return { title: looseTitleMatch[1].trim(), body: looseBodySplit[1].trim() };
  }

  const lines = raw.split('\n').map(l => l.trim());
  const firstContentLine = lines.find(l => l.length > 0);
  if (firstContentLine) {
    const title = firstContentLine.replace(/^\**\s*TITLE:\s*\**\s*/i, '').trim();
    const bodyStartIndex = raw.indexOf(firstContentLine) + firstContentLine.length;
    const body = raw.slice(bodyStartIndex).trim();
    if (title && body) {
      return { title, body };
    }
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!process.env.ADMIN_PASSWORD || body?.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const siteUrl = 'https://thefinbro.com';
    const newsRes = await fetch(`${siteUrl}/api/fetch-news`);
    if (!newsRes.ok) throw new Error(`fetch-news returned ${newsRes.status}`);
    const { news } = await newsRes.json();
    if (!news || !news.length) throw new Error('No news content available to draft from');

    const headlinesText = news
      .map(n => `- ${n.title}: ${n.body}`)
      .join('\n');

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Today's headlines:\n${headlinesText}` }],
    });

    const raw = message.content[0].text.trim();
    const draft = parseDraft(raw);

    if (!draft) {
      console.error('Article draft parse failed. Raw response was:', raw);
      throw new Error('Could not parse a title/body from the draft — check Vercel logs for the raw response');
    }

    return res.status(200).json({ ok: true, draft });
  } catch (err) {
    console.error('Article draft failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
