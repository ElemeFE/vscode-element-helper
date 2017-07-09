#!/bin/bash

if [ x$1 != x ];then
  mkdir element-gh-pages
  cd element-gh-pages
  git init
  git remote add -t gh-pages -f origin git@github.com:ElemeFE/element.git
  git checkout gh-pages
else
  cd element-gh-pages
  git branch -D temp
  git checkout -b temp

  git branch -D gh-pages
  git fetch origin gh-pages
  git checkout --track origin/gh-pages
fi
