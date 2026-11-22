# Table de saison

Carnet de cuisine privé en français. L’application conserve les recettes et leurs versions dans PostgreSQL. Une préparation alimente les courses une seule fois, même si plusieurs repas utilisent ses portions. Les écritures utilisent des transactions et une révision pour détecter les conflits entre appareils.

## Ouvrir le carnet local

Sur le Mac de développement, l’adresse est **http://localhost:3180**. Le premier mot de passe créé par le script local se trouve dans `data/private/mot-de-passe.txt`. Les données personnelles, les exports Notion, les sauvegardes et les secrets sont exclus du dépôt et de l’image.

### Installer sur un nouveau poste

Prérequis : Docker avec Compose v2, Node.js 22 et npm. Les commandes suivantes s’exécutent à la racine du dépôt.

```sh
npm ci
node scripts/setup.mjs
docker compose up -d db
docker compose build app
docker compose run --rm app node scripts/migrate.mjs
docker compose up -d app
curl --fail http://localhost:3180/api/health
```

La base démarre vide. Les volumes nommés appartiennent au projet Compose `table-de-saison`. La configuration standard publie uniquement le site sur la boucle locale. Le déploiement de l’application et l’application des migrations sont deux opérations explicites.

### Développer

```sh
docker compose stop app
docker compose -f compose.yaml -f compose.dev.yaml up -d db
npm run migrate
npm run dev
```

Le fichier de développement rend PostgreSQL accessible à Node sur `127.0.0.1:55439`. Pour tester le build standalone hors de Docker, utiliser `npm run build`, puis `npm start` après arrêt de l’autre serveur sur le même port. En production, utiliser une URL HTTPS publique exacte dans `APP_ORIGIN`.

## Utiliser l’application

1. **Recettes** accepte une saisie complète, des photos et un lien externe à vérifier. Les ingrédients ont un nom, une quantité, une unité, un libellé source et un rayon. Ouvrir une fiche pour l’éditer, la dupliquer, l’archiver ou la restaurer. La suppression définitive est réservée aux archives sans préparation associée.
2. **Ma semaine** prépare les dîners à la première ouverture, selon l’objectif de repas, les favoris et les semaines précédentes. Les restes peuvent réserver le déjeuner suivant. Glisser un repas pour le déplacer ou échanger deux créneaux. La poignée permet aussi de choisir une destination au clavier. La croix retire le repas, et « Compléter la semaine » propose de nouveau des dîners sur les places libres.
3. **Courses** regroupe les variantes d’un ingrédient, déduit le stock compatible et estime le montant des formats courants à acheter au prix médian observé pour chacun. « Déjà chez moi » couvre un ingrédient pour la semaine affichée. Le panier indique aussi la valeur des quantités prévues, y compris les produits disponibles au placard. La livraison facultative utilise les barèmes publiés, avec leur minimum de commande. Les cases et la copie hors ligne suivent la semaine.
   Dans **Petit-déjeuner**, régler les quantités par bol et la taille des emballages, puis relever le stock en pots, briques ou quantités restantes. Le relevé remplace le précédent pour chaque produit renseigné. Les prévisions déduisent les matins écoulés et les recettes partagées. Pour le panier, les paquets entiers sont arrondis après regroupement des besoins. Les achats proposés entrent dans le stock lors du relevé suivant.
4. **Batch cooking**, dans Ma semaine, regroupe les préparations dans une ou plusieurs sessions. **Cuisiner** présente les pesées partagées, leur répartition, les étapes de chaque plat, les équipements renseignés, les dates des repas et les alertes de conservation. Le réordonnancement garde la succession des étapes d’une recette. Terminer une préparation rend ses portions disponibles. La case « Repas consommé » se trouve sur le créneau du repas.
5. **Paramètres** conserve les portions, les préférences alimentaires, l’objectif hebdomadaire, le budget et le montant de référence HelloFresh.
6. Sur un appareil personnel, **Emporter hors ligne** enregistre la liste sélectionnée et ouvre une page utilisable sans réseau. Les coches reviennent au serveur à la reconnexion ou sur demande, après authentification. Si le besoin a changé, la synchronisation signale le conflit et garde la copie pour comparaison. La déconnexion efface la copie sur cet appareil. L’installation PWA et le verrouillage d’écran dépendent du navigateur et de HTTPS ou de localhost.

## Importer les recettes

L’importeur Notion accepte trois entrées. Le mode par défaut prévisualise. Ajouter `--apply` pour écrire. Les identifiants de page servent de clés d’import. Un rejeu ignore les fiches existantes et respecte les corrections locales. Les nouvelles fiches doivent fournir ingrédients, étapes et portions pour entrer dans le carnet. Le rapport sous `data/private/import/` indique les fiches écartées.

```sh
npm run import:notion -- data/private/import/notion.json
npm run import:notion -- data/private/import/notion.json --apply
npm run import:notion -- /chemin/export-notion.zip
npm run import:notion -- /chemin/export-notion.zip --apply
```

Les deux premières commandes exploitent la copie privée de la source de données **5d63f744-aa67-822c-8ab1-8761427eeca5** déjà récupérée avec le connecteur Notion. Le JSON a une liste `pages` dont chaque objet contient `id`, `title`, `content` Markdown et, si disponibles, `url`, `cover`, `rating` et `truncated`. Pour interroger directement l’API, configurer `NOTION_TOKEN` dans l’environnement du script et omettre le chemin. Le script pagine la collection et les blocs enfants. Il ne modifie jamais la source. Les erreurs par page sont inscrites dans le rapport. Lorsqu’une nouvelle fiche est incomplète, l’import vérifie les correspondances déjà établies, puis la page officielle identifiable par son lien ou ses illustrations. Le carnet reste autonome après cette opération.

