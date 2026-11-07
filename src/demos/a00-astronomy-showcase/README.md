# Modificare A00

- **Apertura:** `showOpening()` mostra AstroViewer / Exploring the Universe e porta DSS da opacità 0 a 1; segue la scena 01 Navigation.
- **Sequenza:** `showcaseScenes` in `main.ts` elenca titolo e funzione delle 10 scene. `runA00()` prepara il viewer e le esegue.
- **Singola scena:** modifica `scene01Navigation()` … `scene10Ecosystem()`. Ogni funzione contiene didascalie, comandi e attese in ordine di esecuzione.
- **Spettro:** l'array `spectrum` dentro `scene02Spectrum()` contiene campo, FoV, nota e palette tipizzata di ogni banda. La scena usa immagini; FITS, stretch e intervalli appartengono a `scene08FITS()`.
- **Cambio di campo nello spettro:** `changeSpectrumField()` gestisce spiegazione, dissolvenza a zero, titolo centrale, movimento e riapparizione della nuova mappa. I tempi sono espliciti nella funzione; Fermi resta fermo 8 secondi. A campo e FoV invariati si cambia solo mappa.
- **Dissolvenza:** `fadeTo()` carica/riusa il layer e anima solo le opacità. Non cambia formato, palette o stretch. `ensureLayer()` gestisce solo caricamento e riuso.
- **Stati:** `scene07SavedViews()` mantiene i tre snapshot e lo stack cliccabile. Gli helper dedicati gestiscono salvataggio, ripristino e cancellazione.
- **Titolo centrale:** `showSceneTitle()` precede ogni scena senza muovere la camera. Durata e dissolvenza sono definite qui.
- **Finale:** `scene10Ecosystem()` mostra due diagrammi HTML; markup nella funzione, stile in `index.html`.

Apri `?mode=video&scene=03` (o qualsiasi numero 01–10) per partire da una scena. `&end=05` termina dopo i cataloghi; `end` accetta il numero della scena finale. Le stringhe API delle didascalie stanno accanto alle chiamate eseguite: aggiorna entrambe quando cambi un'azione.

Il box coordinate è sempre visibile in basso a destra. `updateCoordinates()` legge centro, cursore e FoV a ogni frame senza generare eventi mouse sintetici.

## Import e servizi live (scena 06)

- `demonstrateLocalJSON()` mostra due esempi indipendenti: catalogo HSC e footprint HST/STC-S. Il pannello dati contiene una proiezione delle colonne e una riga reale; `fixtureColumns()` assegna i ruoli delle colonne.
- `demonstrateLocalCSV()` legge il file CSV, lo interpreta con `parseTapCsvTable()` e passa righe e unità a `tableCatalogue()`.
- `demonstrateLiveXMM()` si sposta su Perseo e mostra EPIC RGB, ADQL, risposta e trasferimento `services → viewer`, prima per le rilevazioni e poi per i footprint XMM.
- `services.xmm` usa il TAP XSA (`https://nxsa.esac.esa.int/tap-server/tap`), verificato operativo; ESASky restituiva HTTP 503 durante la verifica. `votable_plain` richiede TABLEDATA, compatibile con `parseVOTable()`; il VOTable predefinito di XSA usa BINARY2.
- Un errore live viene dichiarato: non viene sostituito da dati locali.

### Proxy XSA

XSA non abilita CORS per il browser. `vite.config.mts` inoltra solo `/api/xmm-tap/sync` al nodo XSA fisso, per sviluppo e `vite preview`. Avvia A00 con `npm run demo:a00`; dopo l'aggiunta della configurazione riavvia eventuali server precedenti. Il transport modifica solo il percorso HTTP, non ADQL o risultati. Per pubblicare la build statica, l'hosting deve fornire la stessa rotta proxy (nessuna credenziale richiesta); senza proxy la parte live mostra un errore esplicito.

### Metadati hover

`updateHoveredMetadata()` legge sorgenti e footprint sotto il puntatore a ogni frame. Le card `? identificatore - hovered` sono temporanee; le card selected restano finché la selezione viene azzerata. I due tipi convivono nello stesso box.
