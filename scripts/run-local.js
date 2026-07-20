import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runPipeline } from '../lib/pipeline.js';

const OUTPUT_PATH = process.env.OUTPUT_PATH || './output/news.json';

async function main() {
  console.log('Fetching + tagging news...');

  const news = await runPipeline({
    marketauxKey: process.env.MARKETAUX_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    limit: 8,
  });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ news, generatedAt: new Date().toISOString() }, null, 2));

  console.log(`Wrote ${news.length} stories to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
