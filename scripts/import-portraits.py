#!/usr/bin/env python3
"""Import 80 Commons portraits with license receipts. Publishes nothing unless all pass.

Needs Pillow only for this optional asset-generation step; the web app has no Python dependency.
Edit commonsFile in the roster to override an unsuitable Wikipedia lead image.
"""
import argparse
import hashlib
import html
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import shutil
import tempfile
import time
from datetime import datetime, timezone
import urllib.parse
import urllib.request
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = 'SomewhereIdentifyMe/1.0 (https://github.com/dlc-diego/somewhere; licensed portrait import)'
COMMONS = 'https://commons.wikimedia.org/w/api.php'
WIKIPEDIA = 'https://en.wikipedia.org/w/api.php'

class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
    def handle_data(self, data):
        self.parts.append(data)

def plain(value):
    parser = PlainText()
    parser.feed(str(value))
    return ' '.join(html.unescape(' '.join(parser.parts)).split())

def get(url, limit=25_000_000):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in {'en.wikipedia.org','commons.wikimedia.org','upload.wikimedia.org','thumb.wikimedia.org'}:
        raise ValueError('Unexpected source host: ' + url)
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=40) as response:
        final = urllib.parse.urlparse(response.url)
        if final.scheme != 'https' or final.hostname not in {'en.wikipedia.org','commons.wikimedia.org','upload.wikimedia.org','thumb.wikimedia.org'}:
            raise ValueError('Unexpected redirected source host')
        body = response.read(limit+1)
        if len(body)>limit:
            raise ValueError('Source exceeds download limit')
        return body

def api(base, **params):
    payload = json.loads(get(base+'?'+urllib.parse.urlencode({'action':'query','format':'json','formatversion':2,**params})))
    if 'error' in payload: raise ValueError(str(payload['error']))
    return payload

def license_details(metadata):
    field = lambda key: plain(metadata.get(key,{}).get('value',''))
    name = field('LicenseShortName')
    url = html.unescape(metadata.get('LicenseUrl',{}).get('value','')).strip()
    copyrighted = field('Copyrighted').lower()
    if re.search(r'non.?commercial|no.?deriv|\bNC\b|\bND\b|GFDL', name, re.I):
        raise ValueError('Unsupported or restricted license: '+name)
    match = re.fullmatch(r'CC BY(-SA)? (1\.0|2\.0|2\.5|3\.0|4\.0)',name)
    if match:
        kind = 'by-sa' if match[1] else 'by'
        expected = f'https://creativecommons.org/licenses/{kind}/{match[2]}/'
        if url.replace('http://','https://').rstrip('/') != expected.rstrip('/'):
            raise ValueError('License name and canonical URL do not agree')
        if not field('Artist') or field('Artist').lower().startswith('unknown'):
            raise ValueError('Attribution-required image has no recorded creator')
        return {'name':name,'url':expected,'code':f'CC-{kind.upper()}-{match[2]}','attributionRequired':True}
    cc0_url = urllib.parse.urlparse(url.replace('http://','https://'))
    if name == 'CC0' and cc0_url.hostname == 'creativecommons.org' and re.fullmatch(r'/publicdomain/zero/1\.0/?(?:deed(?:\.[a-z-]+)?|legalcode(?:\.[a-z-]+)?)?/?',cc0_url.path):
        return {'name':'CC0 1.0','url':'https://creativecommons.org/publicdomain/zero/1.0/','code':'CC0-1.0','attributionRequired':False}
    if name.lower() == 'public domain' and copyrighted == 'false':
        return {'name':'Public domain','url':None,'code':'Public-Domain','attributionRequired':False}
    raise ValueError('License needs manual review: '+name)

def import_one(entry, stage, cache, originals=False):
    fingerprint=hashlib.sha256(json.dumps(entry,sort_keys=True).encode()).hexdigest()
    cached_record=cache/(entry['id']+'.record.json')
    if cached_record.exists():
        saved=json.loads(cached_record.read_text())
        image=cache/(entry['id']+'.webp')
        receipt=cache/(entry['id']+'.source.json')
        if image.exists() and receipt.exists() and hashlib.sha256(image.read_bytes()).hexdigest()==saved['record']['sha256']:
            source_page=json.loads(receipt.read_text())['response']['query']['pages'][0]
            same_pinned_source=(entry.get('commonsFile')==source_page['title'] and saved['record']['personId']==entry['personId'] and saved['record']['id']==entry['id'])
            if saved.get('fingerprint')!=fingerprint and not same_pinned_source:
                return import_fresh(entry,stage,cache,originals,fingerprint)
            raw=source_page['imageinfo'][0]['extmetadata']
            checked=license_details(raw)
            if checked['code']==saved['record']['license']['code']:
                shutil.copy2(image,stage/image.name)
                shutil.copy2(receipt,stage/receipt.name)
                return saved['record']
    return import_fresh(entry,stage,cache,originals,fingerprint)

