var uploaddir = "/.tmp/";
var path = require('path');
var fs = require('fs-extra');
var ffmpeg = require('fluent-ffmpeg');
var os = require('os');
var config = require('../config/local.js');
var _ = require('lodash');
var async = require('async');
var ObjectId = require('mongodb').ObjectID;
var child_process = require('child_process');
var touch = require("touch");
var uuid = require('uuid');

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

    function TranscodeHandler() {
        this.type = 'transcode';
        fs.mkdirsSync(__dirname + '/..' + uploaddir);
    }

    TranscodeHandler.prototype.work = function (job, callback) {
        edit.files_in_use = [];

        try {
            logger.info("Transcode Started: " + job.input + " -> " + job.output);

            // //console.log(os.platform());
            if (os.platform() == "win32") {
                process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg.exe');
                process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe.exe');
            }
            else {
                process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg');
                process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe');
            }


            var inputpath = path.normalize(__dirname + '/upload/' + job.input);
            var outputpath = path.normalize(__dirname + '/upload/transcode/upload/' + job.output);

            var command = ffmpeg();
            command.input(inputpath);
            command.videoCodec('libx264');
            command.videoBitrate('1000k');
            command.size('320x?');
            command.on('progress',function(progress){
                console.log(progress.percent + '% done')
            });
            command.on('end',function(stdout,stderr){
                winston.error(stderr);
                callback('success');
            })
            .save(outputpath);
        }
        catch (e) {
            logger.error(e);
            callback('bury');
        }
    }

    var handler = new TranscodeHandler();
    logger = winston;
    logger.info("Starting Transcode Handler");
    return handler;
};