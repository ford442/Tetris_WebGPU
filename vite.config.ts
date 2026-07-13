import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** Content hash for public/block.png — busts browser/CDN cache after texture edits. */
function blockTextureCacheKey(): string {
  try {
    const buf = readFileSync('public/block.png');
    return createHash('md5').update(buf).digest('hex').slice(0, 8);
  } catch {
    return 'missing';
  }
}

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/tetris-webgpu/' : '/',
  define: {
    __BLOCK_TEXTURE_CACHE_KEY__: JSON.stringify(blockTextureCacheKey()),
  },
  server: {
    allowedHosts: ['code.noahcohn.com', 'localhost'],
  },
});
