![GitHub tag (latest SemVer)](https://img.shields.io/github/tag/our-story-media/ourstory-worker.svg) ![GitHub](https://img.shields.io/github/license/our-story-media/ourstory-worker.svg)
[![CircleCI](https://circleci.com/gh/our-story-media/ourstory-server/tree/rpioutputcontrols.svg?style=svg)](https://circleci.com/gh/our-story-media/ourstory-server/tree/rpioutputcontrols)

# Indaba Worker

Headless worker that takes jobs from a queue and performs them:

- Editing
- Video Transcode

## Config

- Override output profile using `edit.profile` (replaces melt command output profile)
- Disable rendering tagged output using `edit.mode` ('original' just renders original (not tagged), otherwise defaults to rendering both)
- Override output width and height using `edit.width` and `edit.height`.
