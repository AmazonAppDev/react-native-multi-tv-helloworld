import {useCallback, useEffect, useMemo, useState} from 'react';
import {createSpeciesClient} from '@multitv/shared';
import type {SpeciesClient, SpeciesRecord} from '@multitv/shared';
import {toGameSpecies} from './rounds';
import type {GameSpecies} from './rounds';

export type PoolStatus = 'loading' | 'ready' | 'error';

export interface SpeciesPool {
  status: PoolStatus;
  pool: GameSpecies[];
  error: string;
  retry: () => void;
}

/** One catalogue page feeds every round of a game session. */
export const useSpeciesPool = (client?: SpeciesClient): SpeciesPool => {
  const species = useMemo(() => client ?? createSpeciesClient(), [client]);
  const [status, setStatus] = useState<PoolStatus>('loading');
  const [records, setRecords] = useState<SpeciesRecord[]>([]);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError('');
    species
      .list('all', {limit: 30})
      .then(page => {
        if (!cancelled) {
          setRecords(page.items);
          setStatus('ready');
        }
      })
      .catch(reason => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [species, reloadKey]);

  const pool = useMemo(() => toGameSpecies(records), [records]);
  const retry = useCallback(() => setReloadKey(key => key + 1), []);

  return {status, pool, error, retry};
};
