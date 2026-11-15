# Web app — Pokémon

React 18 + TypeScript + Vite, Tailwind pour les styles, react-three-fiber pour
la carte.

## Installation

```bash
cd web-app
npm install
npm run dev              # http://localhost:5173
```

Le backend doit tourner sur `http://localhost:3001` (voir `backend/README.md`) :
l'application se connecte à l'API et à socket.io dès l'écran de connexion.
Pour pointer ailleurs, définir `VITE_API_URL` dans un `.env` local.

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement avec rechargement à chaud. |
| `npm run build` | Vérification de types puis build de production dans `dist/`. |
| `npm run preview` | Sert le build de production. |
| `npm run lint` | ESLint sur `src`. |

## Comment c'est organisé

Un dossier par domaine, chacun avec son `api.ts`, ses composants et son
`index.ts` : `auth`, `boosters`, `collection`, `teams`, `arena`, `battle`,
`training`, `care`, `pvp`, `ranking`, `achievements`, `progression`, `map`,
`trainer`, `realtime`, `hud`.

L'écran unique est `map/MapScene.tsx` : la carte occupe la page, le HUD ouvre
les panneaux, et les bâtiments (camps, centre de soins) s'ouvrent en marchant
dessus plutôt que par un menu.

### Deux points qui méritent le détour

- **`battle/useBattlePlayback.ts`** anime un combat déjà résolu. Texte et
  mouvement partagent une seule timeline : une réplique apparaît quand
  l'attaque démarre, se tape pendant le déplacement, et l'attaque suivante
  attend qu'elle ait eu le temps d'être lue. L'arène, l'entraînement et les
  duels s'en servent tous les trois, sans modification.
- **`realtime/events.ts`** est le contrat socket, recopié à l'identique depuis
  `backend/src/realtime/events.ts`. Il n'y a pas de paquet partagé dans ce
  dépôt : toute modification d'un côté doit être reportée de l'autre.

Même règle pour `map/tileset.ts`, dont les identifiants de tuiles sont un
format de fil partagé avec `backend/src/world/tiles.ts`.
