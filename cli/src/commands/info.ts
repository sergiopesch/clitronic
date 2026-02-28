import chalk from 'chalk';
import { electronicsComponents, lookupComponent } from '../data/index.js';

export function infoCommand(query: string) {
  const component = lookupComponent(query);

  if (!component) {
    console.log(chalk.red(`\nComponent not found: "${query}"`));
    console.log(chalk.gray('Available: ' + electronicsComponents.map((c) => c.id).join(', ')));
    return;
  }

  console.log('');
  console.log(chalk.bold.cyan(`${component.name}`));
  console.log(chalk.gray(`Category: ${component.category}`));
  console.log('');
  console.log(component.description);
  console.log('');

  console.log(chalk.bold('Specifications:'));
  for (const spec of component.specs) {
    console.log(`  ${chalk.gray(spec.label + ':')} ${spec.value}`);
  }
  console.log('');

  console.log(chalk.bold('Circuit Example:'));
  console.log(`  ${component.circuitExample}`);

  if (component.datasheetInfo) {
    const ds = component.datasheetInfo;
    console.log('');
    console.log(chalk.bold('Pinout:'));
    console.log(`  ${ds.pinout}`);
    console.log('');

    console.log(chalk.bold('Maximum Ratings:'));
    for (const r of ds.maxRatings) {
      console.log(`  ${chalk.gray(r.parameter + ':')} ${r.value}`);
    }
    console.log('');

    console.log(chalk.bold('Common Part Numbers:'));
    console.log(`  ${ds.partNumbers.join(', ')}`);
    console.log('');

    console.log(chalk.bold('Tips:'));
    console.log(`  ${ds.tips}`);
  }

  console.log('');
}
