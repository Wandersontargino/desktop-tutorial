#!/usr/bin/env python3
"""Build test-only instrumentation. CI keys and fixtures never enter release output."""
import argparse
import os
from pathlib import Path
import subprocess
import zipfile
from build import ROOT,run
p=argparse.ArgumentParser();p.add_argument('--sdk',type=Path,required=True);args=p.parse_args()
sdk=args.sdk;tools=sdk/'build-tools/36.0.0';android=sdk/'platforms/android-36/android.jar';temp=ROOT/'build/device-tests'
for name in ['classes','dex','resources']: (temp/name).mkdir(parents=True,exist_ok=True)
env=os.environ.copy();env['LD_LIBRARY_PATH']=str(tools/'lib64')
run([tools/'aapt2','link','-o',temp/'test.apk','--manifest',ROOT/'tests/AndroidManifest.xml','-I',android],env)
run(['javac','-source','8','-target','8','-bootclasspath',android,'-encoding','UTF-8','-d',temp/'classes',*sorted((ROOT/'tests/src').rglob('*.java'))],env)
run(['java','-cp',tools/'lib/d8.jar','com.android.tools.r8.D8','--lib',android,'--min-api','26','--output',temp/'dex',*sorted((temp/'classes').rglob('*.class'))],env)
with zipfile.ZipFile(temp/'test.apk','a',compression=zipfile.ZIP_DEFLATED) as out:
    for path in (temp/'dex').glob('*.dex'):out.write(path,path.name)
# One disposable identity for instrumentation and target, unrelated to the release identity.
run(['keytool','-genkeypair','-keystore',temp/'ci-only.p12','-storepass','synthetic-ci-only','-alias','synthetic','-keyalg','RSA','-keysize','2048','-validity','1','-dname','CN=Synthetic CI only'],env)
unsigned=next((ROOT/'output').glob('*-unsigned.apk'))
for source,name in [(unsigned,'target-ci.apk'),(temp/'test.apk','checks-ci.apk')]:
    aligned=temp/(name+'.aligned');run([tools/'zipalign','-f','4',source,aligned],env)
    run([tools/'apksigner','sign','--ks',temp/'ci-only.p12','--ks-pass','pass:synthetic-ci-only','--out',temp/name,aligned],env)
print('Synthetic emulator packages prepared separately from release output.')
