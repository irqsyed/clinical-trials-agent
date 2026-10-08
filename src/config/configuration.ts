export const configuration = () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  openai: {
    apiKey: process.env.OPENAI_API ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },
  clinicalTrials: {
    baseUrl: 'https://clinicaltrials.gov/api/v2',
    pageSize: parseInt(process.env.CT_PAGE_SIZE ?? '100', 10),
  },
});

export type AppConfig = ReturnType<typeof configuration>;
