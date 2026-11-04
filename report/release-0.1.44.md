## EVO Pitwall v0.1.44

### In questa build

- **Difesa anti-colpo chiusa fino in fondo** (lezione dei DUE colpi del 31/10):
  la sonda `tools/_difesa-probe.mjs` gira su un banco completo (carriera di
  MARCA «Prova Sonda», flussi, file di gioco e intera root «Saved Games» in
  sandbox) e fa lo sweep GET con impronta prima/dopo su TUTTE le 118 rotte del
  dispatcher: qualsiasi GET che muti lo stato esce smascherata per nome. Lo
  sweep ha chiuso l'ultima GET mutante, `life` (persisteva il save): ora è nel
  set SOLO_POST. In gioco non cambia nulla: la GUI parlava già tutto via POST.
- **Builder delle tinte intero (DA-10)**: bilancio per famiglia, tinte
  prestate opt-in, vetrina delle livree (CLI `griglia`, WebUI, tab Griglia
  della GUI con grido monocolore «più LIVERIES + APPLICA»).
- **Celle sintetiche col preset vero** (come l'app esterna): niente più varianti
  pesanti invischiati — riscossa Standard ovunque, conteggio del CLI
  allineato al gamemodesave, e la volante del centro gare non copre più il
  bottone «scegli per oggi».
- **App dentro il gioco**: installer unico che porta cruscotto e pitwall in
  `Saved Games/ACE/mods/uiresources/ACEUIAppLoader/` a ogni apertura GUI.

### Verifiche

- Suite completa: **682/682 verdi** in sandbox + lint Biome pulita.
- Danza del PC amico vergine: **24/24 verifiche verdi** (zip 527 file con
  test inclusi passanti, primo e secondo avvio puliti).
- Test di regressione della difesa (`test/diffesa-sonda.test.mjs`) con prova
  di rottura sul disco.

Puoi aggiornare dal launcher (clone) o prendere questo zip — dentro c'è
GUIDA-AMICO.md con l'installazione.
