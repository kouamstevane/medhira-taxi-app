'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, query, collection, where, getDocs, limit } from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
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

    // On attend l'hydratation de l'état d'auth Firebase (IndexedDB) avant de décider.
    // Lire `auth.currentUser` de façon synchrone au montage provoque un faux
    // redirect vers /login lorsque le SDK n'a pas encore restauré la session.
    const checkAdmin = async (user: User) => {
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

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!isMounted) return;
      if (!user) {
        setIsAdmin(false);
        router.push('/login');
        return;
      }
      void checkAdmin(user);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [router]);

  return isAdmin;
}