def import_fresh(entry,stage,cache,originals,fingerprint):
    cached_record=cache/(entry['id']+'.record.json')
    title = entry.get('commonsFile')
    if not title:
        data = api(WIKIPEDIA, titles=entry['wikipediaTitle'], redirects=1, prop='pageimages', piprop='name', pilicense='free')
        pages = data.get('query',{}).get('pages',[])
        title = pages[0].get('pageimage') if pages else None
        if not title: raise ValueError('No freely licensed lead picture; choose a Commons file manually')
    title = title if title.startswith('File:') else 'File:'+title
    receipt = api(COMMONS,titles=title,prop='imageinfo',iiprop='url|extmetadata|size|sha1',iiurlwidth=640,iiurlheight=800,iiextmetadatalanguage='en')
    pages = receipt.get('query',{}).get('pages',[])
    info = pages[0].get('imageinfo',[None])[0] if pages else None
    if not info: raise ValueError('Picture is not available on Commons')
    (cache/(entry['id']+'.unverified-source.json')).write_text(json.dumps({'fingerprint':fingerprint,'response':receipt},indent=2)+'\n')
    metadata = info.get('extmetadata',{})
    license_record = license_details(metadata)
    field = lambda key: plain(metadata.get(key,{}).get('value',''))
    source = info['descriptionurl']
    if urllib.parse.urlparse(source).hostname != 'commons.wikimedia.org': raise ValueError('Unexpected description host')
    license_record['url'] = license_record['url'] or source+'#Licensing'
    download_url = info['url'] if originals else info.get('thumburl') or info['url']
    original = get(download_url)
    with Image.open(io.BytesIO(original)) as opened:
        if getattr(opened,'n_frames',1) != 1: raise ValueError('Animated portraits are not supported')
        if opened.width*opened.height>30_000_000: raise ValueError('Image dimensions exceed import limit')
        image = ImageOps.exif_transpose(opened)
        image.thumbnail((640,800),Image.Resampling.LANCZOS)
        image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
        if min(image.size)<180: raise ValueError('Portrait is too small for identification')
        target = stage/(entry['id']+'.webp')
        image.save(target,'WEBP',quality=84,method=6)
        width,height=image.size
    timestamp=datetime.now(timezone.utc).isoformat()
    record = {
        'id':entry['id'],'personId':entry['personId'],'file':entry['id']+'.webp',
        'title':field('ObjectName') or title.removeprefix('File:'),
        'creator':field('Artist') or 'Creator not recorded by source',
        'credit':field('Credit'),'attribution':field('Attribution'),
        'sourceUrl':source,'originalUrl':info['url'],'downloadUrl':download_url,
        'license':license_record,'changes':'Resized, orientation corrected where needed, and converted to WebP; no additional crop or generative edits.',
        'restrictions':field('Restrictions'),'verifiedAt':timestamp,'width':width,'height':height,
        'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
        'sourceSha256':hashlib.sha256(original).hexdigest(),'commonsSha1':info.get('sha1',''),
    }
    (stage/(entry['id']+'.source.json')).write_text(json.dumps({'retrievedAt':timestamp,'api':COMMONS,'response':receipt},indent=2)+'\n')
    for path in [target,stage/(entry['id']+'.source.json')]: shutil.copy2(path,cache/path.name)
    cached_record.write_text(json.dumps({'fingerprint':fingerprint,'record':record},indent=2)+'\n')
    return record

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--roster',type=Path,default=ROOT/'scripts/data/portrait-roster.json')
    parser.add_argument('--cache-dir',type=Path,default=Path('/tmp/somewhere-portrait-import-cache'))
    parser.add_argument('--originals',action='store_true',help='Download the original source files instead of the thumbnail CDN')
    args=parser.parse_args()
    args.cache_dir.mkdir(parents=True,exist_ok=True)
    roster=json.loads(args.roster.read_text())
    if len(roster)!=80 or len({r['id'] for r in roster})!=80 or len({r['personId'] for r in roster})!=80:
        raise SystemExit('The roster must have 80 unique records and people')
    with tempfile.TemporaryDirectory(prefix='somewhere-portraits-') as temp:
        stage=Path(temp)
        records=[]
        errors=[]
        for i,entry in enumerate(roster):
            try:
                records.append(import_one(entry,stage,args.cache_dir,args.originals))
                print(f'{i+1}/80 verified: {entry["id"]} ({entry["wikipediaTitle"]})',flush=True)
            except Exception as error:
                errors.append((entry['id'],str(error)))
                print(f'{i+1}/80 NEEDS REVIEW: {entry["id"]}: {error}',flush=True)
                # A denied proxy is an environment prerequisite, not 79 more requests to retry.
                if '403 Forbidden' in str(error) and 'Tunnel connection failed' in str(error): break
            time.sleep(.3)
        if errors or len(records)!=80:
            raise SystemExit('No files published. Resolve source/license issues and rerun: '+json.dumps(errors))
        manifest={'version':1,'images':records}
        (stage/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
        credits=['# Identify Me — image credits','',
          'Each image retains the license shown below. The app code is not relicensed by these image licenses.',
          'Public figures are shown for identification; no endorsement is implied. Source licensing snapshots accompany each image.','']
        for record in records:
            credits += [f'## {record["id"]}: {record["title"]}',
              f'- Creator: {record["creator"]}',f'- Source: {record["sourceUrl"]}',
              f'- License: {record["license"]["name"]} ({record["license"]["url"]})',
              f'- Credit: {record["credit"]}',f'- Additional attribution: {record["attribution"]}',
              f'- Changes: {record["changes"]}',f'- Verified: {record["verifiedAt"]}', '']
        (stage/'CREDITS.md').write_text('\n'.join(line.rstrip() for line in credits))
        destination=ROOT/'public/portraits'
        destination.mkdir(exist_ok=True)
        # All 80 source/license checks succeeded before any asset is copied into the public pack.
        for path in stage.iterdir(): shutil.copy2(path,destination/path.name)
        print('Published 80 portraits, license receipts, manifest and credits. Review a contact sheet before deploying.')

if __name__=='__main__': main()
