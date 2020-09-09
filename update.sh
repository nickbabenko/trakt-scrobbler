#!/bin/bash

docker build -t nickbabenko/trakt-scrobbler:latest .
sudo docker push nickbabenko/trakt-scrobbler:latest