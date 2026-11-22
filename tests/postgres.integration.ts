import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { state, db } from '../lib/db';
import { ensureWeek, mutate, type Command } from '../lib/commands';
import { blankRecipe } from '../lib/model';
import { parseLine } from '../lib/ingredients';
import { addDays, today, monday } from '../lib/dates';
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
    await t.test('restauration JSON sur une base vide de test avec versions et liens', async () => {
      const a = await backup();
      await assert.rejects(restore(a));
      const sql = db();
      await sql.begin(async (tx) => {
        for (const tab of [
          'meals',
          'preps',
          'sessions',
          'recipe_versions',
          'recipes',
          'items',
          'stock',
          'prices',
          'week_history',
        ])
          await tx`delete from ${tx(tab)}`;
        await tx`update preferences set revision=0,data='{}'`;
      });
      await restore(a);
      const b = await backup();
      assert.equal(b.state.recipes.length, a.state.recipes.length);
      assert.deepEqual(b.state.meals, a.state.meals);
      assert.deepEqual(b.state.prefs.customAisles, a.state.prefs.customAisles);
      assert.deepEqual(b.state.items, a.state.items);
      assert.deepEqual(b.state.preps, a.state.preps);
      assert.equal(b.versions.length, a.versions.length);
    });
    await t.test('semaine automatique concurrente, échange et retrait permanent', async () => {
      const w = addDays(day, 70);
      const result = await Promise.all([ensureWeek(w), ensureWeek(w)]);
      assert.equal(result.filter((r) => r.changed).length, 1);
      const rows = (await state()).meals.filter((m) => m.day >= w && m.day < addDays(w, 7));
      assert.ok(rows.length >= 2);
      const [a, b] = rows;
      await write({ action: 'moveMeal', id: a.id, day: b.day, slot: b.slot });
      const moved = (await state()).meals;
      assert.equal(moved.find((m) => m.id === b.id)?.day, a.day);
      assert.equal(moved.find((m) => m.id === b.id)?.slot, a.slot);
      assert.equal(moved.find((m) => m.id === a.id)?.slot, b.slot);
      await write({ action: 'removeMeal', id: a.id });
      assert.equal((await ensureWeek(w)).changed, false);
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
        await ensureWeek(w);
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
  } finally {
    await db().end();
  }
});
