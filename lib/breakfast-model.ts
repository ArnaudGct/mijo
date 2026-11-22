import { z } from 'zod';
import { fold, groceryName } from './grocery-names';

export const bowlUnits = ['g', 'ml', 'pièce'] as const;
const portion = z.object({
  serving: z.number().finite().min(0).max(5000),
  size: z.number().finite().positive().max(20000),
});
const food = portion.extend({
  name: z.string().trim().min(1).max(100),
  unit: z.enum(bowlUnits),
  container: z.string().trim().min(1).max(40),
});
export type BowlFood = z.infer<typeof food>;
export const suggestedBowl: Record<string, BowlFood> = {
  oats: { name: 'Flocons d’avoine', unit: 'g', container: 'paquet', serving: 40, size: 250 },
  milk: { name: 'Lait', unit: 'ml', container: 'brique', serving: 250, size: 1000 },
  apple: { name: 'Pomme', unit: 'pièce', container: 'pomme', serving: 1, size: 1 },
  skyr: { name: 'Skyr nature', unit: 'g', container: 'pot', serving: 70, size: 850 },
  cinnamon: { name: 'Cannelle moulue', unit: 'g', container: 'pot', serving: 0.5, size: 40 },
};
const originalIds = new Map(Object.entries(suggestedBowl).map(([id, f]) => [fold(f.name), id]));
export function breakfastKey(name: string) {
  const normalized = fold(groceryName(name));
  return originalIds.get(normalized) ?? 'food:' + normalized;
}
const foodId = z.string().min(1).max(150);
export const morningRoutine = z.object({
  from: z.iso.date(),
  // Old exports contain only serving and package size for the original five foods.
  foods: z.record(foodId, z.union([food, portion.strict()])).transform((entries, ctx) => {
    const normalized: Record<string, BowlFood> = {};
    for (const [key, value] of Object.entries(entries)) {
      const product =
        'name' in value
          ? value
          : Object.hasOwn(suggestedBowl, key)
            ? { ...suggestedBowl[key], ...value }
            : null;
      if (
        !product ||
        breakfastKey(product.name) !== key ||
        (Object.hasOwn(suggestedBowl, key) && product.unit !== suggestedBowl[key].unit)
      ) {
        ctx.addIssue({ code: 'custom', message: 'Nom ou unité de l’ingrédient incohérent.' });
        return z.NEVER;
      }
      normalized[key] = product;
    }
    if (Object.keys(normalized).length < 1 || Object.keys(normalized).length > 60)
      ctx.addIssue({ code: 'custom', message: 'Choisis entre 1 et 60 ingrédients.' });
    return normalized;
  }),
});
export const pantryReading = z.object({
  day: z.iso.date(),
  afterBreakfast: z.boolean().optional(),
  food: foodId,
  amount: z.number().finite().nonnegative().max(10000000).nullable(),
});
export const breakfastSettings = z.object({
  routines: z.array(morningRoutine),
  readings: z.array(pantryReading),
});
export type Routine = z.infer<typeof morningRoutine>;
export type Reading = z.infer<typeof pantryReading>;

export function foodsOn(routines: Routine[], day: string) {
  return routines.filter((r) => r.from <= day).sort((a, b) => b.from.localeCompare(a.from))[0]
    ?.foods;
}
export function orderedFoods(foods: Routine['foods']) {
  const keys = new Set([...Object.keys(suggestedBowl), ...Object.keys(foods)]);
  return [...keys].filter((k) => Object.hasOwn(foods, k)).map((k) => [k, foods[k]] as const);
}
