// car-pool.test.mjs — il vigia del parco auto (24/10, richiesta Mauro: «potrei
// prendere una F1 e la UI non se ne accorgerebbe»): qui si prova che si
// ACCORGE. Il pool della serie (poolAuto − escludiAuto della classe, o node.cars
// del ladder) e il match tollerante dei nomi come li scrive EVO (brand + modello,
// con o senza anno, accenti a caso).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { carPoolOf, carInPool, poolNodeForLive } from '../src/car-pool.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'carpool-'));

// ladder minimo: una serie monomarca + una con poolAuto in grid-classes.json
const LADDER = {
  contentNames: {
    cars: {
      'ks_ae86_1600': 'Toyota Sprinter Trueno 1600GT-Apex (AE86)',
      'ks_ae86_gtv': 'Toyota Sprinter Trueno GT-Apex (AE86)',
      'ks_f40_lm': 'Ferrari F40 LM',
      'ks_mini_jcs_1990': 'Mini John Cooper S',
      'ks_mazda_mx5_na': 'Mazda MX-5 NA',
      'ks_s2000_ap1': 'Honda S2000 AP1',
    },
  },
  nodes: [
    { nodeId: 'coppa_ae86', cars: ['ks_ae86_1600', 'ks_ae86_gtv'] },
    { nodeId: 'coppa_strada', cars: ['ks_s2000_ap1'] },
  ],
};

