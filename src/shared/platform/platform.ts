import { Capacitor } from '@capacitor/core';

export const isAndroidApp = () => Capacitor.getPlatform() === 'android';
