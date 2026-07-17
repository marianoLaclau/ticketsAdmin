import { useCallback, useEffect, useMemo, useState } from 'react';
import { getGetMeQueryKey, useGetMe } from '@workspace/api-client-react';

const LEGACY_ADMIN_KEY_STORAGE = 'admin-key';
const ADMIN_KEY_STORAGE_PREFIX = 'admin-key:user:';

function adminKeyStorage(userId: number): string {
  return `${ADMIN_KEY_STORAGE_PREFIX}${userId}`;
}

function readAdminKey(userId: number | undefined): string {
  if (!userId) return '';
  return localStorage.getItem(adminKeyStorage(userId)) ?? '';
}

export function useAdminAccess() {
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const userId = me?.id;
  const [adminKey, setAdminKey] = useState(() => readAdminKey(userId));

  useEffect(() => {
    if (!userId) {
      setAdminKey('');
      return;
    }

    const persistedKey = readAdminKey(userId);
    if (persistedKey) {
      setAdminKey(persistedKey);
      return;
    }

    // Migracion unica desde el almacenamiento por pestana que se usaba antes.
    // La nueva clave queda separada por usuario para no compartirla entre
    // distintas cuentas SysAdmin que utilicen el mismo navegador.
    const legacyKey = sessionStorage.getItem(LEGACY_ADMIN_KEY_STORAGE) ?? '';
    if (legacyKey) {
      localStorage.setItem(adminKeyStorage(userId), legacyKey);
      sessionStorage.removeItem(LEGACY_ADMIN_KEY_STORAGE);
    }
    setAdminKey(legacyKey);
  }, [userId]);

  const saveAdminKey = useCallback((value: string) => {
    setAdminKey(value);
    if (!userId) return;

    if (value) {
      localStorage.setItem(adminKeyStorage(userId), value);
    } else {
      localStorage.removeItem(adminKeyStorage(userId));
    }
  }, [userId]);

  const adminRequest = useMemo(() => (adminKey ? { headers: { 'x-admin-key': adminKey } } : {}), [adminKey]);

  return { adminKey, saveAdminKey, adminRequest };
}

export function adminErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Error desconocido';
  return message.includes('401') ? 'Clave de administración inválida (completala arriba a la derecha)' : message;
}
