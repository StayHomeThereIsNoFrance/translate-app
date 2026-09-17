import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  // SQLite is a prefix-only Node builtin; stripping `node:` breaks production.
  removeNodeProtocol: false,
  sourcemap: true,
  clean: true,
  noExternal: ['@thai-translate/contracts'],
});
