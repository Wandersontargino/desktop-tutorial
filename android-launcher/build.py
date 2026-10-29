#!/usr/bin/env python3
"""Compile with official SDK; CI never receives the original signing key."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
NAMESPACE = '{http://schemas.android.com/apk/res/android}'

def run(command, env=None, capture=False):
    return subprocess.run([str(v) for v in command], check=True, env=env, text=True,
                          stdout=subprocess.PIPE if capture else None,
                          stderr=subprocess.STDOUT if capture else None)

def build(sdk, unsigned_only, signing_dir):
    from sign import sign_apk
    manifest = ET.parse(ROOT/'project/AndroidManifest.xml').getroot()
    version, code = manifest.get(NAMESPACE+'versionName'), manifest.get(NAMESPACE+'versionCode')
    platform = manifest.find('uses-sdk').get(NAMESPACE+'targetSdkVersion')
    tools = sdk/'build-tools/36.0.0'
    android = sdk/('platforms/android-'+platform+'/android.jar')
    if not (tools/'aapt2').is_file() or not android.is_file():
        raise RuntimeError('Install official Android platform '+platform+' and Build Tools 36.0.0.')
    build_dir = ROOT/'build'
    if build_dir.exists(): shutil.rmtree(build_dir)
    for name in ['classes','dex','gen']: (build_dir/name).mkdir(parents=True, exist_ok=True)
    output = ROOT/'output'; output.mkdir(exist_ok=True)
    env = os.environ.copy()
    env['LD_LIBRARY_PATH'] = str(tools/'lib64') + (':'+env['LD_LIBRARY_PATH'] if env.get('LD_LIBRARY_PATH') else '')
    run([tools/'aapt2','compile','--dir',ROOT/'project/res','-o',build_dir/'resources.zip'],env)
    run([tools/'aapt2','link','-o',build_dir/'unsigned.apk','--manifest',ROOT/'project/AndroidManifest.xml',
         '-A',ROOT/'project/assets','-I',android,'--java',build_dir/'gen','--min-sdk-version','26','--target-sdk-version',platform,build_dir/'resources.zip'],env)
    sources = sorted((ROOT/'project/src').rglob('*.java'))+sorted((build_dir/'gen').rglob('*.java'))
    run(['java','--module','jdk.compiler/com.sun.tools.javac.Main','-source','8','-target','8',
         '-bootclasspath',str(android)+os.pathsep+str(tools/'core-lambda-stubs.jar'),'-encoding','UTF-8','-d',build_dir/'classes',*sources],env)
    run(['java','-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--lib',android,
         '--min-api','26','--output',build_dir/'dex',*sorted((build_dir/'classes').rglob('*.class'))],env)
    with zipfile.ZipFile(build_dir/'unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as apk:
        for dex in sorted((build_dir/'dex').glob('*.dex')): apk.write(dex,dex.name)
    installer = output/('Eleitoral-Para-Android-'+version+'-unsigned.apk')
    run([tools/'zipalign','-f','4',build_dir/'unsigned.apk',installer],env)
    run([tools/'zipalign','-c','4',installer],env)
    badging = run([tools/'aapt2','dump','badging',installer],env,capture=True).stdout
    assert "package: name='br.com.analiseeleitoralpara' versionCode='"+code+"' versionName='"+version+"'" in badging
    assert "minSdkVersion:'26'" in badging and "targetSdkVersion:'"+platform+"'" in badging
    assert "uses-permission: name='android.permission.INTERNET'" in badging
    assert "uses-permission: name='android.permission.ACCESS_NETWORK_STATE'" in badging
    assert 'application-debuggable' not in badging
    assert 'br.com.analiseeleitoralpara.MainActivity' in badging
    with zipfile.ZipFile(installer) as apk:
        assert 'classes.dex' in apk.namelist()
        assert not any(p.endswith(('.p12','.pfx','.keystore','.sqlite','.db')) for p in apk.namelist())
        assert 'assets/platform/index.html' in apk.namelist() and 'assets/platform/native-device.js' in apk.namelist()
        assert 'assets/platform/vendor/ocr/lang/por.traineddata.gz' in apk.namelist()
        assert 'assets/platform/native-assets.json' in apk.namelist()
    metadata = {'version':version,'version_code':int(code),'package':'br.com.analiseeleitoralpara',
                'minimum_android':'8.0 (API 26)','target_api':int(platform), 'unsigned_sha256':hashlib.sha256(installer.read_bytes()).hexdigest(),
                'permissions':['INTERNET','ACCESS_NETWORK_STATE'], 'embedded_interface':True, 'local_origin':'https://appassets.androidplatform.net/', 'offline_expiry_days':7, 'resource_manifest_dex_alignment_verified':True,'embedded_personal_data':False,'device_tested':False}
    (output/'verification-android-build.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
    shutil.copy2(tools/'lib/apksigner.jar', output/'apksigner.jar')
    if (tools/'NOTICE.txt').is_file(): shutil.copy2(tools/'NOTICE.txt',output/'NOTICE-Android-SDK.txt')
    shutil.copy2(ROOT/'sign.py',output/'sign.py')
    if not unsigned_only:
        if not signing_dir: raise RuntimeError('Supply the original private signing directory.')
        sign_apk(installer,output/'apksigner.jar',signing_dir,output,metadata)
    print(json.dumps(metadata,ensure_ascii=False))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sdk',type=Path,required=True)
    parser.add_argument('--unsigned-only',action='store_true')
    parser.add_argument('--signing-dir',type=Path)
    args=parser.parse_args()
    build(args.sdk.resolve(),args.unsigned_only,args.signing_dir.resolve() if args.signing_dir else None)
