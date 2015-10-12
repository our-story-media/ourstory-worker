var uploaddir = "/upload/";
var ss3 = require('s3');
var path = require('path');
var fs = require('fs');
var ffmpeg = require('fluent-ffmpeg');
var knox = require('knox');
var AWS = require('aws-sdk');
var os = require('os');
var config = require('./local.js');
AWS.config.region = config.S3_REGION;
var _ = require('lodash');
var async = require('async');
var MongoClient = require('mongodb').MongoClient;
var PythonShell = require('python-shell');

var MLT = require('mlt');
var child_process = require('child_process');

var mlt = new MLT
      , multitrack = new MLT.Multitrack
      , tractor = new MLT.Tractor
      , transitionTime = 25
      , showTime = 100 + transitionTime * 2
      , mltFilename = './test.mlt';

var totallength = 200;

module.exports = function(winston)
{
    var connection = null;
    var thedb = null;
    var logger = null;
    function DoEditHandler()
    {
        
        process.env.SDL_VIDEODRIVER = 'dummy';
        process.env.SDL_AUDIODRIVER = 'dummy';

        this.type = 'edit';
        connection = 'mongodb://'+((config.db_user != '') ? (config.db_user + ':' + config.db_password + '@'):'')  + config.db_host + ':' + config.db_port + '/' + config.db_database;
      
      //console.log('mongodb://'+config.db_user+':'+config.db_password+'@'+config.db_host+':'+config.db_port+'/'+config.db_database);
        MongoClient.connect(connection, function(err, db) {
           // MongoClient.connect('mongodb://localhost/bootlegger', function(err, db) {
            if(err) throw err;
            thedb = db;
          });
    }

    DoEditHandler.prototype.work = function(edit, callback)
    {
        
        try
        {
            logger.info("Edit Started: "+edit.id + " / "+edit.code);

            // //console.log(os.platform());
            if (os.platform()=="win32")
            {
                process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg.exe');
                process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe.exe');
            }
            else
            {
                process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg');
                process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe');
            }

            //download files from s3
            //console.log(edit.media);
            //join files
            var calls = [];
            var thenewpath = '';

            var dir = path.normalize(path.dirname(require.main.filename) + uploaddir);

            if (edit.media.length<2 || edit.media.length>6)
            {
                logger.error("Less than 2 clips.");
                callback('bury');
            }
            else
            {
                //download
                _.each(edit.media,function(m){
                    calls.push(function(cb){
                        var media = m;
                        //download from s3
                        var s3 = ss3.createClient({
                            s3Options: {
                              accessKeyId: config.AWS_ACCESS_KEY_ID,
                              secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                              region: config.S3_REGION
                            },
                          });

                          var params = {
                            localFile: path.normalize(dir+"/"+media.path.replace(config.S3_CLOUD_URL,'')),
                            s3Params: {
                              Bucket: config.S3_BUCKET,
                              Key: "upload/"+media.path.replace(config.S3_CLOUD_URL,'')
                            },
                          };
                          //console.log(params);
                          var downloader = s3.downloadFile(params);

                          downloader.on('error', function(err) {
                            cb(true);
                          });
                          downloader.on('end', function() {             
                            cb();
                          });
                    });
                });

                calls.push(function(cb){
                    var mlt = new MLT
                      , multitrack = new MLT.Multitrack
                      // , tractor = new MLT.Tractor
                      // , transitionTime = 25
                      // , showTime = 100 + transitionTime * 2
                      , mltFilename = path.normalize(path.dirname(require.main.filename) + '/upload/' + edit.code + ".mlt");

                    var playlist = new MLT.Playlist();
                    mlt.push(playlist);

                    _.each(edit.media,function(m){

                        //console.log(m.meta.streams[0].nb_frames + ' frames');

                        var producer = new MLT.Producer.Video({source: path.normalize(dir+"/"+m.path.replace(config.S3_CLOUD_URL,''))})
                        mlt.push(producer);
                        playlist.entry({
                            producer: producer,
                        });
                    });

                    fs.writeFile(mltFilename, mlt.toString({pretty:true}), function (err) {
                      if (err) {
                        return cb(err);
                      }
                      else
                      {
                        logger.info('Finished prepping melt file...');
                        //OUTPUT:
                        var videoFilename = path.normalize(path.dirname(require.main.filename) + '/upload/' +edit.code + ".mp4");

                        //TESTING:
                        var testcommand = [];

                        var paths = _.each(edit.media,function(m)
                        {
                            testcommand.push(path.normalize(dir+"/"+m.path.replace(config.S3_CLOUD_URL,'')));
                            testcommand.push("-mix 15");
                            testcommand.push("-mixer luma");
                        });

                       testcommand.push('-progress');
                       testcommand.push('-consumer avformat:' + videoFilename + " strict=experimental -b 3000 -frag_duration 30");

                        logger.info('Melting. Please be Patient!');
                        
                         //   console.log('melt ' + testcommand.join(' '));


                            var exec = require('child_process').exec;
                            //var ls = spawn('melt',testcommand,{stdio:[null,null,'pipe']});
                            var child = exec('melt ' + testcommand.join(' '),function(err, o,e){
                                logger.info('Done Editing');
                                //cb(code!=0);
                            });
                            //logger.info(ls.stdout);
                            //var child = exec('node ./commands/server.js');
                            
                            child.stdout.on('data', function(data) {
                                logger.info('' + data);
                                console.log("stdout: "+data);
                            });
                            child.stderr.on('data', function(data) {
                                console.log('' + data);
                                console.log("stderr: "+data);
                            });
                            child.on('error', function(data) {
                                logger.error('' + data);
                            });
                            child.on('close', function(code) {
                                logger.info('closing code: ' + code);
                                cb(code!=0);
                            });
                        }
                    });
                });

                //upload to s3
                calls.push(function(cb){
                    var knox_params = {
                        key: config.AWS_ACCESS_KEY_ID,
                        secret: config.AWS_SECRET_ACCESS_KEY,
                        bucket: config.S3_BUCKET
                      };
                      var client = knox.createClient(knox_params);
                      client.putFile(path.normalize(path.dirname(require.main.filename) + '/upload/' +edit.code + ".mp4"), 'upload/' + edit.code + ".mp4", {'x-amz-acl': 'public-read'},
                            function(err, result) {
                                //console.log(err);
                                if (err)
                                {
                                    logger.error(err);
                                    cb(true);
                                }
                                else
                                {
                                    logger.info("Uploaded");
                                    cb();
                                }
                      });

                });

                //TRANSCODE OUPUT:
                calls.push(function(cb){
                    AWS.config.update({accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY});
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
                        Container: 'auto' }, 
                      Output: { 
                        Key: edit.code + '.mp4',
                        //CreateThumbnails:true,
                        ThumbnailPattern: edit.code + '-{count}',
                        PresetId: '1351620000001-000020', // specifies the output video format
                        Rotate: 'auto',
                        Watermarks:[
                        {
                           "InputKey":"logos/logo.png",
                           "PresetWatermarkId":"BottomRight"
                        }]
                    } 
                      }, function(error, data) { 
                        // handle callback 
                       
                        //console.log(data);
                        // console.log('transcode submitted');
                        if (error)
                        {
                            logger.error(error);
                            cb(true);
                        }
                        else
                        {
                            logger.info("Transcode submitted");
                            cb();
                        }
                    });

                });

                //console.log(calls);

                async.series(calls,function(err){
                    if (err)
                    {
                        logger.error("editing failed");
                        //edit.shortlink = edit.code;
                        edit.failed = true;
                        //delete edit.code;
                        logger.error("Editing Failed");
                        //update edit record
                        var collection = thedb.collection('edits');                   
                        collection.update({code:edit.code}, {$set:{failed:true}}, {w:1}, function(err, result) {
                            //done update...
                            logger.error(err);
                            callback('bury');
                        });
                    }
                    else
                    {
                        logger.info("Editing Done");
                        edit.path = edit.shortlink + '.mp4';
                        //edit.shortlink = edit.code;
                        //delete edit.code;
                        //update edit record

                        var collection = thedb.collection('edits');       
                        collection.update({code:edit.code}, {$set:{path:edit.path}}, {w:1}, function(err, result) {
                            //done update...
                            logger.error(err);
                            logger.info(result);
                            callback('success');
                        });
                    }
                    //Edits.update({edit.id},{path:thenewpath}
                });
            }
        }
        catch (e)
        {
            logger.error(e);
            callback('bury');
        }
    }

    var handler = new DoEditHandler();
    logger = winston;
    logger.info("Starting Edit Handler");
    return handler;
};