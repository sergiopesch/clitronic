import { electronicsComponents } from '@/lib/data/components';
import type { CircuitNodeType } from './types';

export interface CircuitCatalogEntry {
  key: string;
  aliases: string[];
  label: string;
  nodeType: CircuitNodeType;
}

const aliasMap = new Map<string, CircuitCatalogEntry>();

function register(entry: CircuitCatalogEntry) {
  for (const alias of entry.aliases) {
    aliasMap.set(alias.toLowerCase(), entry);
  }
}

for (const component of electronicsComponents) {
  register({
    key: component.id,
    aliases: [component.id, component.name.toLowerCase()],
    label: component.name,
    nodeType:
      component.category === 'passive'
        ? 'passive'
        : component.category === 'active'
          ? 'active'
          : component.category === 'input'
            ? 'input'
            : 'output',
  });
}

register({
  key: 'battery',
  aliases: ['battery', '9v', '9 volt battery', 'power supply', 'supply', 'vcc'],
  label: 'Battery',
  nodeType: 'power',
});

register({
  key: 'ground',
  aliases: ['ground', 'gnd', '0v'],
  label: 'Ground',
  nodeType: 'ground',
});

register({
  key: 'wire',
  aliases: ['wire', 'wiring', 'connection'],
  label: 'Wire',
  nodeType: 'logic',
});

export function findCatalogMatches(input: string): CircuitCatalogEntry[] {
  const normalized = input.toLowerCase();
  const matches = new Map<string, CircuitCatalogEntry>();

  for (const [alias, entry] of aliasMap.entries()) {
    if (normalized.includes(alias)) {
      matches.set(entry.key, entry);
    }
  }

  return Array.from(matches.values());
}
