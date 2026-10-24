import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import standalone from 'ajv/dist/standalone/index.js';

const schemas = [1, 2, 3].map(version => JSON.parse(readFileSync(new URL(`../src/lead-sheet-v${version}.schema.json`, import.meta.url))));
const ajv = new Ajv({ schemas, strict: true, allErrors: false, coerceTypes: false,
  useDefaults: false, removeAdditional: false, code: { source: true, esm: true } });
let source = standalone(ajv, Object.fromEntries(schemas.map((schema, index) => [`validateShapeV${index + 1}`, schema.$id])));
// Ajv emits CommonJS references for its small runtime helpers even in ESM mode.
// Convert only that documented helper namespace, and fail on unexpected imports.
const helpers = new Map();
source = source.replace(/require\("(ajv\/dist\/runtime\/[a-zA-Z0-9_-]+)"\)\.default/g, (_, path) => {
  if (!helpers.has(path)) helpers.set(path, `runtime${helpers.size}`);
  return helpers.get(path);
});
if (/\brequire\s*\(|\bnew\s+Function\s*\(|\beval\s*\(/.test(source)) throw new Error('Generated validators must be static ESM.');
const imports = [...helpers].map(([path, name]) => `import ${name}Module from '${path}.js';\nconst ${name} = ${name}Module.default ?? ${name}Module;`).join('\n');
source = `// Generated from the reviewed score schemas; do not edit.\n${imports}\n${source}\n`;
const types = `import type { ValidateFunction } from 'ajv';\nimport type { LeadSheet } from '../score.js';\n` +
  schemas.map((_, index) => `export declare const validateShapeV${index + 1}: ValidateFunction<LeadSheet>;`).join('\n') + '\n';
for (const directory of ['src/generated', 'dist/generated']) {
  const target = new URL(`../${directory}/`, import.meta.url);
  mkdirSync(target, { recursive: true });
  writeFileSync(new URL('score-validators.js', target), source);
  writeFileSync(new URL('score-validators.d.ts', target), types);
}
console.info('Generated static score validators for versions 1, 2 and 3.');
