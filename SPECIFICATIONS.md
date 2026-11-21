# Gestion des courses — Spécifications (v1)

Date : 21/11/2026 — issu du questionnaire de cadrage.

## 1. Contexte

- Un seul foyer, 3 à 5 utilisateurs, une liste commune.
- Tout le monde peut tout modifier (liste type, rayons, listes).
- Plusieurs personnes peuvent faire les courses en même temps → synchronisation en temps réel.
- Un seul magasin : **Carrefour Arsenal, Rueil-Malmaison**. Un article est toujours dans le même rayon.

## 2. Choix techniques

| Sujet | Choix |
|---|---|
| Type d'application | PWA (application web installée depuis Safari sur iPhone) |
| Hébergement | GitHub Pages (compte GitHub existant) |
| Données partagées | Supabase (base Postgres + temps réel + stockage des photos), offre gratuite |
| Hors connexion | Souhaitable : la liste en cours reste consultable et cochable sans réseau, synchronisation au retour du réseau |
| Thème | Automatique (clair/sombre selon l'iPhone), texte de taille normale |
| Phase de maquette | Interface simulée dans un cadre iPhone, testée dans Claude, données locales |

## 3. Modèle de données

- **Univers** : Alimentaire, Entretien, Hygiène.
- **Rayon** : nom, univers, ordre de passage dans le magasin.
- **Article** (liste type) : nom, rayon, position dans le rayon, quantité habituelle, unité (kg, paquet, bouteille…), commentaire (y compris la marque si utile), photo. Pas de champ Marque séparé.
- **Liste** : nom, date de création, statut (en préparation / en cours / terminée), créée par.
- **Ligne de liste** : article (ou article ponctuel hors catalogue), quantité, unité, commentaire, cochée oui/non, cochée par qui.

L'univers d'un article est déduit de son rayon. Univers : Alimentaire, Entretien, Hygiène, **Animaux**.

Règles issues du fichier `data/source/liste course.xlsx` (catalogue généré : `data/catalogue.json`, 25 rayons, 81 articles) :
- **Priorité 1** : l'article est proposé directement à la préparation d'une liste. **Priorités 2 et 0** : l'article est accessible via un bouton « + » (afficher plus).
- **Position dans le rayon** : ordre des lignes de l'onglet Produit.
- **Exception de positionnement** : un nombre dans cette colonne indique l'ordre du rayon où l'article est physiquement rangé dans le Carrefour Arsenal. Exemple : Graines et Purée (rayon « Autres ») sont rangées avec le rayon n° 1 (Légumes).
- **Marque** : pas de champ dédié, elle s'écrit dans le commentaire (ex. « Andros X 12 »).

## 4. Fonctionnalités (phase 1)

1. **Liste type** : catalogue des articles classés par univers puis par rayon ; ajout, modification et suppression ; photo optionnelle.
2. **Listes** : plusieurs listes en parallèle (ex. « Semaine », « Grosses courses ») ; création vide, depuis la liste type ou **en dupliquant une liste de l'historique**.
3. **Préparation** : sélection rapide des articles (recherche, filtre par univers), quantité, ajout d'un article ponctuel.
   - Deux vues : « Catalogue » (on coche les articles, quantité ajustable par − / +, pas de 0,5 kg, 100 g ou 1) et « Ma liste » (seulement les articles choisis ; on touche un article pour changer sa quantité, son unité ou son commentaire pour cette liste).
   - Article ponctuel : créé depuis la recherche, avec son rayon ; au choix « juste pour cette fois » ou ajouté à la liste type en « sur demande ».
   - Actions sur une liste : renommer, dupliquer, terminer (rangée dans l'historique) ou remettre en cours, supprimer (avec confirmation).
   - Nouvelle liste : vide, ou copie d'une liste existante (en cours ou de l'historique). Une liste de l'historique a aussi un bouton « Réutiliser ».
4. **Mode magasin** : liste triée dans l'ordre de passage des rayons puis par position dans le rayon ; on coche les articles ; les coches sont visibles en direct par les autres personnes présentes.
   - Accès par « Faire les courses » depuis une liste, ou par l'onglet Magasin, où l'on choisit une ou plusieurs listes en cours (réunies dans l'ordre des rayons).
   - Barre de progression « X sur N dans le caddie », compteur par rayon et « ✓ fait » quand le rayon est fini ; option « Masquer pris ».
   - Bouton « pas trouvé » par article (article en rupture ou introuvable).
   - « Terminer les courses » : bilan (pris, pas trouvés, non pris), listes rangées dans l'historique, et report possible des articles restants dans une nouvelle liste « Reste des courses ».
   - L'écran reste allumé pendant les courses quand le téléphone le permet.
5. **Impression** : A4, **3 colonnes compactes**, regroupée par rayon dans l'ordre du magasin, avec cases à cocher, quantités et commentaires. Sortie par **AirPrint** et en **PDF** (via la feuille de partage d'iOS).
   - Accès par l'onglet **Imprimer** de la barre du bas (à côté de Magasin) : choix de la liste (en cours ou de l'historique), aperçu, puis « Imprimer ou enregistrer en PDF ». Le bouton « Imprimer » d'une liste mène au même écran.
   - En-tête : nom de la liste, magasin, nombre d'articles, date.
   - Regroupement par **département** (titre en capitales, filet épais) puis par rayon (sous-titre avec son numéro), dans l'ordre de passage.
   - Le **commentaire** de chaque article est toujours imprimé sur la même ligne que son nom (« Compote – Andros X 12 »).
   - Option : bloc « À ajouter » de 8 lignes vierges pour noter à la main.
