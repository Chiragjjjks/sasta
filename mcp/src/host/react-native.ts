/** The shared core only asks react-native which platform it runs on. The server behaves like the Android app: live data, no samples. */
export const Platform = { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.native ?? o.default }
export const Share = { share: async () => ({}) }
