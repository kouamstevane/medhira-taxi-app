'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../app/lib/firebase';
import { User, onAuthStateChanged } from 'firebase/auth';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('Initializing auth state listener...'); // Debug
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('Auth state changed:', user); // Important pour le debug
      setCurrentUser(user);
      setLoading(false);
    });

    // Vérification immédiate de l'état actuel
    const currentUser = auth.currentUser;
    console.log('Immediate auth check:', currentUser); // Debug
    if (currentUser) {
      setCurrentUser(currentUser);
      setLoading(false);
    }

    return () => {
      console.log('Cleaning up auth listener...'); // Debug
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}