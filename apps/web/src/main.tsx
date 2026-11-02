import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RelayEnvironmentProvider } from 'react-relay';
import { RouterProvider } from 'react-router/dom';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { PreferencesProvider } from './app/preferences.tsx';
import { router } from './app/router.tsx';
import { environment } from './relay/environment.ts';
import { reportWebVitals } from './app/vitals.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <RelayEnvironmentProvider environment={environment}>
        <RouterProvider router={router} />
      </RelayEnvironmentProvider>
    </PreferencesProvider>
  </StrictMode>,
);

reportWebVitals();
