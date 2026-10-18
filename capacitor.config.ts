import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lifespace.foundation.test',
  appName: 'Life Space',
  webDir: 'dist',
  plugins: { SplashScreen: { launchAutoHide: true } }
};

export default config;
