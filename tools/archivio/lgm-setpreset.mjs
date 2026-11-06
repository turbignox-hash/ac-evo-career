// Cambia il PRESET meteo selezionato: top field 2 di gamemode.lastgamemode (varint).
// Indici (da log "heavy rain (6)" e ordine menu): 0 sereno, 1 sparse, 2 nuvoloso, 3 coperto,
// 4 pioggia leggera, 5 pioggia, 6 pioggia intensa, 7 custom.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
const SRC = 'C:/Users/Mauro/Saved Games/ACE/GameModes/gamemode.lastgamemode';
const IDX = Number(process.argv[2] ?? 4);
const buf = readFileSync(SRC);
copyFileSync(SRC, 'data/samples/lgm-before-preset-' + IDX + '.hex');
if (buf[0] !== 0x08 || buf[1] !== 0x01) { console.log('start inatteso:', buf.subarray(0,4).toString('hex')); }
// top: 08 01 (f1=1) | 10 xx (f2=preset) | 1a ... (f3 subs)
if (buf[2] !== 0x10) { console.log('campo 2 non trovato all offset 2 (tag=' + buf[2].toString(16) + ') — abort'); process.exit(1); }
const old = buf[3];
buf[3] = IDX;
writeFileSync(SRC, buf);
console.log('preset selezionato: ' + old + ' -> ' + IDX);
