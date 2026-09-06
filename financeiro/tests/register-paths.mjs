import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
const root = new URL('../src/', import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const url = new URL(specifier.slice(2), root);
      if (existsSync(url)) return nextResolve(url.href, context);
      if (existsSync(new URL(`${url.href}.ts`))) return nextResolve(`${url.href}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
