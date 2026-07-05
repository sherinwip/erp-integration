import React from 'react';
import { ClientProvider } from './common/ClientContext.jsx';
import Home from './screens/Home';

function App() {
  return (
    <ClientProvider>
      <Home />
    </ClientProvider>
  );
}

export default App;