L’interface Paramètres permet aussi la prévisualisation d’une archive Markdown/CSV et l’import de ses sous-pages. Les fichiers importés sont bornés en nombre et en taille. Les photos référencées dans l’archive sont converties en WebP dans le volume média. Pour les URL de recettes, la lecture vérifie les adresses réseau, chaque redirection, les règles robots, la taille et le délai. Les données JSON-LD Recipe passent par un formulaire de correction. Le formulaire indique quand une source incomplète empêche l’ajout. La saisie personnelle reste disponible dans Recettes. Les textes et photos tiers conservent leur provenance et leurs droits.

### Comparer la bibliothèque existante à HelloFresh

Le rapprochement du 22 novembre couvre 149 fiches. Pour renouveler cette comparaison à partir d’un export Notion, exécuter les commandes depuis le projet local.

```sh
python3 scripts/find-hellofresh.py data/private/import/notion.json
node --import tsx scripts/reconcile-hellofresh.ts
./scripts/backup-local.sh
node --import tsx scripts/reconcile-hellofresh.ts --apply
```

Le premier script conserve les sources publiques consultées et les preuves de correspondance dans `data/private/reconciliation/`. Les URL retrouvées manuellement peuvent être indiquées par titre dans `candidats.json` dans ce dossier. La simulation montre les changements prévus. L’application de la réparation conserve les originaux Notion, les versions antérieures et les modifications personnelles. Elle actualise les préparations à venir encore intactes lorsqu’elles contiennent une fiche incomplète.

## Premiers essais des sources externes, le 22 novembre 2026

L’essai `node --import tsx scripts/check-sources.ts` a lu un exemple public par éditeur. Les nombres ci-dessous décrivent les documents JSON-LD du premier essai. L’extracteur HelloFresh utilise désormais le tableau des quantités par portion et les étapes illustrées de l’éditeur. Les unités d’origine et les données manquantes restent à vérifier lors de l’import.

| Source | Ingrédients | Instructions extraites | Portions |
|---|---:|---:|---:|
| HelloFresh France, spaghetti lardons et poireau | 8 | 13 | 2 |
| Marmiton, gratin dauphinois | 8 | 7 | 6 |
| 750g, gratin dauphinois classique | 11 | 3 | 4 |
| CuisineAZ, crêpes faciles | 6 | 3 | 6 |
| Jow, gratin dauphinois | 5 | 6 | 2 |

Les liens testés sont dans le script. La bibliothèque Python recipe-scrapers couvre les sites étudiés. L’extraction TypeScript utilisée ici a permis de garder un seul runtime. TheMealDB propose un catalogue complémentaire anglophone. Spoonacular demande une clé et applique des quotas. Ces deux services restent des pistes complémentaires. [recipe-scrapers](https://docs.recipe-scrapers.com/) · [TheMealDB](https://www.themealdb.com/api.php) · [Spoonacular](https://spoonacular.com/food-api)

Les références de prix proviennent des observations françaises en euros hors promotions des douze derniers mois disponibles. Pour actualiser le catalogue embarqué, exécuter `python scripts/refresh-market.py` avec DuckDB installé, puis reconstruire l’application. Le script accepte aussi le chemin de l’export Parquet officiel. Le catalogue conserve l’effectif, la date et un identifiant de relevé par catégorie. Les poids des pièces et petites portions de recette servent à estimer les achats. [Open Prices, Open Food Facts · ODbL](https://huggingface.co/datasets/openfoodfacts/open-prices)

Le mode cuisine suit la recommandation de réfrigérer les plats maison dans les deux heures et de les consommer dans les trois jours. Comme le planning enregistre des jours, l’alerte commence à J+3 par prudence. Les préparations qui exigent une conservation plus courte demandent une appréciation spécifique. [Anses](https://www.anses.fr/fr/actualite/eviter-toxi-infections-alimentaires-confinement-bonnes-pratiques)

## Tests et structure

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:e2e
```

Les essais d’intégration et Playwright créent puis suppriment leur propre base temporaire sur PostgreSQL local. Ils nécessitent le fichier Compose de développement, un compte local habilité à créer des bases, Python 3 pour fabriquer les archives de test, et Google Chrome pour le parcours navigateur. `PLAYWRIGHT_CHROME_CHANNEL=chromium` permet d’utiliser Chromium installé par Playwright. Les prix, recettes et comptes de test restent hors du catalogue personnel.

- `app/` contient les routes App Router, le rendu serveur et les endpoints privés.
- `components/` porte les écrans français et les commandes utilisateur.
- `lib/` regroupe modèles Zod, accès SQL typé avec postgres.js, transactions, imports, calendrier, sessions, courses, sécurité et sauvegardes.
- `db/migrations/` versionne le schéma PostgreSQL. Les clés étrangères lient recettes, versions, préparations, sessions et repas. Les documents JSONB portent les ingrédients et les étapes. Chaque préparation conserve la version de recette utilisée.
- `scripts/`, `tests/` et `e2e/` contiennent la configuration locale, la migration, les sauvegardes et leurs contrôles.

Voir [la procédure de déploiement et de restauration](DOKPLOY.md) et [le suivi des validations](progress.md). La photographie générique de l’écran privé provient d’[Unsplash](https://images.unsplash.com/photo-1498837167922-ddd27525d352). Les photos de plats du catalogue proviennent des fiches importées.
