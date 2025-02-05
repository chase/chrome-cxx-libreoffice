#/bin/sh

cd ./extensions/cxx_debugging
if [ "$1" = "release" ]; then
  ./tools/bootstrap.py -no-check -static -release ../../out
else
  ./tools/bootstrap.py -no-check -debug ../../out
fi