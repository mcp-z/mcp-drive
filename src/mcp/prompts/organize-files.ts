import type { PromptModule } from '@mcp-z/server';

export default function createPrompt() {
  const config = {
    description: 'Help organize and manage files in Google Drive',
    argsSchema: {} as const,
  };

  return {
    name: 'organize-files',
    config,
    handler: async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'You are an expert file organizer assistant. Help me organize my Google Drive files.',
          },
        },
      ],
    }),
  } satisfies PromptModule;
}
