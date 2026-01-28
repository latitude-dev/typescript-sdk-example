import { Readable } from "node:stream";
import { Latitude, Adapters } from "@latitude-data/sdk";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const promptPath = process.env.LATITUDE_PROMPT_PATH!;
const latitude = new Latitude(process.env.LATITUDE_API_KEY!, {
  projectId: Number(process.env.LATITUDE_PROJECT_ID),
  versionUuid: process.env.LATITUDE_PROMPT_VERSION_UUID,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * Stream Wikipedia article by rendering the prompt from Latitude and calling OpenAI,
 * then logging the run to Latitude for telemetry.
 */
export async function generateWikipediaArticleStream(
  input: string,
): Promise<Readable> {
  const prompt = await latitude.prompts.get(promptPath);
  const rendered = await latitude.prompts.render({
    prompt: { content: prompt.content },
    parameters: { user_input: input },
    adapter: Adapters.openai,
  });

  const model = (rendered.config as { model?: string }).model ?? "gpt-4o";
  const messages = rendered.messages as ChatCompletionMessageParam[];

  const stream = await openai.chat.completions.create({
    model,
    messages,
    stream: true,
  });

  const readable = new Readable({ read() {} });

  let fullText = "";

  (async () => {
    try {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content != null) {
          fullText += content;
          readable.push(content);
        }
      }
      readable.push(null);

      await latitude.logs.create(
        promptPath,
        rendered.messages as unknown as Parameters<
          typeof latitude.logs.create
        >[1],
        { response: fullText },
      );
    } catch (err) {
      readable.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return readable;
}
