#!/usr/bin/env python3
#
# Copyright 2020 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.
"""
Used to download a pre-built version of emscripten for running e2e tests
testing DevTools with emscripten generated Wasm binaries.
"""

import argparse
import os
import platform
import sys
import tarfile
import urllib.request
import zipfile
import subprocess

BS = 8192
STAMP_FILE = 'build-revision'
DOWNLOAD_URL = "https://storage.googleapis.com/webassembly/emscripten-releases-builds/%s/%s/wasm-binaries%s.%s"


def check_stamp_file(options, url):
    file_name = os.path.join(options.dest, STAMP_FILE)
    if not os.path.isfile(file_name):
        return False
    with open(file_name) as f:
        return url == f.read().strip()


def write_stamp_file(options, url):
    with open(os.path.join(options.dest, STAMP_FILE), 'w') as f:
        return f.write(url)

# http://stackoverflow.com/questions/600268/mkdir-p-functionality-in-python
def mkdir_p(path):
  try:
    os.makedirs(path)
  except OSError:
    if not os.path.isdir(path):
      raise

def is_nonempty_directory(path):
  if not os.path.isdir(path):
    return False
  return len(os.listdir(path)) != 0

def run(cmd, cwd=None, quiet=False):
  process = subprocess.Popen(cmd, cwd=cwd, env=os.environ.copy())
  process.communicate()
  if process.returncode != 0 and not quiet:
    raise Exception(str(cmd) + ' failed with error code ' + str(process.returncode) + '!')
  return process.returncode


# http://pythonicprose.blogspot.fi/2009/10/python-extract-targz-archive.html
def untar(source_filename, dest_dir):
  print("Unpacking '" + source_filename + "' to '" + dest_dir + "'")
  mkdir_p(dest_dir)
  returncode = run(['tar', '-xf', source_filename, '--strip', '1'], cwd=dest_dir)
  # tfile = tarfile.open(source_filename, 'r:gz')
  # tfile.extractall(dest_dir)
  return returncode == 0

def unzip(os_name, file, dest):
    is_zip = os_name == 'win'
    if is_zip:
        z = zipfile.ZipFile(file)
        z.extractall(path=dest)
    else:
        untar(file, dest)

def script_main(args):
    parser = argparse.ArgumentParser(description='Download Emscripten')
    parser.add_argument('tag', help='emscripten tag')
    parser.add_argument('dest', help='destination directory')
    options = parser.parse_args(args)

    if not os.path.isdir(options.dest):
        os.makedirs(options.dest)

    os_name = {
        'Linux': 'linux',
        'Windows': 'win',
        'Darwin': 'mac'
    }[platform.system()]

    arch_suffix = ''
    host_arch = platform.machine().lower()
    if host_arch == 'arm64' or host_arch.startswith('aarch64'):
        arch_suffix = '-arm64'

    file_extension = 'zip' if os_name == 'win' else 'tar.xz'

    url = DOWNLOAD_URL % (os_name, options.tag, arch_suffix, file_extension)

    if check_stamp_file(options, url):
        return 0

    try:
        filename, _ = urllib.request.urlretrieve(url)

        unzip(os_name, filename, options.dest)

        write_stamp_file(options, url)
    except Exception as e:
        sys.stderr.write('Error Downloading URL "{url}": {e}\n'.format(url=url,
                                                                       e=e))
        return 1
    finally:
        urllib.request.urlcleanup()


if __name__ == '__main__':
    sys.exit(script_main(sys.argv[1:]))
