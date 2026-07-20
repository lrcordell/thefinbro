import { runPipeline } from '../lib/pipeline.js';

// Simple in-memory cache so you're not hitting the news API + Claude on
// every single page load. Resets on cold start — fine for a solo-operator
// scale site; swap for Redis/Vercel KV once traffic justifies it.
let cache = { data: null, fetchedAt: 0 };
const CACHE_MS = 15 * 60 * 1000; // 15 minutes

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const fresh = cache.data && Date.now() - cache.fetchedAt < CACHE_MS;
  if (fresh) {
    return res.status(200).json({ news: cache.data, cached: true });
  }

  try {
    const news = await runPipeline({
      marketauxKey: process.env.MARKETAUX_API_KEY,
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      limit: 8,
    });

    cache = { data: news, fetchedAt: Date.now() };
    return res.status(200).json({ news, cached: false });
  } catch (err) {
    console.error('Pipeline failed:', err);
    // Serve stale cache rather than a broken page if the pipeline errors
    if (cache.data) {
      return res.status(200).json({ news: cache.data, cached: true, stale: true });
    }
    return res.status(500).json({ error: 'Failed to fetch news' });
  }
}
