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

## Profiles

- `original`: produces tagged version in HD from scratch, override width, height and profile to change output dimensions. This profile gets sent to the transcode queue on completion.
- `high`: produces non-tagged HD version from scratch, not pushed onto transcode queue.
- `tagged`: produces tagged HD version based on an existing HD version, not pushed onto transcode queue.
