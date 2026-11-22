import rules from './market-data/market-families.json';
import { fold } from './grocery-names';

const families = rules.map((rule) => ({ ...rule, re: new RegExp(rule.pattern) }));
export function marketFamily(name: string, household = false) {
  const normalized = fold(name);
  return families.find((family) => !!family.household === household && family.re.test(normalized));
}
