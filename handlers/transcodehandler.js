// var uploaddir = "/.tmp/";
var path = require('path');
var fs = require('fs-extra');
var ffmpeg = require('fluent-ffmpeg');

module.exports = function (winston) {
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
            // if (os.platform() == "win32") {
            //     process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg.exe');
            //     process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe.exe');
            // }
            // else {
            //     process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg');
            //     process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe');
            // }


            var command = ffmpeg(inputpath);
            command.videoCodec('libx264');
            command.outputOptions('-g 7');
            command.fps(config.OUTPUT_FPS || 15);
            command.size((config.OUTPUT_WIDTH || '480') + 'x?');
            command.audioChannels(config.OUTPUT_CHANNELS || 1);
            command.on('progress',function(progress){
                console.log(progress.percent + '% done')
            });
            command.on('error',function(err){
                winston.error(err);
                callback('bury');
            });
            command.on('end',function(){
                // winston.error(stderr);
                winston.info('Transcode Complete');                
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