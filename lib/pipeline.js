import { fetchRawNews } from './newsProvider.js';
import { tagArticle } from './tagger.js';

/**
 * Full pipeline: fetch -> tag/rewrite -> format for the site.
 * Every 3rd story is locked behind Pro — swap this for real subscriber-status
 * logic once accounts exist (see api/fetch-news.js for where that check goes).
 */
export async function runPipeline({ marketauxKey, anthropicKey, limit = 8, symbols = null }) {
  const raw = await fetchRawNews({ apiKey: marketauxKey, limit, symbols });

  const tagged = [];
  for (const article of raw) {
    // Sequential, not parallel — keeps this friendly to free-tier rate limits.
    // Bump to Promise.all with a concurrency limiter once you're on a paid tier.
    const result = await tagArticle({ apiKey: anthropicKey, article });
    tagged.push({ article, result });
  }

  return tagged.map(({ article, result }, i) => ({
    tkr: article.tickers[0] || 'MKT',
    tag: result.tag,
    badge: result.badge,
    time: new Date(article.publishedAt).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }),
    source: article.source,
    title: result.title,
    body: result.body,
    sourceUrl: article.url,
    locked: i % 3 === 2, // every 3rd story is Pro-only
  }));
}
