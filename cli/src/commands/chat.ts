import { createInterface } from "readline";
import chalk from "chalk";
import { streamChat, type ChatMessage } from "../client.js";

export async function chatCommand() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const history: ChatMessage[] = [];

  console.log(chalk.bold("\nClitronic Interactive Chat"));
  console.log(chalk.gray("Type your questions. Use Ctrl+C to exit.\n"));

  const prompt = () => {
    rl.question(chalk.blue("You: "), async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        prompt();
        return;
      }

      history.push({ role: "user", content: trimmed });

      process.stdout.write(chalk.green("\nClitronic: "));
      const response = await streamChat(history, (text) =>
        process.stdout.write(text)
      );
      process.stdout.write("\n\n");

      history.push({ role: "assistant", content: response });
      prompt();
    });
  };

  prompt();
}
