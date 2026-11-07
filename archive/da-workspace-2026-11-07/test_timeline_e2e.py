# -*- coding: utf-8 -*-
"""Test E2E timeline editabile:
1) legge /api/eddie/plans e sceglie un piano reale con video
2) crea snapshot_testE2E_* con i primi 6 shot (out_dir di test, senza toccare l'originale)
3) GET candidati shot 0 → POST replace-shot
4) POST rerender → poll del job
5) verifica: durata test, PSNR shot0 diverso dal video reale, shot1..5 uguali
6) restore eddie-montage-history.json
"""
import json, os, shutil, subprocess, sys, time, urllib.request, random

BASE = 'http://localhost:3000'
DOCS = os.path.join(os.path.expanduser('~'), 'Documents', 'MetalVideoAutoEditor')
HIST = os.path.join(DOCS, 'eddie-montage-history.json')
WORK = r'H:\Vitamed AI\.freebuff'
TEST_OUT = os.path.join(WORK, 'timeline_test')
FFPROBE = None  # risolto dopo

def api_get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))

def api_post(url, payload=None):
    data = json.dumps(payload or {}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode('utf-8'))

def fail(msg):
    print('FALLITO:', msg)
    sys.exit(1)

def probe_dur(path):
    out = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0

def psnr(a, b):
    out = subprocess.run(
        [FFPROBE.startswith('') and 'ffmpeg' or 'ffmpeg'],  # placeholder, rimpiazzato sotto
        capture_output=True, text=True)
    return 0.0

def ffpsnr(ffmpeg, t_a, video_a, t_b, video_b, tmp_a, tmp_b):
    subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-ss', f'{t_a:.3f}', '-i', video_a,
                    '-frames:v', '1', '-vf', 'scale=928:1376', '-q:v', '2', tmp_a], timeout=60)
    subprocess.run([ffmpeg, '-y', '-loglevel', 'error', '-ss', f'{t_b:.3f}', '-i', video_b,
                    '-frames:v', '1', '-vf', 'scale=928:1376', '-q:v', '2', tmp_b], timeout=60)
    out = subprocess.run([ffmpeg, '-hide_banner', '-i', tmp_a, '-i', tmp_b,
                          '-filter_complex', 'psnr', '-f', 'null', '-'], capture_output=True, text=True)
    import re
    m = re.search(r'average:([\d.]+|inf)', out.stderr)
    if not m:
        return 0.0
    return 999.0 if m.group(1) == 'inf' else float(m.group(1))

def api_get_raw(url):
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            return r.read()
    except Exception as e:
        return b''

