import chalk from 'chalk';
import { searchComponents } from '../../../lib/data/search.js';

export function listCommand(category?: string) {
  const components = searchComponents({ category });

  if (components.length === 0) {
    console.log(chalk.red(`\nNo components found for category: "${category}"`));
    console.log(chalk.gray('Valid categories: passive, active, input, output'));
    return;
  }

  console.log('');
  if (category) {
    console.log(chalk.bold(`${category.toUpperCase()} Components:`));
  } else {
    console.log(chalk.bold('All Components:'));
  }
  console.log('');

  const grouped = new Map<string, typeof components>();
  for (const c of components) {
    const group = grouped.get(c.category) ?? [];
    group.push(c);
    grouped.set(c.category, group);
  }

  for (const [cat, items] of grouped) {
    console.log(chalk.cyan.bold(`  ${cat.toUpperCase()}`));
    for (const item of items) {
      console.log(
        `    ${chalk.white(item.name.padEnd(22))} ${chalk.gray(item.description.slice(0, 60))}...`
      );
    }
    console.log('');
  }
}
