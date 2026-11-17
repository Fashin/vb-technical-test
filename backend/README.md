# API — Pokémon

Node.js + Express + TypeScript. Sert l'API REST, la couche temps réel
(socket.io) et le monde partagé, tous sur le même port.

## Installation

```bash
cd backend
npm install
cp .env.example .env     # puis renseigner VIRTUALBRAIN_API_KEY
npm run dev              # http://localhost:3001
```

Node 20 ou plus. La base SQLite se crée toute seule au premier démarrage dans
`data/app.db` ; il n'y a aucune migration à lancer.

### Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `VIRTUALBRAIN_API_KEY` | — | Clé du chatbot (`vb_ak_…`). Sans elle, les combats restent jouables mais ne sont plus commentés. |
| `PORT` | `3001` | Port HTTP et socket.io. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origines autorisées, séparées par des virgules. |
| `DB_PATH` | `./data/app.db` | Fichier SQLite. |
| `EXPORT_DIR` | `./pokemons-ru` | Dossier écrit par `/contents/all`. |
| `BOOSTER_INTERVAL_MS` | `900000` | Délai entre deux boosters. |
| `HEAL_UNIT_MS` | `60000` | Unité de temps de soin ; à baisser pour une démo. |

La clé VirtualBrain ne quitte jamais le serveur : elle est échangée contre un
jeton court et le combat est relayé par le backend précisément pour ça.

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Démarre en rechargement à chaud (nodemon + ts-node). |
| `npm run build` | Compile `src` vers `dist`. |
| `npm start` | Lance le serveur compilé (`dist/app.js`). |
| `npm run typecheck` | Vérification de types seule, sans émission. |
| `npm run lint` | ESLint sur `src`. |
| `npm run names:fr` | Régénère `src/services/frenchNames.ts` depuis PokeAPI. |
| `npm run reset:beta` | Remise à zéro de fin de bêta (voir ci-dessous). |

### Remise à zéro de fin de bêta

`scripts/reset-beta.mjs` efface tout ce que les joueurs ont généré — cartes,
équipes, combats, duels, échanges, victoires d'arène, boosters chanceux,
éclats — en conservant les comptes, puis donne à chacun le succès
« Bêta-testeur » et la couronne qu'il débloque chez le coiffeur. Les sessions
survivent, donc personne n'a à se reconnecter.

```bash
node scripts/reset-beta.mjs --dry-run   # compte tout, n'écrit rien
node scripts/reset-beta.mjs             # demande confirmation ("reset")
node scripts/reset-beta.mjs --yes       # sans question, pour un script de déploiement
```

`DB_PATH` est respecté comme par l'application. **Arrêter le backend avant** :
il garde le fichier SQLite ouvert, et une copie de la base est écrite à côté
de l'original (`app.db.before-reset-…`) avant la moindre suppression.

### En production

```bash
npm ci                 # outils de compilation compris : le build en a besoin
npm run build          # src → dist
npm prune --omit=dev   # ne restent que les dépendances d'exécution
npm start              # node dist/app.js
```

TypeScript n'est utilisé qu'à la compilation : l'image finale n'exécute que du
JavaScript, et les seules dépendances d'exécution sont `express`, `socket.io`,
`better-sqlite3`, `axios`, `cors` et `dotenv`.

## Routes

Tout est authentifié par `Authorization: Bearer <token>`, sauf `/auth/register`,
`/auth/login`, `/ping`, `/pokemons/*` et `/contents/*`.

| Route | Rôle |
|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/logout` | Comptes et sessions. |
| `GET /pokemons/:id` | Un Pokémon, adapté de PokeAPI (1–898). |
| `GET /contents/:pokemonId` | Le même, en Markdown téléchargeable. |
| `GET /contents/all` | Exporte les 898 fiches dans `EXPORT_DIR` (un seul export à la fois). |
| `GET /boosters`, `POST /boosters/open`, `GET /boosters/cards` | Économie de boosters et collection. |
| `GET/POST /boosters/recycle`, `POST /boosters/open-lucky` | Recyclage des doublons en boosters à meilleurs taux. |
| `GET/POST/PUT/DELETE /teams…` | Équipes. |
| `GET /arena/masters`, `POST /arena/battle`, `POST /arena/battle/run` | Arène : le chatbot écrit le combat, le moteur le résout. |
| `GET /training/camps`, `POST /training/:campId/session` | Camps d'entraînement, XP et niveaux. |
| `GET /care`, `POST /care/admit` | Centre de soins. |
| `GET /ranking`, `GET /achievements` | Classement et succès, dérivés à la lecture. |

Les duels et les échanges entre joueurs passent par socket.io
(`pvp:*`, `trade:*`), pas par REST : les deux joueurs doivent se voir en direct.

## Ce qui est volontaire

- **Le serveur décide de tout.** Dégâts, PV, niveaux, récompenses et propriété
  des cartes sont calculés ici. Le client envoie des intentions et affiche des
  résultats ; il ne calcule jamais un point de vie.
- **Rien n'est stocké en double.** Classement et succès sont dérivés des tables
  qui portent déjà les faits, donc ils ne peuvent pas diverger de la réalité.
- **Un seul processus.** Le monde, les invitations et les échanges vivent en
  mémoire. Passer à plusieurs instances veut dire déplacer `world/world.ts`,
  `pvp/` et l'adaptateur socket.io derrière Redis, et rien d'autre.
