import type { State } from '../lib/model';
/** Contrat des colonnes renvoyées par PostgreSQL après décodage natif de jsonb. */
export interface PreferencesRow {
  revision: number;
  data: State['prefs'];
}
export interface EntityRow<
  K extends keyof Pick<
    State,
    'recipes' | 'preps' | 'meals' | 'sessions' | 'stock' | 'prices' | 'items' | 'lots'
  >,
> {
  data: State[K][number];
}
