import { z } from 'zod';

export const breakfastKeys = ['oats', 'milk', 'apple', 'skyr', 'cinnamon'] as const;
export const foodKey = z.enum(breakfastKeys);
export type FoodKey = z.infer<typeof foodKey>;
export const servingSettings = z.object({
  serving: z.number().finite().min(0).max(5000),
  size: z.number().finite().positive().max(20000),
});
export const morningRoutine = z.object({
  from: z.iso.date(),
  foods: z.record(foodKey, servingSettings),
});
export const pantryReading = z.object({
  day: z.iso.date(),
  afterBreakfast: z.boolean().optional(),
  food: foodKey,
  amount: z.number().finite().nonnegative().max(10000000).nullable(),
});
export const breakfastSettings = z.object({
  routines: z.array(morningRoutine),
  readings: z.array(pantryReading),
});
export type Routine = z.infer<typeof morningRoutine>;
export type Reading = z.infer<typeof pantryReading>;
export const breakfastFoods = {
  oats: { name: 'Flocons d’avoine', unit: 'g', container: 'paquet', category: 'Épicerie' },
  milk: { name: 'Lait', unit: 'ml', container: 'brique', category: 'Produits frais' },
  apple: { name: 'Pomme', unit: 'pièce', container: 'pomme', category: 'Fruits et légumes' },
  skyr: { name: 'Skyr nature', unit: 'g', container: 'pot', category: 'Produits frais' },
  cinnamon: { name: 'Cannelle moulue', unit: 'g', container: 'pot', category: 'Épicerie' },
} as const;
export const suggestedBowl: Routine['foods'] = {
  oats: { serving: 40, size: 250 },
  milk: { serving: 250, size: 1000 },
  apple: { serving: 1, size: 1 },
  skyr: { serving: 70, size: 850 },
  cinnamon: { serving: 0.5, size: 40 },
};