def main():
    global FFPROBE
    # binary paths: cerca nel log del server
    ffmpeg = ffprobe = None
    log_path = os.path.join(WORK, 'vso_server.log')
    try:
        for line in open(log_path, encoding='utf-8', errors='ignore'):
            if '[FFmpeg] ffmpeg:' in line:
                parts = line.split('[FFmpeg] ffmpeg:')[1].split('|')
                ffmpeg = parts[0].strip()
                ffprobe = parts[1].strip().split('ffprobe:')[-1].strip()
                break
    except OSError:
        pass
    if not ffmpeg or not ffprobe:
        fail('percorsi ffmpeg/ffprobe non trovati nel log del server')
    FFPROBE = ffprobe
    print(f'ffmpeg={ffmpeg}')
    print(f'ffprobe={ffprobe}')

    # ---------- 1. piano reale con video ----------
    plans = api_get(BASE + '/api/eddie/plans')['plans']
    print(f'piani trovati: {len(plans)}')
    # scegli il piano più recente con video leggero e file snapshot esistenti
    # (il piano di test avrà final_name UNICO + out_dir di test: nulla di reale toccato)
    chosen = None
    real_detail = None
    for p in sorted(plans, key=lambda x: x['createdAt'], reverse=True):
        if not (p['videoExists'] and p['shotsCount'] >= 10):
            continue
        d_tmp = api_get(BASE + f"/api/eddie/plan/{p['snapId']}")
        sh = d_tmp['plan']['shots']
        if all(os.path.exists(s['file']) for s in sh[:6]):
            chosen = p
            real_detail = d_tmp
            break
    if not chosen:
        fail('nessun piano reale con video e >=10 shot')
    print(f"piano scelto: {chosen['snapId']} · {chosen['songName']} · {chosen['shotsCount']} shot · video={chosen['videoPath']}")

    real_video = chosen['videoPath']
    real_dur = probe_dur(real_video)
    if real_dur <= 0:
        fail('video reale non leggibile da ffprobe')
    print(f'durata video reale: {real_dur:.2f}s')

    detail = real_detail
    plan = detail['plan']
    shots_full = plan['shots']

    # ---------- 2. piano di test: primi 6 shot ----------
    tag = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=4))
    test_snap = f'snapshot_testE2E{int(time.time())%100000}_{tag}'
    test_dir = os.path.join(DOCS, test_snap)
    os.makedirs(test_dir, exist_ok=True)
    test_plan = dict(plan)
    test_plan['shots'] = shots_full[:6]
    test_plan['out_dir'] = TEST_OUT
    test_plan['snap_dir'] = test_dir
    test_plan['final_name'] = f'TEST_E2E_{tag} - montaggio.mp4'
    test_plan['sections'] = plan.get('sections', [])
    test_plan.pop('song_name', None)
    test_plan['song_name'] = f'TEST_E2E_{tag}'
    plan_test_path = os.path.join(test_dir, 'plan.json')
    with open(plan_test_path, 'w', encoding='utf-8') as f:
        json.dump(test_plan, f, ensure_ascii=False, indent=1)
    print(f"piano di test: {test_snap} · {len(test_plan['shots'])} shot")

    # backup storia per restore a fine test
    hist_bak = os.path.join(WORK, f'test_e2e_history_{tag}.bak')
    if os.path.exists(HIST):
        shutil.copy2(HIST, hist_bak)
        print('storia montaggi: backup ok')
    else:
        hist_bak = None
        print('storia montaggi: assente (nessun backup)')

    # ---------- 3. candidati + replace shot 0 ----------
    cand = api_get(BASE + f'/api/eddie/plan/{test_snap}/candidates/0')
    n_cand = len(cand['candidates'])
    print(f"candidati shot 0: {n_cand}")
    if n_cand < 1:
        fail('nessun candidato disponibile per lo shot 0')
    # escludi la clip già in uso nello shot 0
    old_src = (test_plan['shots'][0].get('src') or test_plan['shots'][0]['file']).replace('/', '\\')
    new_clip = None
    for c in cand['candidates']:
        if c['path'].replace('/', '\\') != old_src:
            new_clip = c
            break
    if not new_clip:
        fail('tutti i candidati coincidono con la clip corrente')
    print(f"clip sostituzione: {new_clip['title']} · {new_clip['dur']:.2f}s · score {new_clip['score']}")

    rj = api_post(BASE + f'/api/eddie/plan/{test_snap}/replace-shot', {'idx': 0, 'clipPath': new_clip['path']})
    if not rj.get('success'):
        fail('replace-shot fallito')
    det2 = api_get(BASE + f'/api/eddie/plan/{test_snap}')
    sh0 = det2['plan']['shots'][0]
    if not sh0.get('replaced'):
        fail('shot 0 non marcato come replaced')
    if not sh0.get('originalSrc'):
        fail('originalSrc non salvato (undo impossibile)')
    os.makedirs(TEST_OUT, exist_ok=True)
    snap_file = sh0['file']
    if not (os.path.exists(snap_file) and os.path.dirname(snap_file) == test_dir):
        fail(f'copia snapshot non in {test_dir}')
    print(f'replace ok · shot file={os.path.basename(snap_file)} · start={sh0["start"]:.2f}s')

    # ---------- 4. rerender + poll ----------
    rr = api_post(BASE + f'/api/eddie/plan/{test_snap}/rerender')
    job = rr['job']
    print(f"job rerender: {job['id']}")
    deadline = time.time() + 900
    final_path = None
    while time.time() < deadline:
        time.sleep(4)
        st = api_get(BASE + f"/api/eddie/montage/status/{job['id']}")['job']
        print(f"  {st['stage']} {st['progress']}% · {st['stageDetail']}")
        if st['status'] in ('completed', 'failed', 'cancelled'):
            if st['status'] != 'completed':
                fail(f"rerender failed: {st.get('error')}")
            final_path = st['outputPath']
            break
    if not final_path or not os.path.exists(final_path):
        fail('video di test non generato')
    test_dur = probe_dur(final_path)
    exp_dur = sum(s['dur'] for s in test_plan['shots'])
    print(f"video test: {final_path} · {test_dur:.2f}s (atteso ~{exp_dur:.2f}s)")
    if abs(test_dur - exp_dur) > 0.8:
        fail(f'durata test fuori range: {test_dur:.2f} vs {exp_dur:.2f}')

    # ---------- 5. verifica PSNR: shot0 diverso, shot1-4 uguali al reale ----------
    # scheduli shot del piano reale: t del shot 1..4 coincidono
    shots = det2['plan']['shots']
    tmp_a = os.path.join(WORK, 'e2e_a.jpg')
    tmp_b = os.path.join(WORK, 'e2e_b.jpg')
    psnr0 = ffpsnr(ffmpeg, shots[0]['t'] + shots[0]['dur'] / 2, final_path,
                   shots[0]['t'] + shots[0]['dur'] / 2, real_video, tmp_a, tmp_b)
    print(f'PSNR shot0 (deve essere BASSO, contenuto diverso): {psnr0:.1f} dB')
    psnr_same = []
    for i in range(1, min(5, len(shots))):
        t = shots[i]['t'] + shots[i]['dur'] / 2
        v = ffpsnr(ffmpeg, t, final_path, t, real_video, tmp_a, tmp_b)
        psnr_same.append(v)
        print(f'PSNR shot{i} (deve essere ALTO, invariato): {v:.1f} dB')
    if psnr0 >= 20.0:
        fail(f'shot0 sembra NON cambiato nel video di test (PSNR {psnr0:.1f} alto)')
    if min(psnr_same) < 25.0:
        fail(f'un altro shot è cambiato rispetto al video reale (min {min(psnr_same):.1f} dB)')
    print('VERIFICA PIXEL OK: solo lo shot 0 è cambiato, gli altri sono identici.')
    for f_ in (tmp_a, tmp_b):
        try: os.unlink(f_)
        except OSError: pass

    # ---------- 6. restore storia ----------
    if hist_bak:
        shutil.copy2(hist_bak, HIST)
        os.unlink(hist_bak)
        print('storia montaggi: ripristinata')
    print('E2E COMPLETATO CON SUCCESSO')

if __name__ == '__main__':
    main()
