# Déployer Mijo sur Dokploy

## Production

Le projet **Mijo**, environnement **production**, contient le service Compose **Mijo** et un service **PostgreSQL** dédié. Le fournisseur GitHub de Dokploy suit la branche `master` de `ArnaudGct/mijo`, en mode **On Push**, avec le chemin `./compose.dokploy.yaml`. Chaque push reconstruit l’application depuis le Dockerfile du dépôt. Le démarrage applique les migrations SQL en transaction avant de lancer Next.js.

Cloudflare termine le HTTPS de `mijo.arnaudgct.fr`. Le fichier Compose déclare la route HTTP interne sur l’entrée Traefik `web` et le port de conteneur 3000. Le réseau externe `dokploy-network` relie le service à Traefik et à PostgreSQL. Le champ **External Port** de la base reste vide.

Le fichier privé `/etc/dokploy/mijo-private/app.env` du serveur, lisible uniquement par root, fournit `DATABASE_URL` et `APP_PASSWORD_HASH`. Les médias résident dans le volume Docker externe `mijo-production-media`, accessible en écriture à l’UID 1000. Pour recréer l’environnement sur un autre serveur, provisionner la base, le fichier privé et ce volume avant le déploiement.

L’import initial utilise le dump PostgreSQL et l’archive des médias du Mac. Les sessions de connexion sont renouvelées. Après cet import, la production garde ses propres données et le Mac sa base de test. Pour valider un déploiement, vérifier `/api/health`, la réponse 401 de `/api/state` sans connexion et l’ouverture du carnet après connexion.

## Sauvegardes automatiques à mettre en place

Dans **Database → Backups**, sélectionner une destination externe S3 compatible contrôlée par Arnaud. Planifier un dump quotidien, par exemple `0 2 * * *`, en vérifiant le fuseau horaire affiché par Dokploy. Préparer une rétention adaptée à l’espace disponible, par exemple 14 sauvegardes quotidiennes et 4 hebdomadaires si la destination le permet. Vérifier la première sauvegarde dans le stockage externe. Une destination et un calendrier réels nécessitent la configuration et l’accord de production.

Dans **Volume Backups**, sélectionner le volume média de cette application, la destination externe et un passage après la sauvegarde SQL. Les photos ont des noms immuables. Conserver ensemble le dump, l’archive du volume, la révision de l’image et la liste des migrations. La restauration doit être répétée dans un environnement séparé. Les cookies et sessions doivent être invalidés après une restauration opérationnelle.

## Exercice local et restauration indépendante

```sh
./scripts/backup-local.sh
./scripts/verify-backup.sh data/private/backups/HORODATAGE
```

Le premier script capture PostgreSQL au format custom avec `pg_dump -Fc`, archive les médias et calcule SHA-256. Le second vérifie les empreintes, la lisibilité du média et restaure réellement le dump dans une nouvelle base locale isolée, contrôle les compteurs puis supprime cette base d’essai. L’export JSON complet peut être réimporté depuis **Paramètres**. La limite du formulaire JSON est de 64 Mio. Au-delà, utiliser le couple dump/volume.

Sur Dokploy, créer une **nouvelle** instance PostgreSQL compatible et un **nouveau** volume, restaurer le dump via la fonction **Restore** du service ou avec `pg_restore --exit-on-error --single-transaction --no-owner` sur la base vide. Restaurer l’archive de médias dans le nouveau volume. Faire pointer une application de recette privée vers ces copies. Vérifier recettes, versions, repas, prix, quantités et quelques photos locales. Après validation et accord, basculer le domaine ou la connexion. Conserver les volumes précédents pendant la période de contrôle.

## Mise à jour et retour arrière

Avant chaque mise à jour, conserver le digest de l’image en place, la configuration, un dump PostgreSQL et une archive du volume. Lire les nouvelles migrations, les essayer sur une copie restaurée, puis pousser la version validée sur `master`. Vérifier santé et parcours authentifié. Pour revenir en arrière si le schéma reste compatible, redéployer l’image précédente avec les mêmes volumes. Sinon restaurer le couple base/médias dans des services séparés, contrôler ces copies puis basculer vers elles. Une restauration en place écraserait les modifications postérieures à la sauvegarde.

Documentation officielle consultée pour le build, le réseau de base, les sauvegardes et le mode de déploiement. [Build Dokploy](https://docs.dokploy.com/docs/core/applications/build-type) · [Bases Dokploy](https://docs.dokploy.com/docs/core/databases) · [Sauvegardes](https://docs.dokploy.com/docs/core/databases/backups) · [Next.js en auto-hébergement](https://nextjs.org/docs/app/getting-started/deploying)
