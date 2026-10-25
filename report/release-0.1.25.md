# EVO Pitwall — release v0.1.25 (3af19ee)
_Data: 2026-10-25 · Aggiornamento da **v0.1.24**_

## Correzioni e novità
- **Aiuto in GUI**: il bottone «❓ Aiuto» in fondo alla sidebar apre «Che fa ogni menu»: due righe di riepilogo per ognuno dei 18 menu, niente da configurare.
- **Aggiornatore zip senza falsi «repo è privato»**: un 403 di GitHub per **quota API esaurita** (60 richieste/ora per IP in anonimo) ora dice quello che è — «quota esaurita, riprova dopo le HH:MM» — invece di spingere l'amico a creare un token per niente.
- **crea-release carica gli asset**: la release esce con la zip del pacchetto-amico dentro (sostituzione automatica se il nome esiste già) — così chi scarica da GitHub prende SEMPRE l'installatore nuovo.

## Come si aggiorna
- **Installazione-zip (pacchetto-amico)**: la barra in alto dice «Aggiornamenti di progetto pronti su GitHub» → bottone **Aggiorna ora** (zipball + copia + test; il server si riavvia da solo). Dal 24/10 non richiede token, il repo è pubblico.
- **Chi ha la vecchia 0.1.23 sul disco**: l'aggiornatore DI QUELLA build si ferma col falso «repo è privato» — scarica la zip di QUESTA release e riestrai sulla cartella di installazione (sovrascrive il codice, `data/` col save resta intatto). Tutti gli aggiornamenti scriptono da soli.
- **Clone git**: barra «Aggiorna ora» o `sincronizza-git.cmd`.
- Il save in `data/` non si tocca mai: gli aggiornamenti portano solo codice.
