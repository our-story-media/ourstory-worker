# Our Story Work Server

This nodejs application provides a scalable platform to perform synchronus jobs submitted by a Bootlegger Server. It pulls jobs from a Beanstalkd queue, and has handlers for the following:

- Editing
- Dropbox Sync

# Docker Usage

Use `docker-compose up` to start an instance of the server. This is setup to assume you are already running the `server-app` stack, as it connects to the same mongo and beanstalk instances.

# Dependencies

`These should match the details in your bootlegger configuration`

- NodeJS ~ 0.12
- Beanstalkd
- Mongodb
- Amazon S3 credentials

# Development

Copy `local.example.js` to `local.js` and edit appropriatly

Use the docker-compose file included by running `docker-compose up`. If you are developing Bootlegger Server on the same docker machine, then they will be in the same infrastructure.

# Error Codes

**600** - Edit failed\
**601** - Less than min clips provided

**700** - Dropbox sync cannot load directory structure\
**701** - General dropbox sync error

**702** - Error processing files during sync\
**800** - Error during audio sync processing

---

![](platform.png)

Bootlegger is an open source suite of tools developed by [Open Lab](http://openlab.ncl.ac.uk) that enables community commissioning and contribution of video. See [the website]( https://bootlegger.tv/platform) for more information.

*Copyright Newcastle University 2016*