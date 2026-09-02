'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPersonalDriverPlans } from '@/services/personal-driver/plan-config.service';
import {
  clonePersonalDriverPlanMap,
  PersonalDriverPlansContext,
  type PersonalDriverPlanMap,
} from '@/hooks/usePersonalDriverPlans';

interface PersonalDriverPlansProviderProps {
  children: React.ReactNode;
}

export function PersonalDriverPlansProvider({ children }: PersonalDriverPlansProviderProps) {
  const [plans, setPlans] = useState<PersonalDriverPlanMap>(() => clonePersonalDriverPlanMap());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getPersonalDriverPlans();
      if (result.error) {
        setPlans(clonePersonalDriverPlanMap());
        setError(result.error);
        return;
      }
      setPlans(clonePersonalDriverPlanMap(result.plans));
      setError(null);
    } catch (nextError) {
      setPlans(clonePersonalDriverPlanMap());
      setError(nextError instanceof Error ? nextError : new Error('Failed to load personal driver plans'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({
    plans,
    isLoading,
    error,
    reload,
  }), [error, isLoading, plans, reload]);

  return (
    <PersonalDriverPlansContext.Provider value={value}>
      {children}
    </PersonalDriverPlansContext.Provider>
  );
}
