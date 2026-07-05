import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { listClients } from './api/clients.js';

const ClientContext = createContext(null);

export function ClientProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [activeClientId, setActiveClientId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchClients = useCallback((currentId) => {
    return listClients()
      .then((data) => {
        setClients(data);
        if (data.length > 0) {
          const stillExists = data.some((c) => c.client_id === currentId);
          if (!stillExists) setActiveClientId(data[0].client_id);
        } else {
          setActiveClientId(null);
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    fetchClients(null).finally(() => setLoading(false));
  }, [fetchClients]);

  // Re-fetch clients list after create / update / delete in ManageClients
  const refreshClients = useCallback(() => {
    setActiveClientId((current) => {
      fetchClients(current);
      return current;
    });
  }, [fetchClients]);

  const value = useMemo(
    () => ({ clients, activeClientId, setActiveClientId, loading, error, refreshClients }),
    [clients, activeClientId, loading, error, refreshClients],
  );

  return (
    <ClientContext.Provider value={value}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  return useContext(ClientContext);
}
