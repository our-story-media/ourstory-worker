// var uploaddir = "/.tmp/";
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
        fs.mkdirsSync(path.normalize(__dirname + '/../upload/'));
        fs.mkdirsSync(path.normalize(__dirname + '/../upload/transcode/upload/'));
        
    }

    TranscodeHandler.prototype.work = function (job, callback) {

        try {

            var inputpath = path.normalize(__dirname + '/../upload/' + job.input);
            var outputpath = path.normalize(__dirname + '/../upload/transcode/upload/' + job.output);

            logger.info("Transcode Started: " + inputpath + " -> " + outputpath);

            if (!fs.existsSync(inputpath))
            {
                throw "Input file does not exist";
            }

            // //console.log(os.platform());
            if (os.platform() == "win32") {
                process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg.exe');
                process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe.exe');
            }
            else {
                process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg');
                process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe');
            }


            var command = ffmpeg(inputpath);
            command.videoCodec('libx264');
            command.outputOptions('-g 7');
            command.fps(15);
            command.size('240x?');
            command.audioChannels(1);
            command.on('progress',function(progress){
                console.log(progress.percent + '% done')
            });
            command.on('error',function(err){
                winston.error(err);
                callback('bury');
            });
            command.on('end',function(stdout,stderr){
                // winston.error(stderr);
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