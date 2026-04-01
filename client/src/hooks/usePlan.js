import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/apiFetch.js';

/**
 * Returns the logged-in user's current plan: 'free' | 'pro' | 'multi'.
 * Starts with the cached value from localStorage, then refreshes from the API.
 */
export function usePlan() {
  const { user } = useAuth();
  const [plan, setPlan] = useState(user?.plan ?? 'free');

  useEffect(() => {
    apiFetch('/api/stripe/subscription')
      .then((r) => r.json())
      .then((data) => { if (data.plan) setPlan(data.plan); })
      .catch(() => {});
  }, []);

  return plan;
}
