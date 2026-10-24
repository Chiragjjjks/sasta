export const Platform = { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default }
export const Share = { share: async () => ({}) }
