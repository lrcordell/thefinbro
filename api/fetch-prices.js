import { fetchLivePrices } from '../lib/priceProvider.js';

let cache = { data: null, fetchedAt: 0 };
const CACHE_MS = 2 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const fresh = cache.data && Date.now() - cache.fetchedAt < CACHE_MS;
  if (fresh) {
    return res.status(200).json({ prices: cache.data, cached: true });
  }

  try {
    const prices = await fetchLivePrices({ apiKey: process.env.TWELVEDATA_API_KEY });
    cache = { data: prices, fetchedAt: Date.now() };
    return res.status(200).json({ prices, cached: false });
  } catch (err) {
    console.error('Price fetch failed:', err);
    if (cache.data) {
      return res.status(200).json({ prices: cache.data, cached: true, stale: true });
    }
    return res.status(500).json({ error: 'Failed to fetch prices' });
  }
}
