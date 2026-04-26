'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, query, collection, where, getDocs, limit } from 'firebase/firestore';
import { db, auth } from '@/config/firebase';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AdminAuth');

/**
 * Hook pour vérifier les droits administrateur.
 * Redirige vers /login si non connecté, /dashboard si non admin.
 *
 * @returns isAdmin - null pendant la vérification, true/false après
 */
export function useAdminAuth(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const checkAdmin = async () => {
      const user = auth.currentUser;
      if (!user) {
        if (isMounted) {
          setIsAdmin(false);
          router.push('/login');
        }
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
        if (adminDoc.exists()) {
          if (isMounted) setIsAdmin(true);
          return;
        }

        const adminQuery = query(
          collection(db, 'admins'),
          where('userId', '==', user.uid),
          limit(1) // Règle Section 4.1 : limit() obligatoire
        );
        const adminSnapshot = await getDocs(adminQuery);

        if (!isMounted) return;

        if (!adminSnapshot.empty) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          router.push('/dashboard');
        }
      } catch (err) {
        logger.error('Erreur vérification admin', err instanceof Error ? err : new Error(String(err)));
        if (isMounted) setIsAdmin(false);
      }
    };

    checkAdmin();

    return () => { isMounted = false; };
  }, [router]);

  return isAdmin;
}
