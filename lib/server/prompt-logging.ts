import type { createLogger } from '@/lib/logger';

type Logger = ReturnType<typeof createLogger>;

const DEFAULT_PROMPT_PREVIEW_CHARS = 4000;

function promptPreview(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n... [truncated ${text.length - limit} chars]`;
}

export function logPromptPreview(
  log: Logger,
  label: string,
  prompts: { system: string; user: string },
  options?: { previewChars?: number },
) {
  const previewChars = options?.previewChars ?? DEFAULT_PROMPT_PREVIEW_CHARS;
  log.info(
    `${label} prompt sizes: systemChars=${prompts.system.length}, userChars=${prompts.user.length}`,
  );
  log.info(`${label} system prompt preview:\n${promptPreview(prompts.system, previewChars)}`);
  log.info(`${label} user prompt preview:\n${promptPreview(prompts.user, previewChars)}`);
}
