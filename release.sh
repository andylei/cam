yarn run build
git checkout master
git pull
cp -f dist/* .
git add -A
git commit -m "release `date '+%Y-%m-%d-%H-%M-%S'`"
