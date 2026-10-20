import { readFileSync, readdirSync } from 'node:fs';
const files = readdirSync('data/samples').filter((f) => f.startsWith('wx-')).sort();
const bufs = files.map((f) => ({ name: f, buf: readFileSync('data/samples/' + f) }));
console.log('file:', files.join(' | '));
for (let i = 0; i + 1 < bufs.length; i++) {
  const A = bufs[i].buf, B = bufs[i + 1].buf;
  console.log('\n=== ' + bufs[i].name + ' -> ' + bufs[i + 1].name + ' ===');
  if (A.length !== B.length) console.log('size ' + A.length + ' -> ' + B.length);
  if (Buffer.compare(A, B) === 0) console.log('(identici)');
  else {
    let j = 0;
    let hcount = 0;
    while (j < A.length && j < B.length) {
      if (A[j] !== B[j]) {
        const start = j;
        while (j < A.length && j < B.length && A[j] !== B[j]) j++;
        hcount++;
        if (hcount <= 12) console.log('  off 0x' + start.toString(16) + ' len ' + (j - start) + ' : ' + A.subarray(start, j).toString('hex') + ' -> ' + B.subarray(start, j).toString('hex'));
      } else j++;
    }
    if (hcount > 12) console.log('  ... +' + (hcount - 12) + ' altre finestre');
  }
}
