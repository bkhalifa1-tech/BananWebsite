export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
export interface AIProvider {
  complete(messages: AIMessage[]): Promise<string>;
}
export function configuredAI(): AIProvider | null {
  if (process.env.AI_ENABLED === "false" || !process.env.AI_API_KEY)
    return null;
  const key = process.env.AI_API_KEY,
    model = process.env.AI_MODEL || "gpt-4.1-mini";
  return {
    async complete(messages) {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            max_completion_tokens: 1800,
          }),
          signal: AbortSignal.timeout(45000),
          redirect: "error",
        },
      );
      if (!response.ok) throw new Error("AI provider request failed.");
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content || content.length > 24000)
        throw new Error("AI provider returned an invalid response.");
      return content;
    },
  };
}
