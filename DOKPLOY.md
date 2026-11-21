# Déployer Table de saison sur Dokploy

L’inspection en lecture seule du 22 novembre 2026 a trouvé Dokploy 0.30.10 sur x86-64, Docker Swarm, le réseau overlay `dokploy-network`, 32 Gio de RAM et environ 135 Gio de disque libres au moment du contrôle. Ces chiffres doivent être revérifiés au déploiement. Le PostgreSQL de contrôle de Dokploy appartient à la plateforme. Créer un service PostgreSQL distinct pour le carnet.

## Préparer les services

1. Après accord de publication, créer un projet ou environnement dédié dans Dokploy. Créer une **Database → PostgreSQL**, nommer la base et le compte d’application, choisir PostgreSQL 17, puis générer un mot de passe fort. La version testée est PostgreSQL 17.12. Conserver le stockage persistant de cette base et laisser le champ **External Port** vide. Relever le nom d’hôte interne généré.
2. Créer une **Application** dans ce projet, lier le dépôt privé à la révision voulue, définir **Build Type → Dockerfile**, chemin `Dockerfile`, contexte `.`. Le Dockerfile verrouille l’image Node multiarchitecture par digest et utilise `npm ci`. Le serveur Next standalone écoute le port **3000**.
3. Ajouter un **volume nommé persistant** sur `/data/media`. Le conteneur tourne sous l’utilisateur `node` (UID 1000). Vérifier les droits d’écriture sur le volume du projet. Les photos référencées par URL restent distantes jusqu’à leur remplacement par un téléversement.
4. Configurer les secrets dans l’onglet **Environment** de l’application. `DATABASE_URL` est l’URI PostgreSQL interne avec le mot de passe percent-encodé si nécessaire. `APP_ORIGIN` est l’URL HTTPS publique exacte, sans barre finale. `MEDIA_DIR=/data/media`. `APP_PASSWORD_HASH` contient le sel et le condensat scrypt séparés par deux-points. Le fichier `.env.example` recense les noms. Le compte est unique et l’application ne propose aucune inscription.
5. Pour créer un nouveau secret d’accès sans le saisir dans une commande, exécuter `node scripts/credentials.mjs /chemin/prive/acces-table.json` sur le poste d’administration. Le fichier est créé en mode 0600 et refuse d’écraser un fichier existant. Transférer uniquement le champ `hash` dans le secret Dokploy. Conserver le champ `password` dans le gestionnaire de mots de passe. Les secrets de développement ne sont jamais intégrés à l’image.
6. Construire et lancer l’application **avant d’ajouter le domaine**. Ouvrir le terminal du nouveau service et exécuter **une fois par version** `node scripts/migrate.mjs`. Le processus de migration verrouille la base, compare les empreintes des migrations et applique les nouveaux fichiers SQL en transaction. Un démarrage ou redémarrage normal exécute uniquement `node server.js`. Avant la première migration, le healthcheck retourne 503. Pour une configuration Swarm qui redémarre avant l’ouverture du terminal, utiliser la commande temporaire `sh -c 'node scripts/migrate.mjs && exec node server.js'` pour cette première mise en service, puis rétablir la commande de l’image. Pour les mises à jour, lancer un conteneur ponctuel de la nouvelle image sur le même réseau privé avec la même configuration, après sauvegarde.
7. Ajouter le domaine au service applicatif via Dokploy, HTTPS activé, port de conteneur 3000. Vérifier que `GET /api/health` renvoie 200 et `{"ok":true}`, que `GET /api/state` sans session renvoie 401 et que la connexion donne accès au catalogue. Vérifier le certificat et le rendu sur téléphone. Garder les identifiants Notion uniquement sur le poste qui effectue une migration directe.
8. Pour transférer le catalogue du Mac, exporter dans **Paramètres → Télécharger mes données**, ouvrir la nouvelle application protégée, puis restaurer cet export **dans la base vide**. Le JSON contient les versions, les références entre identifiants, les préférences et les médias locaux encodés en base64. L’application refuse une restauration sur un carnet déjà utilisé. Une sauvegarde PostgreSQL et média indépendante convient aussi, selon la procédure ci-dessous. Vérifier ensuite le nombre de fiches, la persistance des photos après redéploiement et les cases hors connexion.

## Sauvegardes automatiques à mettre en place

Dans **Database → Backups**, sélectionner une destination externe S3 compatible contrôlée par Arnaud. Planifier un dump quotidien, par exemple `0 2 * * *`, en vérifiant le fuseau horaire affiché par Dokploy. Préparer une rétention adaptée à l’espace disponible, par exemple 14 sauvegardes quotidiennes et 4 hebdomadaires si la destination le permet. Déclencher un premier backup et vérifier sa présence dans le stockage externe avant ouverture. Une destination et un calendrier réels nécessitent la configuration et l’accord de production.

Dans **Volume Backups**, sélectionner le volume média de cette application, la destination externe et un passage après la sauvegarde SQL. Les photos ont des noms immuables. Conserver ensemble le dump, l’archive du volume, la révision de l’image et la liste des migrations. La restauration doit être répétée dans un environnement séparé. Les cookies et sessions doivent être invalidés après une restauration opérationnelle.

## Exercice local et restauration indépendante

```sh
./scripts/backup-local.sh
./scripts/verify-backup.sh data/private/backups/HORODATAGE
```

Le premier script capture PostgreSQL au format custom avec `pg_dump -Fc`, archive les médias et calcule SHA-256. Le second vérifie les empreintes, la lisibilité du média et restaure réellement le dump dans une nouvelle base locale isolée, contrôle les compteurs puis supprime cette base d’essai. L’export JSON complet peut être réimporté depuis **Paramètres**. La limite du formulaire JSON est de 64 Mio. Au-delà, utiliser le couple dump/volume.

Sur Dokploy, créer une **nouvelle** instance PostgreSQL compatible et un **nouveau** volume, restaurer le dump via la fonction **Restore** du service ou avec `pg_restore --exit-on-error --single-transaction --no-owner` sur la base vide. Restaurer l’archive de médias dans le nouveau volume. Faire pointer une application de recette privée vers ces copies. Vérifier recettes, versions, repas, prix, quantités et quelques photos locales. Après validation et accord, basculer le domaine ou la connexion. Conserver les volumes précédents pendant la période de contrôle.

## Mise à jour et retour arrière

Avant chaque mise à jour, conserver le digest de l’image en place, la configuration, un dump PostgreSQL et une archive du volume. Lire les nouvelles migrations, les essayer sur une copie restaurée, appliquer les migrations compatibles puis redéployer l’image. Vérifier santé et parcours authentifié. Pour revenir en arrière si le schéma reste compatible, redéployer l’image précédente avec les mêmes volumes. Sinon restaurer le couple base/médias dans des services séparés, contrôler ces copies puis basculer vers elles. Une restauration en place écraserait les modifications postérieures à la sauvegarde.

Documentation officielle consultée pour le build, le réseau de base, les sauvegardes et le mode de déploiement. [Build Dokploy](https://docs.dokploy.com/docs/core/applications/build-type) · [Bases Dokploy](https://docs.dokploy.com/docs/core/databases) · [Sauvegardes](https://docs.dokploy.com/docs/core/databases/backups) · [Next.js en auto-hébergement](https://nextjs.org/docs/app/getting-started/deploying)
