# v0.1.31 — Grid Type canonico: multiclasse CUSTOM, monomarca AUTOMATIC

## Il problema
Sul PC di un player nuovo il menu Race Weekend nasce **AUTOMATIC di fabbrica**, e le serie multiclasse uscivano **monoclasse** (lezione del 25/10, Berline Moderne): senza Grid Type = CUSTOM le zavorre e le penalità di classe sono zero per definizione.

## La scoperta
Il vecchio write esterno convertiva il campo 6 in 7 (oneof): il gioco **scartava** quella forma e a riavvio rinascava AUTOMATIC. Il toggle vivo del menu è stato fotografato con un watcher su tutta la cartella ACE (`data/samples/gridtype2/`):

- **AUTOMATIC** → campo `3.6 = 1` solo
- **CUSTOM** → `3.6 = 1` resta in piedi e si aggiunge `3.7 = N` subito dopo (N = Number of Opponents)

Confermato a riavvio: disco in forma canonica → il menu nasce CUSTOM senza toccare niente.

## Cosa cambia per te
- **Serie multiclasse** → il Prepara sblocca CUSTOM da solo, contatore = celle − 1: zavorre e penalità di classe al round senza gesti manuali.
- **Serie monomarca** → il Prepara ripone AUTOMATIC (richiesta di oggi: auto tutte alla pari, zavorre non servono), e il conteggio fisso di carriera lo porta EVO da sé (`weekendCarCount` conta le auto native e il rebuild allinea la griglia).
- Storia del grid mode nel pannello vigia (`griglia custom già in piedi` / `modo griglia riposto su AUTOMATIC`).

## Interno
- `tools/set-track.mjs`: `setWeekendGridMode('custom'|'automatic', count)` scrittore della forma canonica, wrapper `setWeekendGridCustom` (rassegnato) e `setWeekendGridAuto`. Idempotente, backup `bak-gridmode-*`.
- `src/webui.mjs`: l'elegge del modo per tipo serie (`tipoGriglia`).
- reader `weekendGridMode`: documento con la forma vera del menu.
