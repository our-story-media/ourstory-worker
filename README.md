# Bootlegger Work Server

This nodejs application provides a scalable platform to perform synchronus jobs submitted by a Bootlegger Server. It pulls jobs from a Beanstalkd queue, and has handlers for the following:

- Editing
- Dropbox Sync
- Audio to Video Time Sync

# Dependencies

`These should match the details in your bootlegger configuration`

- NodeJS ~ 0.12
- Beanstalkd
- Mongodb
- Amazon S3 credentials

# Development

Copy `local.example.js` to `local.js` and edit appropriatly (on vagrant only deployments this might not be required)

Run `vagrant up`