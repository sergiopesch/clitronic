#!/usr/bin/env node
/**
 * Scaffold a new UI component file and output integration checklist.
 *
 * Usage:
 *   npm run scaffold:component -- --name "signal meter" --kind chart
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const uiDir = path.join(rootDir, 'components', 'ui');

function printHelp() {
  console.log(`Usage:
  npm run scaffold:component -- --name "<component name>" [--kind card|chart|image]

Examples:
  npm run scaffold:component -- --name "Signal Meter"
  npm run scaffold:component -- --name "signal-meter" --kind chart
`);
}

function toWords(input) {
  return input
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .split('-')
    .filter(Boolean);
}

function toPascal(words) {
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function toCamel(words) {
  return words.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('');
}

function parseArgs(argv) {
  const args = { name: '', kind: 'card' };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      return { help: true };
    }
    if (token === '--name') {
      args.name = argv[i + 1] ?? '';
      i++;
      continue;
    }
    if (token === '--kind') {
      args.kind = argv[i + 1] ?? 'card';
      i++;
      continue;
    }
  }
  return args;
}

function buildTemplate({ componentExport, dataType, displayName }) {
  return `'use client';

import type { ${dataType} } from '@/lib/ai/response-schema';

export function ${componentExport}({ data }: { data: ${dataType} }) {
  return (
    <div className="border-border bg-surface-1/80 overflow-hidden rounded-2xl border backdrop-blur-sm">
      <div className="border-border border-b px-4 py-4 sm:px-5">
        <h3 className="text-accent text-base font-semibold sm:text-lg">${displayName}</h3>
      </div>
      <div className="px-4 py-4 text-sm text-text-secondary sm:px-5">
        {/* TODO: implement ${componentExport} UI */}
        <pre className="overflow-x-auto rounded bg-black/20 p-3 font-mono text-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
`;
}

async function fileExists(filePath) {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  if (!parsed.name) {
    console.error('Error: --name is required.\n');
    printHelp();
    process.exit(1);
  }

  const kind = parsed.kind.toLowerCase();
  if (!['card', 'chart', 'image'].includes(kind)) {
    console.error('Error: --kind must be one of: card, chart, image.');
    process.exit(1);
  }

  const words = toWords(parsed.name);
  if (words.length === 0) {
    console.error('Error: Invalid --name value.');
    process.exit(1);
  }

  const pascal = toPascal(words);
  const camel = toCamel(words);
  const kebab = words.join('-');
  const componentName = `${camel}Card`;
  const componentExport = `${pascal}Card`;
  const dataType = `${pascal}CardData`;
  const fileName = `${kebab}-card.tsx`;
  const filePath = path.join(uiDir, fileName);

  await mkdir(uiDir, { recursive: true });

  if (await fileExists(filePath)) {
    console.error(`Error: File already exists: ${path.relative(rootDir, filePath)}`);
    process.exit(1);
  }

  const template = buildTemplate({
    componentExport,
    dataType,
    displayName: pascal,
  });

  await writeFile(filePath, template, 'utf8');

  console.log(`Created: ${path.relative(rootDir, filePath)}\n`);
  console.log('Next required updates:');
  console.log(`1) lib/ai/component-registry.ts`);
  console.log(`   - Add "${componentName}" to COMPONENT_NAMES`);
  console.log(`   - Add type mapping: ${componentName}: '${kind}'`);
  console.log(`   - Add aliases if needed`);
  console.log('');
  console.log(`2) lib/ai/response-schema.ts`);
  console.log(`   - Add interface ${dataType}`);
  console.log(`   - Extend CardData union with ${dataType}`);
  console.log('');
  console.log(`3) app/api/chat/response-validator.ts`);
  console.log(`   - Add zod schema for ${componentName}`);
  console.log(`   - Register in componentDataSchemas map`);
  console.log('');
  console.log(`4) components/ui/ui-renderer.tsx`);
  console.log(`   - Import ${componentExport}`);
  console.log(
    `   - Add renderer map entry: ${componentName}: (data) => <${componentExport} data={data as ${dataType}} />`
  );
  console.log('');
  console.log(`5) lib/ai/system-prompt.ts`);
  console.log(`   - Add intent mapping + data shape guidance for ${componentName}`);
  console.log('');
  console.log('Run after wiring: npm run validate && npm test');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
