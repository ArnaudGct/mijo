import { withAccount, originalNotebook } from '../lib/account-scope';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { state, db } from '../lib/db';
import { mutate, type Command } from '../lib/commands';
import { blankRecipe } from '../lib/model';
import { parseLine } from '../lib/ingredients';
import { addDays, today, monday } from '../lib/dates';
import { weekPlan } from '../lib/week-plan';
import { needs } from '../lib/shopping';
import { commonMeasures, sessionTasks } from '../lib/planner';
import { storePhoto } from '../lib/media';
import sharp from 'sharp';
import { archivePages } from '../lib/archive';
import { importBatch } from '../lib/import-db';
import { backup, restore } from '../lib/backup';
import { syncChecks } from '../lib/offline';
if (!process.env.TABLE_TEST_DATABASE?.startsWith('table_test_'))
  throw Error('Base de test requise');
const uid = () => crypto.randomUUID(),
  day = addDays(monday(today()), 7);
async function write(c: Command) {
  return mutate((await state()).revision, c);
}
test('transactions PostgreSQL, parcours complet, restauration et rejouabilité', async (t) => {
  return withAccount(originalNotebook, () => runNotebookTests(t));
});
async function runNotebookTests(t: import('node:test').TestContext) {
  const r = {
    ...blankRecipe(),
    title: 'Recette de test',
    base: 2,
    ingredients: [parseLine('Chou | 0,15 | kg')],
    steps: [{ text: 'Émincer.', image: '' }],
  };
  let rid = '',
    pId = '',
    ss = '';
  try {
    await t.test('créer, retrouver, éditer et conserver les versions', async () => {
      rid = (await write({ action: 'recipe', data: r })).id!;
      await write({ action: 'recipe', id: rid, data: { ...r, title: 'Chou émincé' } });
      const s = await state();
      assert.equal(s.recipes[0].data.title, 'Chou émincé');
      assert.equal((await backup()).versions.length, 2);
    });
    await t.test('répartir les portions, refuser un conflit sans écriture partielle', async () => {
      await write({ action: 'plan', id: rid, servings: 2, day, leftovers: true });
      const s = await state();
      pId = s.preps[0].id;
      assert.equal(s.meals.length, 2);
      assert.equal(needs(s, day).rows[0].buy, 150);
      await assert.rejects(write({ action: 'plan', id: rid, servings: 2, day, leftovers: true }));
      await assert.rejects(mutate(0, { action: 'removePrep', id: pId }));
      assert.equal((await state()).preps.length, 1);
      await write({ action: 'prep', id: pId, day, servings: 4, session: null });
      assert.equal(needs(await state(), day).rows[0].buy, 300);
    });
    await t.test('placard, liste manuelle et synchronisation hors ligne', async () => {
      await write({ action: 'stock', data: { id: uid(), name: 'Chou', quantity: 100, unit: 'g' } });
      await write({
        action: 'item',
        data: {
          id: uid(),
          key: 'manuel:eau',
          week: day,
          name: 'Eau',
          unit: 'l',
          quantity: 1,
          manual: true,
          checked: false,
          bag: 'Épicerie',
          category: 'Épicerie',
        },
      });
      const cart = needs(await state(), day);
      const row = cart.rows.find((r) => r.name === 'Chou')!;
      assert.equal(row.buy, 200);
      const e = {
        week: day,
        key: row.key,
        quantity: row.buy,
        unknown: false,
        checked: true,
        before: false,
      };
      await syncChecks([e]);
      await syncChecks([e]);
      await assert.rejects(syncChecks([{ ...e, quantity: 999 }]));
      assert.equal(needs(await state(), day).rows.find((r) => r.name === 'Chou')?.checked, true);
    });
    await t.test(
      'un rayon personnalisé survit aux préférences et les variantes du nom réutilisent le même rayon',
      async () => {
        const article = {
          id: uid(),
          week: day,
          key: 'manuel:papier',
          name: 'Papier quadrillé',
          quantity: 1,
          unit: 'paquet',
          manual: true,
          checked: false,
          bag: null,
        };
        await write({ action: 'item', data: { ...article, category: 'Papeterie privée' } });
        await write({
          action: 'item',
          data: {
            ...article,
            id: uid(),
            key: 'manuel:crayon',
            name: 'Crayon',
            category: ' papeterie   privee ',
          },
        });
        const prefs = (await state()).prefs;
        await write({ action: 'prefs', data: { ...prefs, customAisles: [] } });
        const s = await state();
        assert.deepEqual(s.prefs.customAisles, ['Papeterie privée']);
        assert.equal(s.items.find((i) => i.name === 'Crayon')?.category, 'Papeterie privée');
      },
    );
    await t.test('session, étapes, consommation et duplication de semaine', async () => {
      ss = uid();
      await write({ action: 'batchPlan', id: ss, day, name: 'Session', preps: [pId] });
      await write({ action: 'tick', id: pId, index: 0, checked: true });
      await write({ action: 'finish', id: pId, done: true });
      const s = await state();
      await write({ action: 'meal', data: { ...s.meals[0], consumed: true } });
      await write({ action: 'duplicateWeek', week: day, to: addDays(day, 7) });
      assert.equal((await state()).preps.length, 2);
      assert.ok(!(await state()).preps.find((p) => p.day === addDays(day, 7))!.done);
      await assert.rejects(write({ action: 'duplicateWeek', week: day, to: addDays(day, 7) }));
    });
    await t.test('archiver, restaurer puis supprimer une fiche indépendante', async () => {
      const id = (await write({ action: 'recipe', data: r })).id!;
      await write({ action: 'archive', id, archived: true });
      await write({ action: 'archive', id, archived: false });
      await write({ action: 'archive', id, archived: true });
      await write({ action: 'deleteRecipe', id, confirm: true });
      assert.ok(!(await state()).recipes.some((v) => v.id === id));
    });
    await t.test('import Markdown/CSV et préservation des corrections', async () => {
      const folder = process.env.MEDIA_DIR!,
        zip = join(folder, 'test.zip');
      execFileSync('python3', [
        '-c',
        "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w');z.writestr('Recettes/Salade 0123456789abcdef0123456789abcdef.md','# Salade\\nPortions : 2\\n## Ingrédients\\n- 120 g de riz\\n## Préparation\\n### Étape 1\\nCuire.');z.writestr('Recettes.csv','Nom\\nSalade\\nAutre plat\\n');z.close()",
        zip,
      ]);
      const parsed = await archivePages(readFileSync(zip));
      assert.equal(parsed.length, 2);
      assert.equal(parsed[0].data.base, 2);
      const preview = await importBatch(parsed, false);
      assert.equal(preview.added, 1);
      assert.equal(preview.withheld, 1);
      await importBatch(parsed, true);
      const target = (await state()).recipes.find((r) => r.sourceKey === parsed[0].sourceKey)!;
      await write({
        action: 'recipe',
        id: target.id,
        data: { ...target.data, notes: 'Correction locale' },
      });
      const replay = await importBatch(parsed, true);
      assert.equal(replay.skipped, 1);
      assert.equal(replay.withheld, 1);
      assert(!(await state()).recipes.some((r) => r.data.title === 'Autre plat'));
      assert.equal(
        (await state()).recipes.find((r) => r.id === target.id)?.data.notes,
        'Correction locale',
      );
    });
    await t.test(
      'batch de deux recettes, pesée partagée et conservation de l’ordre interne',
      async () => {
        const recipeId = (
          await write({
            action: 'recipe',
            data: { ...r, steps: [...r.steps, { text: 'Cuire.', image: '' }] },
          })
        ).id!;
        await write({
          action: 'plan',
          id: recipeId,
          day: addDays(day, 2),
          servings: 2,
          leftovers: true,
        });
        const newer = (await state()).preps.find((p) => p.recipeId === recipeId)!;
        await write({
          action: 'batchPlan',
          id: ss,
          day,
          name: 'Deux plats',
          preps: [pId, newer.id],
        });
        const s = await state();
        const both = s.preps.filter((p) => p.session === ss);
        const measures = commonMeasures(both);
        assert.equal(measures[0].total, 450);
        const g = s.sessions.find((g) => g.id === ss)!;
        const tasks = sessionTasks(s, ss);
        assert.equal(tasks.length, 3);
        await write({
          action: 'session',
          data: { ...g, order: tasks.map((t) => t.key), weighed: [measures[0].key] },
        });
        await assert.rejects(
          write({ action: 'session', data: { ...g, order: [newer.id + ':1', newer.id + ':0'] } }),
        );
      },
    );
    await t.test('photo réellement réencodée, persistée et incluse à l’export', async () => {
      const source = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#527343' },
      })
        .png()
        .toBuffer();
      const url = await storePhoto(source);
      assert.equal(await storePhoto(source), url);
      await write({ action: 'recipe', data: { ...r, image: url } });
      const a = await backup();
      assert.equal(a.media.length, 1);
      assert.equal(
        (await sharp(Buffer.from(a.media[0].bytes, 'base64')).metadata()).format,
        'webp',
      );
    });
    await t.test(
      'emballages, réordonnancement atomique et rejeu sur des créneaux occupés',
      async () => {
        const week = addDays(day, 140);
        const late = addDays(week, 4);
        const rice = (
          await write({
            action: 'recipe',
            data: { ...r, title: 'Riz nature', ingredients: [parseLine('Riz | 150 | g')] },
          })
        ).id!;
        await write({ action: 'plan', id: rice, day: week, servings: 2, leftovers: true });
        await write({ action: 'plan', id: rid, day: late, servings: 2, leftovers: true });
        const lot = {
          id: uid(),
          week,
          barcode: '',
          product: 'Chou frais',
          name: 'Chou',
          quantity: 150,
          unit: 'g',
          expires: week,
          dateKind: 'DLC' as const,
        };
        await write({ action: 'purchaseLot', data: lot });
        await write({ action: 'purchaseLot', data: lot });
        assert.equal((await state()).lots.length, 1);
        assert.equal(needs(await state(), week).rows.find((x) => x.name === 'Chou')?.checked, true);
        const before = (await state()).meals.map((m) => m.id).sort();
        const { checkout } = await write({ action: 'finishShopping', week });
        assert.ok(checkout?.moves.some((m) => m.from === late && m.to === week));
        const after = await state();
        const p = after.preps.find((p) => p.day === week && p.recipeId === rid)!;
        assert.ok(
          after.meals.some(
            (m) => m.prepId === p.id && m.day === addDays(week, 1) && m.slot === 'midi',
          ),
        );
        assert.deepEqual(after.meals.map((m) => m.id).sort(), before);
        assert.deepEqual((await write({ action: 'finishShopping', week })).checkout?.moves, []);
      },
    );
    await t.test(
      'restaurer un carnet chez un autre utilisateur conserve ses liens et isole les éditions',
      async () => {
        const a = await backup();
        assert.equal(a.format, 'mijo/1');
        await assert.rejects(restore(a), /carnet vide/);
        const other = uid();
        await db().begin(async (tx) => {
          await tx`insert into accounts(id) values(${other})`;
          await tx`insert into preferences(account_id,id,data) values(${other},1,'{}')`;
        });
        const b = await withAccount(other, async () => {
          await restore({ ...a, format: 'table-de-saison/1' });
          const copy = await backup();
          await write({
            action: 'recipe',
            id: rid,
            data: { ...r, title: 'Édition dans le second carnet' },
          });
          return copy;
        });
        const [first, second] = await Promise.all([state(), withAccount(other, state)]);
        assert.equal(first.revision, a.state.revision);
        assert.deepEqual(first.recipes, a.state.recipes);
        assert.equal(
          second.recipes.find((recipe) => recipe.id === rid)?.data.title,
          'Édition dans le second carnet',
        );
        assert.equal(b.state.recipes.length, a.state.recipes.length);
        assert.deepEqual(b.state.meals, a.state.meals);
        assert.deepEqual(b.state.prefs.customAisles, a.state.prefs.customAisles);
        assert.deepEqual(b.state.items, a.state.items);
        assert.deepEqual(b.state.lots, a.state.lots);
        assert.deepEqual(b.state.preps, a.state.preps);
        assert.equal(b.versions.length, a.versions.length);
      },
    );
    await t.test('planification explicite, échange et retrait permanent', async () => {
      const w = addDays(day, 70);
      assert.ok(!(await state()).meals.some((m) => m.day === w));
      await write({ action: 'fillWeek', week: w });
      const rows = (await state()).meals.filter((m) => m.day >= w && m.day < addDays(w, 7));
      assert.ok(rows.length >= 2);
      const [a, b] = rows;
      await write({ action: 'moveMeal', id: a.id, day: b.day, slot: b.slot });
      const moved = (await state()).meals;
      assert.equal(moved.find((m) => m.id === b.id)?.day, a.day);
      assert.equal(moved.find((m) => m.id === b.id)?.slot, a.slot);
      assert.equal(moved.find((m) => m.id === a.id)?.slot, b.slot);
      await write({ action: 'removeMeal', id: a.id });
      assert.ok(!(await state()).meals.some((m) => m.day === b.day && m.slot === b.slot));
    });
    await t.test(
      'optimiser une semaine remplie conserve les créneaux et les choix manuels',
      async () => {
        const w = addDays(day, 91),
          diet = 'Régime de la semaine de test';
        const prefs = (await state()).prefs;
        await write({ action: 'prefs', data: { ...prefs, diet, target: 2, leftovers: false } });
        const create = async (title: string, raw: string) =>
          (
            await write({
              action: 'recipe',
              data: { ...r, title, diet, ingredients: [parseLine(raw)] },
            })
          ).id!;
        const carrot = await create('Carottes rôties', 'Carotte | 2 | pièce');
        const potato = await create('Purée de pommes de terre', 'Pommes de terre | 2 | pièce');
        await write({
          action: 'plan',
          id: carrot,
          day: w,
          servings: 1,
          leftovers: false,
          slot: 'soir',
        });
        await write({ action: 'fillWeek', week: w });
        const before = await state();
        const linked = before.preps.find((p) => p.day === addDays(w, 1) && p.recipeId === potato)!;
        assert.ok(linked?.automatic);
        const tart = await create('Tarte aux carottes', 'Carottes | 2 | pièce');
        await assert.rejects(
          write({ action: 'fillWeek', week: w, optimize: true, previewRevision: before.revision }),
          /planning a changé/,
        );
        await write({
          action: 'fillWeek',
          week: w,
          optimize: true,
          previewRevision: (await state()).revision,
        });
        const after = await state();
        assert.deepEqual(after.meals, before.meals);
        assert.equal(after.preps.find((p) => p.id === linked.id)?.recipeId, tart);
        assert.equal(after.preps.find((p) => p.day === w)?.recipeId, carrot);
        const m = after.meals.find((m) => m.prepId === linked.id)!;
        await write({ action: 'moveMeal', id: m.id, day: addDays(w, 2), slot: 'soir' });
        assert.equal((await state()).preps.find((p) => p.id === linked.id)?.automatic, false);
      },
    );
    await t.test(
      'renouveler une semaine pleine, appliquer la prévisualisation puis la vider sans toucher aux semaines voisines',
      async () => {
        const w = addDays(day, 182);
        const recipes: string[] = [];
        const diet = 'Menu variante de test';
        await write({
          action: 'prefs',
          data: { ...(await state()).prefs, diet, target: 7, portions: 2 },
        });
        for (let i = 0; i < 16; i++) {
          recipes.push(
            (
              await write({
                action: 'recipe',
                data: { ...r, url: '', title: 'Menu du test ' + i, diet },
              })
            ).id!,
          );
        }
        for (let i = 0; i < 7; i++)
          await write({
            action: 'plan',
            day: addDays(w, i),
            slot: 'soir',
            id: recipes[i],
            servings: 2,
            leftovers: true,
          });
        await write({ action: 'fillWeek', week: w });
        const before = await state();
        const variation = { seed: uid(), avoid: [] };
        const preview = weekPlan(before, w, today(), true, variation);
        assert.ok(preview.rows.length >= 7);
        const revised = {
          seed: uid(),
          avoid: [...new Set(preview.rows.map((row) => row.prep.recipeId))],
        };
        const next = weekPlan(before, w, today(), true, revised);
        assert.notDeepEqual(
          next.rows.map((row) => row.prep.recipeId),
          preview.rows.map((row) => row.prep.recipeId),
        );
        await write({
          action: 'fillWeek',
          week: w,
          optimize: true,
          variation: revised,
          previewRevision: before.revision,
        });
        const after = await state();
        for (const row of next.rows)
          assert.equal(
            after.preps.find(
              (p) =>
                p.id ===
                after.meals.find((m) => m.day === row.meal.day && m.slot === row.meal.slot)?.prepId,
            )?.recipeId,
            row.prep.recipeId,
          );
        const ahead = after.meals.filter((m) => m.day === addDays(w, 7));
        assert.ok(ahead.length > 0);
        await assert.rejects(
          write({ action: 'clearWeek', week: w, previewRevision: before.revision }),
        );
        await write({ action: 'clearWeek', week: w, previewRevision: after.revision });
        const cleared = await state();
        assert.ok(!cleared.meals.some((m) => m.day >= w && m.day < addDays(w, 7)));
        assert.ok(!cleared.preps.some((p) => p.day >= w && p.day < addDays(w, 7)));
        assert.ok(ahead.every(m => !cleared.meals.some(kept => kept.id === m.id)));
        assert.ok(!cleared.preps.some(p => p.id === ahead[0].prepId));
      },
    );
  } finally {
    await db().end();
  }
}
