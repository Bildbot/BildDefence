import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameSession } from './game/session/GameSession';
import { createPlatformAdapter } from './platform/createPlatformAdapter';
import { SaveRepository } from './services/save/SaveRepository';
import { BrowserStorageAdapter } from './services/storage/BrowserStorageAdapter';
import { GameBridge } from './shared/GameBridge';
import { App } from './ui/App';
import './ui/styles.css';
import './ui/experience.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element is missing');

const platform = await createPlatformAdapter();
const session = new GameSession();
const bridge = new GameBridge();
const saves = new SaveRepository(new BrowserStorageAdapter());

createRoot(rootElement).render(
  <StrictMode>
    <App session={session} bridge={bridge} platform={platform} saves={saves} />
  </StrictMode>,
);
