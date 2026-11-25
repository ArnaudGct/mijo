import { money } from '@/lib/dates';
import type { RecipeCost } from '@/lib/market';

export function RecipePrice({
  cost,
  servings = cost?.portions,
}: {
  cost?: RecipeCost;
  servings?: number | null;
}) {
  const yieldLabel = servings
    ? `${servings} portion${servings > 1 ? 's' : ''}`
    : 'portions à préciser';
  const ingredients = cost ? cost.priced + cost.missing : 0;
  const coverage = cost && cost.missing > 0 && (
    <span className="price-coverage">
      {cost.priced}/{ingredients}{' '}
      {ingredients === 1 ? 'ingrédient chiffré' : 'ingrédients chiffrés'}
    </span>
  );
  if (cost?.cents == null)
    return (
      <small className="recipe-price">
        Prix indisponible{cost && ' · ' + yieldLabel}
        {coverage}
      </small>
    );
  const perPortion = cost.portions ? cost.cents / cost.portions : null;
  const total = perPortion !== null && servings ? perPortion * servings : cost.cents;
  return (
    <small className="recipe-price">
      <span>
        <strong>≈ {money(Math.round(total))}</strong>
        {servings ? ' pour ' : ' · '}
        {yieldLabel}
      </span>
      {perPortion !== null && servings && servings > 1 ? (
        <span className="price-per-portion"> · {money(Math.round(perPortion))}/portion</span>
      ) : null}
      {coverage}
    </small>
  );
}
