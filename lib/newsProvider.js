import fetch from 'node-fetch';

/**
 * Pulls recent market-moving headlines from Marketaux and normalizes them
 * into a consistent shape the rest of the pipeline can work with.
 *
 * Swap this file out if you switch providers (NewsAPI, Benzinga, Polygon, etc.)
 * — everything downstream just expects the normalized shape returned below.
 */
export async function fetchRawNews({ apiKey, limit = 12, symbols = null }) {
  if (!apiKey) throw new Error('Missing MARKETAUX_API_KEY');

  const params = new URLSearchParams({
    api_token: apiKey,
    language: 'en',
    limit: String(limit),
    filter_entities: 'true',
  });

  // Optionally restrict to a specific watchlist, e.g. "NVDA,TSLA,AAPL"
  if (symbols) params.set('symbols', symbols);

  const url = `https://api.marketaux.com/v1/news/all?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Marketaux request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  const articles = data.data || [];

  return articles.map((a) => ({
    id: a.uuid,
    title: a.title,
    snippet: a.description || a.snippet || '',
    source: a.source,
    url: a.url,
    publishedAt: a.published_at,
    // Marketaux tags each article with the tickers it mentions
    tickers: (a.entities || [])
      .filter((e) => e.type === 'equity')
      .map((e) => e.symbol)
      .filter(Boolean),
  }));
}
