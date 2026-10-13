# CodeLab – Programmation & Cybersécurité

Plateforme statique (un seul `index.html`) : parcours C++, Python, Java et Cybersécurité/CTF.
Chaque parcours : 9 fiches de documentation, 15 quiz, 15 exercices (8 défis + 7 pour la cyber → 15 défis CTF).

## Fichiers
- `index.html` : site complet (HTML + CSS + JS, données pédagogiques dans l'objet `T`)
- `netlify.toml` : configuration Netlify (site statique, en-têtes de sécurité)

## Points et progression
Quiz = 10 pts, exercice = 20 pts, flag CTF = 30 pts. Progression sauvegardée dans `localStorage` et,
si l'utilisateur est connecté, dans Firestore (`users/{uid}`), synchronisée en temps réel.

## Firebase
1. Authentication : activer « Anonyme » et « E-mail/Mot de passe ».
2. Créer Firestore et publier les règles données en commentaire au début de `index.html`.
3. Ajouter le domaine Netlify dans Authentication → Settings → Domaines autorisés.

## Déploiement Netlify
Glisser le dossier (`index.html` + `netlify.toml`) sur https://app.netlify.com/drop

## Ajouter du contenu
Dans `index.html` : `T.<parcours>.docs / quiz / ex / ctf`. Un exercice = `{t, d, st, must:[regex], out, sol}` ;
le code est validé si toutes les regex de `must` correspondent. Un flag CTF = `{t, d, gen, f}`.

## Assistant IA
Onglet « 🤖 Assistant IA » : modèle Qwen2.5-0.5B exécuté localement via WebLLM (WebGPU, Chrome/Edge),
gratuit, sans clé API. Téléchargement ≈ 400 Mo au premier usage. Pour un modèle plus puissant, remplacer
l'identifiant du modèle dans `aiInit()` (voir la liste WebLLM) ou brancher une API gratuite (Gemini, Groq).

## IA cloud gratuite (clé API sécurisée)
Le site appelle `/.netlify/functions/chat` (fichier `netlify/functions/chat.js`), qui contacte l'API Groq.
La clé n'est **jamais** dans le code du site : elle est stockée dans les variables d'environnement Netlify.
1. Créer une clé gratuite sur https://console.groq.com/keys
2. Netlify → Site configuration → Environment variables, ajouter :
   - `GROQ_API_KEY` = votre clé Groq
   - `FIREBASE_API_KEY` = la clé web Firebase (`apiKey` de la config)
   - `GROQ_MODEL` (optionnel, défaut `llama-3.1-8b-instant`)
3. Déployer avec Git ou la CLI (`npm i -g netlify-cli && netlify deploy --prod`) pour que la fonction soit publiée.
Seuls les utilisateurs connectés (anonyme compris) peuvent utiliser l'IA cloud.
