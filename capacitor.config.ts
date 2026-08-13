import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.bildbot.bilddefence',
  appName: 'BildDefence',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
