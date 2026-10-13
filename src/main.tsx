import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';
import App from './app/shell/App';
import './styles.css';

if (Capacitor.getPlatform() === 'android') document.documentElement.classList.add('native-android');
registerSW({ immediate: true });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
