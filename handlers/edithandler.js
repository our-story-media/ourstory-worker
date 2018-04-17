var uploaddir = "/.tmp/";
var ss3 = require('s3');
var path = require('path');
var fs = require('fs-extra');
var ffmpeg = require('fluent-ffmpeg');
var knox = require('knox-s3');
var AWS = require('aws-sdk');
var os = require('os');
var config = require('../config/local.js');
var _ = require('lodash');
var async = require('async');
var ObjectId = require('mongodb').ObjectID;
var child_process = require('child_process');
var touch = require("touch");
var uuid = require('uuid');

var fivebeans = require('fivebeans');

var client;

AWS.config.region = config.S3_REGION;

function chunkString(str, len) {
    var _size = Math.ceil(str.length / len),
        _ret = new Array(_size),
        _offset
        ;

    for (var _i = 0; _i < _size; _i++) {
        _offset = _i * len;
        _ret[_i] = str.substring(_offset, _offset + len);
    }

    return _ret;
}


module.exports = function (winston, thedb) {
    var connection = null;
    //var thedb = null;
    var logger = null;

    function DoEditHandler() {
        process.env.SDL_VIDEODRIVER = 'dummy';
        process.env.SDL_AUDIODRIVER = 'dummy';
        this.type = 'edit';

        fs.mkdirsSync(__dirname + '/..' + uploaddir);
        client = new fivebeans.client(config.BEANSTALK_HOST,config.BEANSTALK_PORT);
        client.on('connect', function()
        {
            // client can now be used
            winston.info('Beanstalk client connected')
        })
        .on('error', function(err)
        {
            // connection failure
        })
        .on('close', function()
        {
            // underlying connection has closed
        })
        .connect();
    }

    function clearOut(edit) {
        if (!config.LOCALONLY) {
            var dir = path.normalize(path.dirname(require.main.filename) + uploaddir);

            // Remove all the lock files for this edit
            _.each(edit.media, function (m) {
                if (m.id) {
                    fs.closeSync(m.lock_file);
                    fs.unlinkSync(m.lock_file_name);
                }
            });

            //2. remove resulting file
            //onsole.log('edit file: ' + edit.tmp_filename);
            if (fs.existsSync(edit.tmp_filename)) {
                //s.unlinkSync(edit.tmp_filename);
            }

            cleanOutAll();
        }
    }

    DoEditHandler.prototype.work = function (edit, callback) {
        edit.files_in_use = [];

        try {
            logger.info("Edit Started: " + edit.id + " / " + edit.code);

            // //console.log(os.platform());
            if (os.platform() == "win32") {
                process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg.exe');
                process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe.exe');
            }
            else {
                process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg');
                process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe');
            }

            //download files from s3
            //join files
            var calls = [];
            var thenewpath = '';

            var dir = path.normalize(path.dirname(require.main.filename) + uploaddir);
            if (config.LOCALONLY)
                //volume map to the same location as the uploads dir on the disk...
                dir = path.normalize(path.dirname(require.main.filename) + '/uploads');

            if (edit.media.length < config.MIN_CLIP_COUNT) {
                logger.error("Less than " + config.MIN_CLIP_COUNT + " clips.");
                var collection = thedb.collection('edits');
                var err_obj = {
                    code: 601,
                    reason: 'Less than ' + config.MIN_CLIP_COUNT + ' clips'
                };
                collection.update({ code: edit.code }, { $set: { fail: true, failreason: 'Less than ' + config.MIN_CLIP_COUNT + ' clips', error: err_obj }, $unset: { path: "" } }, { w: 1 }, function (err, result) {
                    callback('bury');
                });
            }
            else {
                //download                
                _.each(edit.media, function (m, index) {
                    if (m.id) {
                        calls.push(function (cb) {
                            var media = m;

                            if (config.LOCALONLY) {
                                //assume the file is already there (as its local)
                                return cb();
                            }

                            //if there is a file lock, then change the name of the local file we are using
                            var localfile = path.normalize(dir + "/" + media.path.replace(config.S3_CLOUD_URL, '').replace(config.master_url + '/media/preview/', ''));

                            //create lock
                            // touch.sync(localfile + '.lock');
                            edit.files_in_use.push(localfile);

                            //if no file
                            var lockfile = localfile + '.' + uuid() + '.lock';
                            edit.media[index].lock_file = fs.openSync(lockfile, 'w');
                            edit.media[index].lock_file_name = lockfile;
                            if (fs.existsSync(localfile)) {
                                //edit.media[index].file_handle = fs.openSync(localfile,'r');
                                logger.info("Using Cache: " + localfile);
                                //update file with last time it was accessed
                                touch.sync(localfile);
                                cb();
                            }
                            else {
                                var uuid_tmp = uuid();


                                //download from s3
                                var s3 = ss3.createClient({
                                    s3Options: {
                                        accessKeyId: config.AWS_ACCESS_KEY_ID,
                                        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                                        region: config.S3_REGION
                                    },
                                });

                                var params = {
                                    localFile: localfile + '_' + uuid_tmp + '.part',
                                    s3Params: {
                                        Bucket: config.S3_BUCKET,
                                        Key: "upload/" + media.path.replace(config.S3_CLOUD_URL, '').replace(config.master_url + '/media/preview/', '')
                                    },
                                };

                                //console.log(params);
                                logger.info('Downloading: ' + localfile);
                                var downloader = s3.downloadFile(params);

                                downloader.on('error', function (err) {
                                    //console.log("s3 error "+err);
                                    cb(err.toString());
                                    //release file lock
                                    //fs.unlink(localfile + '.lock');
                                });
                                downloader.on('end', function () {
                                    try {
                                        // console.log('renaming ' + uuid_tmp + '_' + localfile + '.part to' localfile);
                                        fs.renameSync(localfile + '_' + uuid_tmp + '.part', localfile);
                                    }
                                    catch (e) {
                                        logger.info('Download thrown away ' + localfile + '_' + uuid_tmp + '.part');
                                        fs.unlinkSync(localfile + '_' + uuid_tmp + '.part');
                                    }

                                    //edit.media[index].file_handle = fs.openSync(localfile,'r');
                                    touch.sync(localfile);
                                    cb();
                                });
                            }

                        });
                    }
                });

                calls.push(function (cb) {

                    // //FOR DEBUGGING
                    //return cb(null);

                    //OUTPUT:

                    var videoFilename = path.normalize(path.dirname(require.main.filename) + uploaddir + edit.code + '.' + uuid() + ".edit.mp4");
                    if (config.LOCALONLY)
                        videoFilename = path.normalize(path.dirname(require.main.filename) + '/uploads/' + edit.code + '.' + uuid() + ".edit.mp4");

                    edit.tmp_filename = videoFilename;

                    //TESTING:
                    var testcommand = [];

                    testcommand.push('colour:black out=15');

                    _.each(edit.media, function (m) {
                        if (m.id) //if video:
                        {
                            var footagefilename = path.normalize(dir + "/" + m.path.replace(config.S3_CLOUD_URL, ''));
                            testcommand.push(footagefilename);

                            if (m.inpoint)
                                testcommand.push('in="' + m.inpoint + '"');
                            if (m.outpoint && m.outpoint != "00:00:00")
                                testcommand.push('out="' + m.outpoint + '"');
                            testcommand.push("-mix 10");
                            testcommand.push("-mixer luma");

                            //TODO: add audio track if this video item has audio data within it...

                        }
                        else //if title:
                        {
                            var txt = m.titletext;
                            var words = _.chunk(_.split(txt, ' '), 4);
                            // console.log(words);
                            var lines = _.map(words, (w) => {
                                return _.join(w, ' ');
                            });
                            // console.log(lines);
                            var chunked = _.join(lines, '~');
                            // console.log(chunked);
                            testcommand.push('"+' + chunked + '.txt"');
                            testcommand.push('fgcolor=0xffffffff');
                            testcommand.push('bgcolor=0x000000ff');
                            // testcommand.push('force_aspect_ratio=1.77');                            

                            testcommand.push('size=500');
                            testcommand.push('align=centre');
                            // testcommand.push('width_fit=1');             
                            testcommand.push('pad=600');
                            // testcommand.push('out="'+m.outpoint+'"');
                            testcommand.push('out=90'); //3 seconds:
                            testcommand.push("-mix 10");
                            testcommand.push("-mixer luma");
                        }
                    });

                    testcommand.push('colour:black out=15 -mix 10 -mixer luma');

                    testcommand.push('-progress');
                    testcommand.push('-consumer avformat:' + videoFilename + " width=1920 height=1080 strict=experimental");// b=3000 frag_duration=30");

                    logger.info('Editing. Please be Patient!');

                    var lastprogress = 0;

                    var exec = require('child_process').exec;
                    //var ls = spawn('melt',testcommand,{stdio:[null,null,'pipe']});
                    console.log('melt ' + testcommand.join(' '));
                    var child = exec('melt ' + testcommand.join(' '), { maxBuffer: 1024 * 1024 }, function (err, o, e) {
                        logger.info('Done Editing');
                        if (err)
                            logger.error(err);
                        //cb(code!=0);
                    });

                    child.stdout.on('data', function (data) {
                        logger.info('' + data);
                        //console.log("stdout: "+data);
                    });
                    child.stderr.on('data', function (data) {
                        console.log('' + data);
                        var re = /percentage:\s*(\d*)/;
                        var perc = re.exec(data);

                        if (perc) {
                            if (perc && perc[1] != lastprogress) {
                                //update db if progress changed:
                                lastprogress = perc[1];
                                var collection = thedb.collection('edits');
                                collection.update({ code: edit.code }, { $set: { progress: lastprogress } }, { w: 1 }, function (err, result) {
                                    //done collection update
                                });
                            }
                        }
                    });
                    child.on('error', function (data) {
                        logger.error('' + data);

                        cb(data);
                    });
                    child.on('close', function (code) {
                        logger.info('MLT closing code: ' + code);
                        // console.log("edit return code " + code);
                        //sucess!
                        //fs.renameSync(edit.)
                        if (code != 0)
                            cb("MLT FAIL");
                        else
                            cb();
                        
                    });
                });

                //upload to s3
                calls.push(function (cb) {
                    // //FOR DEBUGGING
                    //return cb(null);

                    if (config.LOCALONLY) {
                        //copy the file to the right location:
                        fs.moveSync(edit.tmp_filename, path.normalize(__dirname + '/upload/' + edit.code + ".mp4"));
                        console.log('Local file moved');
                    }
                    else {
                        var knox_params = {
                            key: config.AWS_ACCESS_KEY_ID,
                            secret: config.AWS_SECRET_ACCESS_KEY,
                            bucket: config.S3_BUCKET
                        };
                        var client = knox.createClient(knox_params);

                        //   console.log(path.normalize(path.dirname(require.main.filename) + uploaddir + edit.code + ".mp4"));
                        client.putFile(edit.tmp_filename, 'upload/' + edit.code + ".mp4", { 'x-amz-acl': 'public-read' },
                            function (err, result) {
                                //console.log(err);
                                if (err) {
                                    logger.error(err);
                                    cb(err.toString());
                                }
                                else {
                                    logger.info("Uploaded");
                                    cb();
                                }
                            });
                    }
                });

                //TRANSCODE OUPUT:
                calls.push(function (cb) {
                    // FOR DEBUGGING
                    //return cb(null);

                    if (config.LOCALONLY) {
                        //TODO: run to local transcoder:

                        //push new transcode onto queue:s
                        var input = path.normalize(__dirname + '/upload/' + edit.code + ".mp4");
                        var output = path.normalize(__dirname + '/upload/transcode/upload/' + edit.code + ".mp4");
                        var payload = {
                            input:input,
                            output:output
                        };

                        client.use("edits", function (err, tubename) {
                            client.put(10, 0, 1000000000, JSON.stringify(['edits', { type: 'transcode', payload: payload }]), function (err, jobid) {
                                if (!err)
                                    winston.info("Transcode submitted");
                                else
                                    winston.error(err);

                                cb();
                            });
                        });

                        
                    }
                    else {

                        AWS.config.update({ accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY });
                        var elastictranscoder = new AWS.ElasticTranscoder();
                        elastictranscoder.createJob({
                            PipelineId: config.ELASTIC_PIPELINE,
                            //InputKeyPrefix: '/upload',
                            OutputKeyPrefix: 'upload/',
                            Input: {
                                Key: 'upload/' + edit.code + '.mp4',
                                FrameRate: 'auto',
                                Resolution: 'auto',
                                AspectRatio: 'auto',
                                Interlaced: 'auto',
                                Container: 'auto'
                            },
                            Output: {
                                Key: edit.code + '.mp4',
                                //CreateThumbnails:true,
                                ThumbnailPattern: edit.code + '-{count}',
                                PresetId: config.TRANSCODE_PRESET, // specifies the output video format
                                Rotate: 'auto',
                                Watermarks: [
                                    {
                                        "InputKey": "logos/logo.png",
                                        "PresetWatermarkId": "BottomRight"
                                    }]
                            }
                        }, function (error, data) {
                            // handle callback 

                            //console.log(data);
                            // console.log('transcode submitted');
                            if (error) {
                                logger.error(error);
                                cb(error.toString());
                            }
                            else {
                                logger.info("Transcode submitted");
                                cb();
                            }
                        });
                    }
                });

                //console.log(calls);

                async.series(calls, function (err) {

                    try {
                        clearOut(edit);
                    }
                    catch (e) {
                        console.log(e);
                    }

                    if (err) {
                        edit.failed = true;
                        //delete edit.code;
                        logger.error("Editing Failed");
                        logger.error(err);
                        //update edit record
                        var collection = thedb.collection('edits');
                        var err_obj = {
                            code: 600,
                            reason: err
                        };
                        collection.update({ code: edit.code }, { $set: { failed: true, failreason: err, error: err_obj }, $unset: { path: "" } }, { w: 1 }, function (err, result) {
                            //done update...
                            logger.error(err);
                            callback('bury');
                        });
                    }
                    else {
                        logger.info("Editing Done");
                        edit.path = edit.shortlink + '.mp4';

                        var collection = thedb.collection('edits');
                        collection.update({ code: edit.code }, { $set: { path: edit.path }, $unset: { failed: false, failereason: false, error: false } }, { w: 1 }, function (err, result) {
                            //done update...
                            if (err) logger.error(err);
                            //logger.info(result);
                            callback('success');
                        });
                    }
                });
            }
        }
        catch (e) {
            logger.error(e);
            callback('bury');
        }
    }

    var handler = new DoEditHandler();
    logger = winston;
    logger.info("Starting Edit Handler");
    return handler;
};