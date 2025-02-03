#/bin/sh

cd ./extensions/cxx_debugging
if [ "$1" = "prod" ]; then
  ./tools/bootstrap.py -no-check -splitdwarf -pubnames -gdwarf5 ../../out
else
  ./tools/bootstrap.py -no-check -debug ../../out
fi
