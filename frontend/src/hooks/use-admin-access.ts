import { useMemo, useState } from 'react';

const ADMIN_KEY_STORAGE = 'admin-key';

export function useAdminAccess() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '');

  const saveAdminKey = (value: string) => {
    setAdminKey(value);
    sessionStorage.setItem(ADMIN_KEY_STORAGE, value);
  };

  const adminRequest = useMemo(() => (adminKey ? { headers: { 'x-admin-key': adminKey } } : {}), [adminKey]);

  return { adminKey, saveAdminKey, adminRequest };
}

export function adminErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Error desconocido';
  return message.includes('401') ? 'Clave de administración inválida (completala arriba a la derecha)' : message;
}