6. **Historique** : listes terminées conservées et réutilisables.

## 4 bis. Partage entre les membres du foyer

- **Connexion** : e-mail puis code à 6 chiffres (Supabase Auth, sans mot de passe). Session conservée sur l'iPhone.
- **Foyer** : le premier membre crée le foyer (le catalogue y est versé automatiquement) ; les autres le rejoignent avec un **code d'invitation** de 6 caractères, visible dans Réglages.
- **Prénom** affiché pour « pris par … » (mode magasin) et « ajouté par … » (Ma liste).
- **Temps réel** : les modifications des autres apparaissent sans recharger (Supabase Realtime).
- **Hors connexion** : copie locale des données ; les modifications sont mises en file d'attente et envoyées au retour du réseau. En cas de conflit, la dernière modification d'une même ligne l'emporte.
- **Sécurité** : règles RLS, chacun ne voit que les données de son foyer.
- **Réglages** : prénom, e-mail, code d'invitation (copiable), membres, état de la synchronisation, déconnexion.
- Les rayons et départements viennent du fichier catalogue (non modifiables dans l'application).
- Fichiers : `app/` (application), `supabase/schema.sql` (base), `GUIDE-MISE-EN-LIGNE.md` (procédure).

## 5. Phase 2 — Stocks (à préciser plus tard)

Mode de suivi non encore choisi (précis ou par état). On le décidera à l'usage, après la phase 1.

## 6. Données d'entrée attendues

L'utilisateur fournit un fichier des produits et des rayons. On en déduit :
- la liste des articles,
- la liste des rayons et leur ordre de passage,
- la position des articles dans chaque rayon.

## 7. Plan de travail

| Étape | Contenu | Où |
|---|---|---|
| 1 | Import du fichier produits/rayons → données de départ | Claude |
| 2 | Maquette iPhone : liste type | Claude (simulation iPhone) |
| 3 | Maquette : listes, préparation, mode magasin | Claude |
| 4 | Maquette : impression A4 3 colonnes | Claude |
| 5 | Ajustements après tests | Claude |
| 6 | Mise en place Supabase + synchronisation temps réel | Projet local |
| 7 | Mise en ligne sur GitHub Pages, installation sur les iPhones | iPhones |
| 8 | Phase 2 : stocks | Plus tard |
