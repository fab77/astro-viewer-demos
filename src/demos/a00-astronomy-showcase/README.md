# Modificare A00

- **Apertura:** `showOpening()` mostra AstroViewer / Exploring the Universe e porta DSS da opacità 0 a 1; segue la scena 01 Navigation.
- **Sequenza:** `showcaseScenes` in `main.ts` elenca titolo e funzione delle 11 scene. `runA00()` prepara il viewer e le esegue.
- **Singola scena:** modifica `scene01Navigation()` … `scene11Ecosystem()`. Ogni funzione contiene didascalie, comandi e attese in ordine di esecuzione.
- **Spettro:** l'array `spectrum` dentro `scene02Spectrum()` contiene campo, FoV, nota e palette tipizzata di ogni banda. La scena usa immagini; FITS, stretch e intervalli appartengono a `scene09FITS()`.
- **Dissolvenza:** `fadeTo()` carica/riusa il layer e anima solo le opacità. Non cambia formato, palette o stretch. `ensureLayer()` gestisce solo caricamento e riuso.
- **Stati:** `scene08SavedViews()` mantiene i tre snapshot e lo stack cliccabile. Gli helper dedicati gestiscono salvataggio, ripristino e cancellazione.
- **Titolo centrale:** `showSceneTitle()` precede ogni scena senza muovere la camera. Durata e dissolvenza sono definite qui.
- **Finale:** `scene11Ecosystem()` mostra due diagrammi HTML; markup nella funzione, stile in `index.html`.

Apri `?mode=video&scene=03` (o qualsiasi numero 01–11) per partire da una scena. `&end=06` termina dopo i cataloghi; `end` accetta il numero della scena finale. Le stringhe API delle didascalie stanno accanto alle chiamate eseguite: aggiorna entrambe quando cambi un'azione.
