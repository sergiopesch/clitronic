import chalk from 'chalk';
import { identifyImage } from '../client.js';

export async function identifyCommand(imagePath: string) {
  console.log(chalk.gray(`\nAnalyzing image: ${imagePath}\n`));

  process.stdout.write(chalk.green('Clitronic: '));
  await identifyImage(imagePath, (text) => process.stdout.write(text));
  process.stdout.write('\n\n');
}
