# État de livraison du 22 novembre 2026

## Instance locale

Mijo est accessible sur `http://localhost:3180` par le conteneur applicatif. Le catalogue et les préférences résident dans un volume PostgreSQL 17.12 dédié. Le premier accès est dans `data/private/mot-de-passe.txt`, lisible uniquement par le compte local. L’instance Mac n’est publiée sur aucun domaine. Les six rubriques, l’éditeur, le planificateur, les sessions et la liste hors ligne font partie de l’application livrée.

## Migration réelle

- Source Notion interrogée en lecture seule le 22 novembre. 149 pages distinctes récupérées sur deux pages de résultats. Copie source privée dans `data/private/import/notion.json`.
- Sauvegarde avant import, prévisualisation, 149 insertions dans une base vide. Rejeu réel en mode écriture, 149 ignorées et zéro insertion.
- 82 fiches avec ingrédients, 123 avec instructions et 143 avec couverture. Les quantités de référence disponibles ne précisent jamais leur nombre de portions. Les sources contiennent parfois des conditionnements ou des quantités libres. Aucune URL originale HelloFresh exploitable dans les corps récupérés pour enrichir ces lacunes par correspondance exacte.
- Deux fiches (Crêpes et Cannelés Bordelais) utilisent des listes numérotées. Le découpage en étapes a été corrigé avec conservation des premières versions. Après le premier import, le catalogue comptait 149 recettes et 151 versions. Les essais de menus et de prix ont été effectués dans des bases jetables.
- Le planning hebdomadaire commence vide. Le planificateur Notion historique et ses synchronisations existantes sont restés en place.

## Vérifications effectuées

| Vérification | Résultat |
|---|---|
| TypeScript strict, contrôle des imports inutilisés et ESLint | Réussis |
| Tests métier | 11 réussis, dont fractions, conversions, restes du dîner, conservation, conditionnements, stock, coût consommé, sacs et pesées communes |
| PostgreSQL réel | 9 scénarios réussis, y compris transactions, conflits, versions, import Markdown/CSV, rejeu, session de deux recettes, export et restauration avec photo WebP |
| Playwright dans Chrome | 3 parcours réussis, dont l’application privée, la création et la correction d’une fiche, les archives, les repas, la cuisine, le prix en caisse et l’affectation au troisième sac |
| Consultation hors connexion | Page rechargée hors réseau, coche persistée sur le téléphone simulé puis retrouvée sur le serveur après reconnexion |
| Affichage | Accueil examiné à 1440 × 980 et 390 × 844. Six rubriques contrôlées pour le débordement horizontal sur le format téléphone |
| Extractions publiques | Un exemple réellement lu sur chacun des cinq éditeurs, avec nombre d’ingrédients, étapes et portions dans le README |
| Open Prices | Six lieux rochelais retournés. Recherche par code-barres réelle avec deux prix datés et conditionnement déclaré |
| Production locale | Build Next standalone et image Docker sur architecture ARM64 réussis. PostgreSQL et application sains. Recréation des conteneurs, 149 recettes conservées |
| Sauvegardes | Export personnel JSON testé sur base jetable, dump PostgreSQL réel restauré sur une autre base de test et archive de médias contrôlée |

Les fixtures E2E d’import par URL isolent le formulaire de prévisualisation des indisponibilités réseau. Le test réseau séparé utilise réellement les sites. Les captures du carnet personnel et les sauvegardes restent dans `data/private/`, à l’écart du dépôt.

## Reprise

Les portions de référence des fiches HelloFresh rapprochées sont désormais renseignées. Les crêpes et les cannelés personnels conservent les quantités de leur recette familiale et leur rendement inconnu. Renseigner les capacités des sacs, les conditions de livraison et la taille réelle de la référence HelloFresh. L’application conserve les inconnues et la part de panier chiffrée.

Les sessions proposent des pesées partagées vérifiables et un ordre initial de préparation modifiable. Les temps séquentiels dépendent des métadonnées. Les tâches de cuisson restent distinctes. Le gain de temps réel demande une mesure. Les prix distributeurs sont des relevés datés et la disponibilité finale dépend du magasin.

Pour l’ouverture sur les autres appareils, le serveur Dokploy a été inspecté en lecture seule. Le prochain changement de production est la création des **deux nouveaux services dédiés**, après accord sur le domaine HTTPS et la destination des sauvegardes externes. Suivre `DOKPLOY.md`, transférer l’export privé vers la base neuve et vérifier le premier backup distant ainsi que la restauration de recette. L’image a été construite et démarrée sur le Mac. Son exécution sur le serveur x86-64 reste à valider à la mise en service.

## Révision du carnet le 22 novembre, après le premier import

- 149 fiches comparées aux pages publiques de HelloFresh France. Le carnet actif contient 145 recettes avec portions, ingrédients et étapes, plus les crêpes et les cannelés personnels. Deux variantes sont dans les archives. Les sources, les décisions par fiche et les originaux sont conservés localement.
- Les ingrédients des 145 fiches sont reliés à 332 identifiants HelloFresh. La variante de burrata au persil conserve les ingrédients et les étapes Notion. Ses quantités communes avec la fiche officielle correspondent à deux portions.
- La préparation de bavette du 23 fournit dix lignes de courses et six étapes. Son dîner du lundi et le déjeuner du mardi gardent chacun une portion. Une simulation après réparation ne trouve plus de modification à appliquer.
- Le menu latéral persiste entre les vues. Planifier ouvre un sélecteur avec photos et recherche. Les suggestions proposent six dîners pour cette semaine, et chaque préparation ou session peut être ouverte en cuisine. Les captures sur la base réelle restent dans `data/private/validation/`.
