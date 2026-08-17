import fetch from 'node-fetch';

// Maps the ticker symbols shown on the site to the exact symbol string
// Twelve Data expects. Two macro symbols (DXY, 10Y) aren't cleanly available
// on Twelve Data's free tier under a standard symbol — if either comes back
// as an error we just leave that one tile showing its last known value
// instead of breaking the whole ticker.
export const TICKER_CONFIG = [
  { display: 'SPY', tdSymbol: 'SPY' },
  { display: 'NVDA', tdSymbol: 'NVDA' },
  { display: 'AAPL', tdSymbol: 'AAPL' },
  { display: 'TSLA', tdSymbol: 'TSLA' },
  { display: 'BTC', tdSymbol: 'BTC/USD' },
  { display: 'DXY', tdSymbol: 'DXY' },
  { display: '10Y', tdSymbol: 'TNX' },
  { display: 'AMD', tdSymbol: 'AMD' },
  { display: 'GOLD', tdSymbol: 'XAU/USD' },
  { display: 'QQQ', tdSymbol: 'QQQ' },
];

export async function fetchLivePrices({ apiKey }) {
  if (!apiKey) throw new Error('Missing TWELVEDATA_API_KEY');

  const symbolList = TICKER_CONFIG.map((t) => t.tdSymbol).join(',');
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolList)}&apikey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Twelve Data request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  const bySymbol = data.symbol ? { [data.symbol]: data } : data;

  return TICKER_CONFIG.map(({ display, tdSymbol }) => {
    const q = bySymbol[tdSymbol];
    if (!q || q.status === 'error' || q.close === undefined) {
      return { s: display, p: null, c: null, up: null, error: true };
    }
    const price = parseFloat(q.close);
    const pct = parseFloat(q.percent_change);
    return {
      s: display,
      p: formatPrice(price),
      c: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
      up: pct >= 0,
    };
  });
}

function formatPrice(n) {
  if (Number.isNaN(n)) return '--';
  return n >= 1000
    ? n.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

