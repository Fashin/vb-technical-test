# Pokémon — test technique

Une application web Pokémon : un backend **Node.js / Express / TypeScript** qui
adapte PokeAPI, et un frontend **React / TypeScript** où l'on explore un monde
partagé, ouvre des boosters, entraîne son équipe et livre des combats commentés
par un modèle de langage (VirtualBrain).

Le parti pris : plutôt qu'un écran de sélection, le jeu se joue sur une carte.
On s'entraîne dans des camps qu'on atteint à pied, on fait soigner ses Pokémon
dans un centre, et on croise d'autres dresseurs en temps réel pour les défier ou
leur échanger des cartes.

---

## Démarrage

Node 20 ou plus. Deux terminaux.

```bash
# 1. L'API — http://localhost:3001
cd backend
npm install
cp .env.example .env          # renseigner VIRTUALBRAIN_API_KEY
npm run dev

# 2. Le front — http://localhost:5173
cd web-app
npm install
npm run dev
```

La base SQLite se crée seule au premier démarrage (`backend/data/app.db`) :
aucune migration à lancer. Sans clé VirtualBrain, tout reste jouable — les
combats sont simplement improvisés par le serveur au lieu d'être commentés.

Le détail des variables d'environnement, des scripts et des routes est dans
[`backend/README.md`](backend/README.md) et [`web-app/README.md`](web-app/README.md).

---

## Ce qui est en place

**Comptes et profil** — inscription, sessions à jeton opaque, apparence du
dresseur dessinée par un générateur procédural, salon de coiffure, options.

**Cartes** — boosters qui s'accumulent avec le temps (une toutes les 15 min,
plafonnées), quatre raretés tirées dans le Pokédex de Kanto, collection
groupée par Pokémon, équipes de six.

**Monde partagé** — une carte générée côté serveur avec quatre biomes
élémentaires, parcourue en temps réel par tous les joueurs connectés
(socket.io). Les déplacements sont validés par le serveur, le client les
anticipe et se fait corriger s'il se trompe.

**Arène** — dix maîtres de niveaux croissants (12 à 100). Le chatbot écrit le
script complet du combat, le moteur le résout, et le navigateur le joue d'un
seul tenant, avec le commentaire synchronisé sur les animations.

**Progression** — chaque carte a un niveau et de l'expérience. Cinq camps
d'entraînement, un par biome plus un central, chacun plafonné à une tranche de
niveaux (1-25, 26-45, 46-65, 66-85, 86-100) : finir un palier oblige à
traverser la carte pour trouver le suivant. On choisit l'équipe qui entre au
camp, et elle y spare en entier : un partenaire sauvage par Pokémon, et celui
qui met le sien K.O. passe la main — chacun a donc son combat. Le camp
n'*enseigne* toujours qu'à sa tranche : un Pokémon qui l'a dépassée combat mais
n'apprend plus rien.

**Usure et soins** — les PV perdus en combat restent perdus. Il faut marcher
jusqu'au centre de soins et y laisser ses blessés, pour une durée qui dépend du
niveau de la carte, de sa rareté et des dégâts encaissés.

**Entre joueurs** — en s'approchant d'un autre dresseur : **duel** (combat
complet, commenté, où les deux équipes ressortent marquées et seul le vainqueur
gagne de l'expérience) ou **échange** de cartes, avec double confirmation.

**Classement et succès** — un onglet pour chacun, tous deux calculés à la
lecture depuis les tables qui portent déjà les faits.

**Export Markdown** — `GET /contents/:pokemonId` renvoie une fiche en pièce
jointe, `GET /contents/all` exporte les 898 fiches dans un dossier local, prêt
à être importé comme *brain* VirtualBrain. Chaque fiche porte les deux noms,
français et anglais, pour qu'une question posée dans l'une ou l'autre langue
retrouve le bon Pokémon.

**Noms français** — les noms d'espèces viennent d'une table embarquée
(`src/services/frenchNames.ts`, générations 1 à 8), régénérable par
`npm run names:fr`. Embarquée plutôt qu'appelée : PokeAPI ne sert un nom
localisé que par `/pokemon-species/{id}`, soit un aller-retour de plus par
espèce et un repli silencieux sur l'anglais dès que l'API tousse — repli qui
serait ensuite écrit en base. Les identifiants techniques (slug, nom de
fichier, URL d'image) restent en anglais.

---

## Écarts connus avec l'énoncé

À lire avant d'évaluer la conformité au sujet.

- **La grille de tous les Pokémon, sa barre de recherche et ses filtres par
  type ne sont pas implémentées.** L'application a dérivé vers un jeu où l'on
  possède des cartes : l'onglet Collection n'affiche que les Pokémon possédés,
  avec tri et filtre par rareté. La route `GET /pokemons/:id` existe côté
  serveur mais n'est consommée par aucun écran. C'est l'écart le plus visible.
- **Le combat n'est pas tour par tour.** Il l'a été, puis a été remplacé par
  une résolution en un seul appel : le chatbot écrit tout le script d'avance et
  le navigateur l'anime sans interruption. Le découpage qui fait l'intérêt du
  bonus est conservé — le modèle choisit les attaques, l'application calcule
  les dégâts — mais les sessions de l'API ne sont plus utilisées.
- **On ne choisit pas deux Pokémon isolés** à envoyer dans l'arène : on engage
  une équipe de six, contre un maître ou contre un autre joueur.

---

## Comment c'est construit

### Le serveur décide, le client affiche

Dégâts, points de vie, niveaux, récompenses, propriété des cartes : tout est
calculé côté serveur. Le client envoie des intentions et rend des résultats, il
ne calcule jamais un point de vie. Un client modifié ne gagne rien.

`battle/engine.ts` est le seul endroit où un combat se résout — l'arène, les
camps et les duels l'appellent tous les trois. `battle/script.ts` est le seul
endroit où le chatbot est sollicité.

### Rien n'est stocké en double

Classement et succès ne sont pas des compteurs entretenus à la main : ils sont
dérivés des victoires, des cartes, de l'expérience, des duels et des échanges
au moment où on les lit. Un classement dérivé ne peut pas diverger de ce que
les joueurs ont réellement fait, et aucun chemin d'écriture n'a à penser à le
mettre à jour.

### La clé du chatbot ne quitte pas le serveur

Elle est échangée contre un jeton court, rafraîchi en vol, et le combat est
relayé par le backend précisément pour qu'elle n'atteigne jamais le navigateur.

### Un seul processus

Le monde, les invitations et les échanges en cours vivent en mémoire. C'est
assumé et documenté : passer à plusieurs instances veut dire déplacer
`world/world.ts`, `pvp/` et l'adaptateur socket.io derrière Redis, et rien
d'autre.

---

## Vérification

```bash
cd backend  && npx tsc -p tsconfig.app.json --noEmit && npm run lint
cd web-app  && npm run build && npm run lint
```

Il n'y a pas de suite de tests automatisés dans le dépôt. Les parcours
sensibles — combat global, progression et plafonds des camps, persistance des
blessures et soins, duels et échanges à deux clients, règles de sûreté de
l'échange — ont été vérifiés par des scripts de bout en bout exécutés contre un
serveur réel pendant le développement.
