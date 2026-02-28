# Shared Lists WebApp (Firebase + GitHub Pages)

MVP pronto per:
- spazi condivisi (la tua "cartella")
- piu liste dentro ogni spazio
- elementi checkabili in tempo reale
- invito per email (utente gia registrato)
- PWA installabile su iOS

## Stack
- React + Vite
- Firebase Auth (Google)
- Firestore realtime
- GitHub Pages (hosting statico)

## 1) Prerequisiti
- Node.js 20+
- Account Firebase
- Repository GitHub

## 2) Setup locale
1. Installa dipendenze:
   ```bash
   npm install
   ```
2. Crea file `.env` partendo da `.env.example`:
   ```bash
   cp .env.example .env
   ```
3. Inserisci i valori del tuo progetto Firebase in `.env`.
4. Avvia in sviluppo:
   ```bash
   npm run dev
   ```

## 3) Config Firebase
1. Crea progetto Firebase.
2. Abilita `Authentication > Sign-in method > Google`.
3. Crea database Firestore (production mode).
4. Applica regole in [firebase/firestore.rules](/c:/Users/Fede/Desktop/List%20WebApp/firebase/firestore.rules).
5. Crea index da [firebase/firestore.indexes.json](/c:/Users/Fede/Desktop/List%20WebApp/firebase/firestore.indexes.json) oppure usa i link proposti in console quando appaiono errori index.
6. In `Authentication > Settings > Authorized domains` aggiungi:
   - `localhost`
   - `<tuo-username>.github.io`

## 4) Deploy su GitHub Pages
1. In `package.json`, imposta la homepage:
   ```json
   "homepage": "https://<tuo-username>.github.io/<nome-repo>"
   ```
2. Installa `gh-pages` (gia presente in devDependencies).
3. Deploy:
   ```bash
   npm run deploy
   ```
4. In GitHub repository:
   - Settings > Pages
   - Source: `Deploy from a branch`
   - Branch: `gh-pages` / root

## 5) Uso flusso condiviso
1. Utente A crea spazio (cartella).
2. Utente B fa login almeno una volta.
3. Utente A invita B via email dentro lo spazio.
4. Entrambi vedono liste e modifiche in realtime.

## Note iOS e notifiche
- L'app e installabile su iPhone via "Aggiungi a schermata Home".
- Le push su iOS web sono possibili, ma richiedono setup Firebase Cloud Messaging + service worker push dedicato.
- In questo MVP hai struttura PWA pronta; la parte push si puo aggiungere come step successivo.
