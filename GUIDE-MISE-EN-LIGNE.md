# Mise en ligne de Courses Arsenal

Trois services gratuits : **Supabase** (les données partagées), **GitHub Pages** (l'application) et votre **iPhone** (installation depuis Safari).
Comptez 20 à 30 minutes. Les étapes marquées 👤 sont à faire par vous (création de comptes, mots de passe) ; Claude fait le reste.

---

## 1. 👤 Créer le projet Supabase

1. Allez sur <https://supabase.com> → **Start your project** → connectez-vous avec votre compte GitHub.
2. **New project** :
   - Name : `courses-arsenal`
   - Database password : cliquez sur **Generate** et gardez-le dans votre gestionnaire de mots de passe (l'application n'en a pas besoin).
   - Region : **West EU (Paris)**.
3. Attendez 1 à 2 minutes que le projet soit prêt.

## 2. 👤 Créer les tables

1. Menu de gauche → **SQL Editor** → **New query**.
2. Collez tout le contenu du fichier [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. Résultat attendu : « Success. No rows returned ».

## 3. 👤 Régler la connexion par code

1. **Authentication → Sign In / Providers → Email** : vérifiez que *Email* est activé. Gardez *Confirm email* activé. *Email OTP Length* : **6**.
2. **Authentication → Emails → Templates** : dans les modèles **Magic Link** et **Confirm signup**, remplacez le texte par :

   ```html
   <h2>Courses Arsenal</h2>
   <p>Votre code de connexion : <strong style="font-size:24px">{{ .Token }}</strong></p>
   <p>Il est valable une heure.</p>
   ```

   et le sujet par `Votre code Courses Arsenal`.
3. **Authentication → URL Configuration** → *Site URL* : l'adresse de l'application (étape 5), par exemple `https://VOTRE-NOM.github.io/courses-arsenal/app/`.
4. **Envoi des e-mails** : le service d'e-mail fourni par Supabase est limité (quelques e-mails par heure, et seulement vers les adresses des membres de votre équipe Supabase). Deux solutions :
   - **Simple** : *Organization → Team → Invite* : invitez l'adresse e-mail de chaque membre du foyer ;
   - **Plus souple** : *Authentication → Emails → SMTP Settings* avec un service gratuit comme Brevo (300 e-mails/jour).

## 4. 👤 Donner les clés à Claude

**Project Settings → API** (ou **Data API**) :
- *Project URL* (ex. `https://abcdefgh.supabase.co`)
- clé **anon public** (longue chaîne commençant par `eyJ…`)

Collez-les dans la conversation, ou dans [`app/config.js`](app/config.js). La clé *anon* est faite pour être publique : la sécurité vient des règles du fichier `schema.sql` (chacun ne voit que son foyer). **Ne donnez jamais la clé `service_role`.**

## 5. Publier l'application sur GitHub Pages

1. 👤 Sur <https://github.com/new> : nom `courses-arsenal`, **Public**, sans README → **Create repository**. Donnez l'adresse du dépôt à Claude.
2. Claude prépare le dépôt et l'envoie (`git push`). À la première fois, Windows ouvre une fenêtre de connexion GitHub : 👤 connectez-vous.
3. 👤 Sur GitHub : **Settings → Pages** → *Source* : **Deploy from a branch**, *Branch* : `main` / `(root)` → **Save**.
4. Au bout d'une minute, l'application est en ligne : `https://VOTRE-NOM.github.io/courses-arsenal/`.

Le dépôt contient le code et le catalogue des 81 articles (`data/catalogue.json`), mais **aucune liste** : elles restent dans Supabase. Le fichier Excel d'origine (`data/source/`) n'est pas envoyé.

## 6. 👤 Installer sur chaque iPhone

1. Ouvrez l'adresse dans **Safari** (pas Chrome).
2. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Ouvrez l'application depuis son icône verte.

## 7. 👤 Première connexion

- **La première personne** : e-mail → code reçu → prénom → **Créer notre foyer**. Le catalogue est envoyé automatiquement.
- **Les autres** : e-mail → code → prénom → saisir le **code d'invitation** (visible dans *Réglages* chez la première personne) → **Rejoindre le foyer**.

---

## En cas de problème

| Symptôme | Cause probable |
|---|---|
| Le code n'arrive pas | Limite d'envoi Supabase (étape 3.4), ou courrier indésirable |
| « Code incorrect ou expiré » | Code déjà utilisé ou trop ancien : redemandez-en un |
| « Ce code d'invitation n'existe pas » | Faute de frappe : le code fait 6 caractères (chiffres et lettres A à F) |
| Réglages affiche « Synchronisation en échec » | Réseau coupé ou clés de l'étape 4 erronées ; l'application réessaie toute seule |
| Une modification n'apparaît pas chez l'autre | Tirer l'écran ou *Réglages → Synchroniser maintenant* |

## Tester sans Supabase

- `app/index.html` sans configuration : **mode démonstration**, tout reste dans le navigateur.
- `app/index.html?fake` : **faux serveur de test** (fichier `app/dev/fake-supabase.js`). Ouvrir deux onglets permet de jouer deux personnes ; le code e-mail est toujours `123456`.