function scriviClassi(obj) {
  mkdirSync(TMP, { recursive: true });
  const f = join(TMP, `grid-classes-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(f, JSON.stringify(obj), 'utf8');
  process.env.EVO_CLASSES_FILE = f;
  return () => { delete process.env.EVO_CLASSES_FILE; };
}

test('senza classe in grid-classes.json: il pool è node.cars della serie', () => {
  const ripristina = scriviClassi({ classi: {} });
  try {
    const parco = carPoolOf(LADDER, 'coppa_ae86');
    assert.deepEqual(parco.ids, ['ks_ae86_1600', 'ks_ae86_gtv']);
    assert.deepEqual(parco.ammesse, ['Toyota Sprinter Trueno 1600GT-Apex (AE86)', 'Toyota Sprinter Trueno GT-Apex (AE86)']);
  } finally { ripristina(); }
});

test('classe con poolAuto: il pool sostituisce node.cars, escludiAuto le toglie via', () => {
  // i token del preset (≥3 lettere: 'jcs', 'mx5na') riconoscono le auto
  // escluse dentro i nomi/ID del pool, come la Coppa RX-7 FD del 23/10
  const ripristina = scriviClassi({
    classi: {
      coppa_strada: {
        poolAuto: ['ks_s2000_ap1', 'ks_mini_jcs_1990', 'ks_mazda_mx5_na'],
        escludiAuto: ['preset_jcs_mech_1', 'preset_mx5na_mech_1'],
      },
    },
  });
  try {
    const parco = carPoolOf(LADDER, 'coppa_strada');
    assert.deepEqual(parco.ids, ['ks_s2000_ap1']);
    assert.deepEqual(parco.escluse, ['Mini John Cooper S', 'Mazda MX-5 NA']);
    assert.ok(parco.ammesse.some((n) => /S2000/.test(n)));
  } finally { ripristina(); }
});

test('l\'auto della vittoria combacia col pool anche a parole mescolate/annate diverse', () => {
  const ripristina = scriviClassi({ classi: { coppa_ae86: { poolAuto: ['ks_ae86_1600'] } } });
  try {
    const ammesse = carPoolOf(LADDER, 'coppa_ae86').ammesse;
    // il nome del risultato: brand + modello, con o senza anno/accenti
    assert.equal(carInPool('Toyota Sprinter Trueno 1600GT-Apex (AE86)', ammesse), true);
    assert.equal(carInPool('toyota  trueno  1600gt-apex (ae86)', ammesse), true);
    assert.equal(carInPool('Toyota Sprinter Trueno 1600 GT Apex', ammesse), true);
  } finally { ripristina(); }
});

test('la F1 nel sedile della Coppa AE86 NON passa: il vigia la vede', () => {
  const ripristina = scriviClassi({ classi: { coppa_ae86: { poolAuto: ['ks_ae86_1600'] } } });
  try {
    const ammesse = carPoolOf(LADDER, 'coppa_ae86').ammesse;
    assert.equal(carInPool('Ferrari F2004', ammesse), false);
    assert.equal(carInPool(' McLaren MP4/4', ammesse), false);
    // e nemmeno la versione potenziata della STESSA auto (richiesta di Mauro:
    // «la 1600 lasciala, ho preso la potenziata e la gara è semplice»)
    assert.equal(carInPool('Toyota Sprinter Trueno GT-Apex (AE86)', ammesse), false);
  } finally { ripristina(); }
});

test('niente pool (classe né nodo), niente giudizio: carInPool ammette tutto', () => {
  const ripristina = scriviClassi({ classi: {} });
  try {
    const parco = carPoolOf(LADDER, 'serie_inesistente');
    assert.deepEqual(parco.ammesse, []);
    assert.equal(carInPool('Ferrari F2004', parco.ammesse), true);   // niente da confrontare: non si blocca
    assert.equal(carInPool(null, ammi(parco)), true);   // il risultato che tace non si giudica
  } finally { ripristina(); }
});
const ammi = (parco) => parco.ammesse;

/* ------- il giudizio LIVE si fa solo con la serie giusta (27/10) -------
   Il caso reale di Mauro: il coach ripeteva «Ferrari F40 LM fuori parco»
   mentre lui girava con le auto delle SUE serie — l'F40 LM ha il parco suo
   (Leggende Stradali, Coppa F40 LM) e il touch live lo giudicava col pool
   della serie di carriera pure quando la sessione non era quella. */

const LADDER_LIVE = {
  contentNames: {
    cars: {
      'ks_r5_gt_turbo': 'Renault 5 GT Turbo',
      'ks_escort_cosworth': 'Ford Escort RS Cosworth',
      'ks_ferrari_f40_lm': 'Ferrari F40 LM',
    },
    tracks: { 'brands_hatch': 'Brands Hatch', 'donington_park': 'Donington Park' },
  },
  nodes: [
    { nodeId: 'coppa_strada_80', cars: ['ks_r5_gt_turbo', 'ks_escort_cosworth'],
      calendar: [{ track: 'brands_hatch' }, { track: 'donington_park' }] },
    { nodeId: 'coppa_ferrari-f40-lm', cars: ['ks_ferrari_f40_lm'],
      calendar: [{ track: 'donington_park' }] },
  ],
};

function giudizioLive({ pending = null, node = 'coppa_strada_80', round = 0, smTrack, smType, car }) {
  const nodo = poolNodeForLive(LADDER_LIVE, { pending, node, round, smTrack, smType });
  if (!nodo) return null;
  const parco = carPoolOf(LADDER_LIVE, nodo);
  return { nodo, ok: !car || carInPool(car, parco.ammesse), ammesse: parco.ammesse };
}

test('giudizio live: in menu (pista assente) la copilota NON parla', () => {
  assert.equal(giudizioLive({ smTrack: null, smType: 'Race', car: 'Ferrari F40 LM' }), null);
  assert.equal(giudizioLive({ smTrack: '', car: 'Ferrari F40 LM' }), null);
});

test('sessione su un\'altra pista o non di gara (test griglia, MP di un\'altra serie): tace anche con l\'F40 LM', () => {
  // senza pending e con SM su Donington (ronda 1: non è la ronda corrente, la 0):
  // non è una gara della carriera → niente giudizio, niente «fuori parco» a ripetizione
  assert.equal(giudizioLive({ smTrack: 'Donington Park', smType: 'Race', car: 'Ferrari F40 LM' }), null);
  // prove/hotstint sulla pista GIUSTA ma senza gara: niente punti in ballo, niente parole
  assert.equal(giudizioLive({ smTrack: 'Brands Hatch', smType: 'HotStint', car: 'Ferrari F40 LM' }), null);
});

test('gara lanciata dal flusso (pending): vigia al guinzaglio: il round della serie giudica', () => {
  const g = giudizioLive({
    pending: { node: 'coppa_strada_80', round: 0, trackId: 'brands_hatch' },
    smTrack: 'Brands Hatch', smType: 'Race', car: 'Ferrari F40 LM',
  });
  assert.equal(g.nodo, 'coppa_strada_80');
  assert.equal(g.ok, false, 'F40 nel sedile di una gara Coppa Strada → fuori parco, il vigia resta');
  assert.equal(carInPool('Renault 5 GT Turbo', g.ammesse ?? []), true, 'la R5 GT Turbo resta ammessa');
  // il flusso lanciato, ma la SM su un'altra pista (gara diversa): tace
  assert.equal(giudizioLive({
    pending: { node: 'coppa_strada_80', round: 0, trackId: 'brands_hatch' },
    smTrack: 'Donington Park', smType: 'Race', car: 'Ford Escort RS Cosworth',
  }), null);
});

test('gara lanciata a mano (senza pending) sulla pista della ronda in Race: il vigia resta', () => {
  const g = giudizioLive({ smTrack: 'brands_hatch', smType: 'Race', car: 'Ferrari F40 LM' });
  assert.equal(g.nodo, 'coppa_strada_80');
  assert.equal(g.ok, false, 'F40 LM in gara Coppa Strada: fuori parco');
  const ok = giudizioLive({ smTrack: 'Brands Hatch', smType: 'Race', car: 'Renault 5 GT Turbo' });
  assert.equal(ok.ok, true, 'la R5 GT Turbo nella sua gara non deve sentire nessuna allerta');
});
