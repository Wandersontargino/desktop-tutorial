#!/usr/bin/env python3
"""Local-only release signing. Secrets never enter command arguments or logs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import zipfile

EXPECTED_CERT = '89a5cbc6779e3279b5a35c6866ee0f0642433af55d6a18bbdea52b5e362815aa'

def sign_apk(unsigned,signer,signing,output,metadata):
    config_file,keyfile=signing/'config.json',signing/'eleitoral-pa-release.p12'
    if not config_file.is_file() or not keyfile.is_file(): raise RuntimeError('Original signing identity unavailable. No substitute key is generated.')
    config=json.loads(config_file.read_text());env=os.environ.copy();env['APK_STORE_PASS']=config['password']
    output.mkdir(parents=True,exist_ok=True)
    installer=output/('Eleitoral-Para-Android-'+metadata['version']+'.apk')
    command=['java','-jar',str(signer),'sign','--ks',str(keyfile),'--ks-type','PKCS12',
             '--ks-key-alias',config['alias'],'--ks-pass','env:APK_STORE_PASS','--key-pass','env:APK_STORE_PASS',
             '--v1-signing-enabled','true','--v2-signing-enabled','true','--v3-signing-enabled','true',
             '--v4-signing-enabled','false','--out',str(installer),str(unsigned)]
    subprocess.run(command,env=env,check=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    verified=subprocess.run(['java','-jar',str(signer),'verify','--verbose','--print-certs',str(installer)],
                            env=env,check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT).stdout
    match=re.search(r'Signer #1 certificate SHA-256 digest: (\w+)',verified)
    if not match or match.group(1)!=EXPECTED_CERT: installer.unlink(missing_ok=True);raise RuntimeError('Release signing identity does not match previous versions.')
    assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in verified
    assert 'Verified using v3 scheme (APK Signature Scheme v3): true' in verified
    with zipfile.ZipFile(installer) as apk:
        assert 'classes.dex' in apk.namelist() and 'AndroidManifest.xml' in apk.namelist()
        assert not any(p.endswith(('.p12','.json','.csv','.xlsx','.mjs','.sqlite','.db')) for p in apk.namelist())
        payload=b''.join(apk.read(p) for p in apk.namelist())
        assert config['password'].encode() not in payload
        assert b'OAI-Sites-Authorization' not in payload
    result={**metadata,'filename':installer.name,'size_bytes':installer.stat().st_size,
            'apk_sha256':hashlib.sha256(installer.read_bytes()).hexdigest(),'signed':True,
            'signing_certificate_sha256':match.group(1),'signature_v2_verified':True,'signature_v3_verified':True,
            'platform_url':'https://analise-eleitoral-pa.wanderson-targino.chatgpt.site/'}
    (output/'verification-android.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    (output/'apk-signature-verification.txt').write_text(verified)
    print(json.dumps(result,ensure_ascii=False))
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--signer',type=Path,required=True);parser.add_argument('--signing-dir',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True);parser.add_argument('--metadata',type=Path,required=True)
    args=parser.parse_args();sign_apk(args.input.resolve(),args.signer.resolve(),args.signing_dir.resolve(),args.output.resolve(),json.loads(args.metadata.read_text()))
