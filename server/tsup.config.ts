import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // Barcha dependency'lar external qoladi (pg, telegram, agent-sdk native/dynamic).
  skipNodeModulesBundle: true,
});
