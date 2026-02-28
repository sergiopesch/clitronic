import { streamChat } from "../client.js";

export async function askCommand(question: string) {
  process.stdout.write("\n");
  await streamChat(
    [{ role: "user", content: question }],
    (text) => process.stdout.write(text)
  );
  process.stdout.write("\n\n");
}
