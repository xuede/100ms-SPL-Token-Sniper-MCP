#!/usr/bin/env node
import { chmod } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const scripts = [
  'scripts/setup.js',
  'scripts/launch-claude.js',
  'scripts/make-executable.js',
  'test/test-sniper.js',
  'build/index.js'
];

async function makeExecutable() {
  console.log('Making scripts executable...');
  
  for (const script of scripts) {
    try {
      const path = join(__dirname, '..', script);
      await chmod(path, '755');
      console.log(`✅ Made executable: ${script}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`❌ Failed to make executable: ${script}`, error);
      }
    }
  }

  console.log('\nDone! All scripts are now executable.');
}

makeExecutable().catch(console.error);
