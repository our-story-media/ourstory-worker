![GitHub tag (latest SemVer)](https://img.shields.io/github/tag/our-story-media/ourstory-worker.svg) ![GitHub](https://img.shields.io/github/license/our-story-media/ourstory-worker.svg) [![Build Status](https://dev.azure.com/ourstorytitan/OurStoryBuilds/_apis/build/status/Indaba%20Worker%20Container%20amd64?branchName=master)](https://dev.azure.com/ourstorytitan/OurStoryBuilds/_build/latest?definitionId=11&branchName=master) 
[![](https://images.microbadger.com/badges/image/bootlegger/ourstory-worker.svg)](https://microbadger.com/images/bootlegger/ourstory-worker "Get your own image badge on microbadger.com")

# Indaba Worker

Headless worker that takes jobs from a queue and performs them:

- Editing
- Video Transcode

## Config

- Override output profile using `edit.profile` (replaces melt command output profile)
- Disable rendering tagged output using `edit.mode` ('original' just renders original (not tagged), otherwise defaults to rendering both)

