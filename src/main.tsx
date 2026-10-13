import { createRoot } from 'react-dom/client';
import './styles/styles.css';
import { GameProvider } from './store';
import { App } from './ui/app';
import { ErrorBoundary } from './ui/error-boundary';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <ErrorBoundary>
    <GameProvider>
      <App />
    </GameProvider>
  </ErrorBoundary>,
);
