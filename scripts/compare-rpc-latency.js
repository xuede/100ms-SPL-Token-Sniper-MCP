#!/usr/bin/env node
import { performance } from 'perf_hooks';
import { setGlobalDispatcher, Agent } from 'undici';

setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 } }));

const INFURA_RPC = process.env.RPC_ENDPOINT || 'https://solana-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID';
const HELIUS_RPC = process.env.FALLBACK_RPC || `https://rpc.helius.xyz/?api-key=${process.env.HELIUS_API_KEY || 'YOUR_HELIUS_API_KEY'}`;
const ITERATIONS = parseInt(process.argv[2] || '5', 10);

async function measure(endpoint, iterations) {
  let total = 0;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: i, method: 'getSlot', params: [] })
      });
      await res.json();
    } catch (err) {
      console.error(`Request failed for ${endpoint}:`, err.message);
      return Infinity;
    }
    total += performance.now() - start;
  }
  return total / iterations;
}

async function main() {
  console.log(`Running ${ITERATIONS} iterations per endpoint...`);
  const infuraAvg = await measure(INFURA_RPC, ITERATIONS);
  const heliusAvg = await measure(HELIUS_RPC, ITERATIONS);
  console.log(`Infura RPC (${INFURA_RPC}) average: ${infuraAvg.toFixed(2)} ms`);
  console.log(`Helius RPC (${HELIUS_RPC}) average: ${heliusAvg.toFixed(2)} ms`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
