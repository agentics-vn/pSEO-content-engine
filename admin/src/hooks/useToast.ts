import { useCallback, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);

  const notify = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return { toast, notify };
}
