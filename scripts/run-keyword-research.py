#!/usr/bin/env python3
"""Run the app's deployed Scan -> Generate workflow, without the Lovable builder.
Usage: python scripts/run-keyword-research.py INPUT.json OUTPUT_DIRECTORY
Calls use the same publishable key and endpoints as KeywordResearch.tsx.
Results are saved locally; existing app research is never updated.
"""
import concurrent.futures, csv, json, os, pathlib, re, sys, urllib.request

def main():
    config_path, output_path = map(pathlib.Path, sys.argv[1:])
    output_path.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env_file = pathlib.Path(__file__).resolve().parents[1] / '.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.split('=', 1)
                env.setdefault(k.strip(), v.strip().strip('\"\''))
    base = env['VITE_SUPABASE_URL'].rstrip('/')
    key = env['VITE_SUPABASE_PUBLISHABLE_KEY']
    config = json.loads(config_path.read_text())
    def call(name, payload):
        req = urllib.request.Request(base + '/functions/v1/' + name,
            data=json.dumps(payload).encode(), headers={'Content-Type':'application/json', 'Authorization':'Bearer '+key})
        with urllib.request.urlopen(req, timeout=600) as response:
            result = json.load(response)
        if result.get('error'): raise RuntimeError(result['error'])
        return result
    def scan(site):
        result = call('scan-website-keywords', site)
        if not isinstance(result.get('extracted_terms'), list):
            raise ValueError('Scan did not return extracted_terms')
        print('Scanned',site['url'],len(result['extracted_terms']),'terms',flush=True)
        return result
    scans_file = output_path / 'scans.json'
    # A completed scan checkpoint avoids spending crawl credits on a generation retry.
    if scans_file.exists():
        scans = json.loads(scans_file.read_text())
        if [s['url'].rstrip('/') for s in scans] != [s['url'].rstrip('/') for s in config['sites']]:
            raise ValueError('Scan checkpoint belongs to different sites; use a new output directory')
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            scans = list(pool.map(scan, config['sites']))
        scans_file.write_text(json.dumps(scans, indent=2))
    scanned = list(dict.fromkeys(t for s in scans for t in s['extracted_terms']))
    manual = [s.strip().lower() for s in re.split(r'[\n,]+', config.get('manualSeeds','')) if len(s.strip()) >= 2]
    seeds = list(dict.fromkeys(scanned + manual + config.get('urlExtractedTerms',[]) + config.get('uploadedKeywords',[])))
    payload = {k: config[k] for k in ('topic','audience','country') if config.get(k)}
    payload['websiteTerms'] = seeds
    (output_path / 'request.json').write_text(json.dumps(payload, indent=2))
    print('Generating with',len(scanned),'scanned terms and',len(seeds),'combined seeds',flush=True)
    result = call('generate-keyword-universe', payload)
    (output_path / 'response.json').write_text(json.dumps(result, indent=2))
    semantic_map = result['results']
    with (output_path / 'semantic-map.csv').open('w',newline='') as f:
        writer = csv.writer(f); writer.writerow(['Cluster','Type','Item'])
        for c in semantic_map['clusters']:
            for key, typ in [('seed_keywords','seed_keyword'),('example_entities','entity'),('questions','question'),('modifiers','modifier')]:
                writer.writerows((c['cluster_name'],typ,item) for item in c.get(key,[]))
        writer.writerows(('_negative','negative',item) for item in semantic_map.get('negative_keywords',[]))
    print(json.dumps({'clusters':len(semantic_map['clusters']), **{k:sum(len(c.get(k,[])) for c in semantic_map['clusters']) for k in ['seed_keywords','questions','example_entities']}}),flush=True)
if __name__ == '__main__': main()
