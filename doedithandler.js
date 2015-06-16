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

            if (edit.media.length<2)
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

                _.each(edit.media,function(m){
                    calls.push(function(cb){
                        //return cb();
                        var media = m;
                        //download from s3
                        //var ff = ffmpeg();
                        logger.info("reading meta for "+path.normalize(dir+"/"+media.path.replace(config.S3_CLOUD_URL,'')));
                        ffmpeg.ffprobe(path.normalize(dir+"/"+media.path.replace(config.S3_CLOUD_URL,'')), function(err, metadata) {
                            //logger.error(err);
                            //console.dir(metadata);
                            media.meta = metadata;
                            cb();
                        });                    
                    });
                });



                // calls.push(function(cb){
                //     var json = {};
                //     json.output = path.normalize(path.dirname(require.main.filename) + '/upload/' + edit.code + ".mp4");
                //     json.files = [];
                //     _.each(edit.media,function(m){
                //         json.files.push({filename:path.normalize(dir+"/"+m.path.replace(config.S3_CLOUD_URL,''))});
                //     });

                //     var options = {
                //       mode: 'text',
                //       scriptPath:__dirname,
                //       args: [JSON.stringify(json)]
                //     };

                //     //console.log(options.args);
                     
                //     PythonShell.run('./edit.py', options, function (err, results) {
                //       if (err) throw err;
                //       // results is an array consisting of messages collected during execution 
                //       cb();
                //       //console.log('results: %j', results);
                //     });
                // });


                //_.each(edit.media,function(m){
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
                            //startFrame:100,
                            //length:m.meta.streams[0].nb_frames
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
                        //foo.dv bar.dv -mix 25 -mixer luma -mixer mix:-1
                        var testcommand = [];
                        // var paths = _.pluck(edit.media,function(m)
                        // {
                        //     //return path.normalize(dir+"/"+m.path.replace(config.S3_CLOUD_URL,''));
                        //     //testcommand += " "++" -mix 25 -mixer luma ";
                        // });

                        var paths = _.each(edit.media,function(m)
                        {
                            testcommand.push(path.normalize(dir+"/"+m.path.replace(config.S3_CLOUD_URL,'')));
                            testcommand.push("-mix 25");
                            testcommand.push("-mixer luma");
                        });

                        //testcommand = paths.join(' -mix 25 -mixer luma ')

                        //testcommand += " -mixer mix:-1";
                        //var child = 'melt ' + mltFilename + ' -progress -consumer avformat:' + videoFilename + " strict=experimental";
                        //var child = testcommand + ' -progress -consumer avformat:' + videoFilename + " strict=experimental";
                       testcommand.push('-progress');
                       testcommand.push('-consumer avformat:' + videoFilename + " strict=experimental");

                        logger.info('Melting. Please be Patient!');
                        
                        // child = child_process.spawn(child, function (err, stdout, stderr) {
                        //       if (err) {
                        //         logger.error(err);
                        //         return cb(err);
                        //       }
                        //       else
                        //       {
                        //         logger.info('Finished: ' + videoFilename);
                        //         cb();
                        //       }
                        //    });
                            console.log('melt ' + testcommand.join(' '));
                            var spawn = require('child_process').spawn;
                            var ls = spawn('melt',testcommand,{ stdio: ['pipe', 'pipe', null, null, null] });

                            ls.stdout.on('data', function (data) {
                              logger.info('' + data);
                            });

                            ls.stderr.on('data', function (data) {
                              logger.error('' + data);
                            });

                            ls.on('close', function (code) {
                                logger.info('Finished: ' + videoFilename);
                              cb();
                            });
                        }
                    });
                });
                //});

                //-c:v libx264
                // _.each(edit.media,function(m){
                //     calls.push(function(cb){
                //         //return cb();
                //         var media = m;
                //         //download from s3
                //         var ff = ffmpeg();
                //         ff.input(path.normalize(dir+"/"+media.path.replace(config.S3_CLOUD_URL,'')));
                //         ff.fps(30.333)
                //         ff.videoCodec('libx264').outputOptions('-preset slower');
                //         // ff.preset('slower');
                //         ff.size('1920x?').aspect('16:9');
                //         ff.outputOptions('-g 2')
                //         ff.keepDAR();

                //         ff.on('start',function(command){
                //             console.log("ffmpeg "+command);
                //         });
                //         ff.on('error', function(err, stdout, stderr) {
                //             //console.log(stderr);
                //             //console.log(stdout);
                //             logger.error('An error occurred: ' + err.message);
                //             cb(true);
                //           })
                //           .on('end', function() {
                //             logger.info('Conversion finished !');
                //             cb();
                //           })
                //           .save(path.normalize(dir+"/"+media.path.replace(config.S3_CLOUD_URL,'')));
                //     });
                // });


                //edit
                // calls.push(function(cb){
                //  //# this is a comment
                //  // file '/path/to/file1'
                //  // file '/path/to/file2'
                //  // file '/path/to/file3'
                //  var filelist = _.reduce(edit.media,function(all,m)
                //  {
                //      return all + "file " + m.path.replace(sails.config.S3_CLOUD_URL,'') + "\r\n";
                //  },"");
                //  //fs.writeFileSync(path.normalize(dir+"/" + edit.code + '.txt'),filelist);
                //  cb();
                // });

                // calls.push(function(cb){
                //     //return cb();
                //     var ff = ffmpeg();
                //     _.each(edit.media,function(m)
                //     {
                //         ff.mergeAdd(path.normalize(path.dirname(require.main.filename) + '/upload/' + m.path.replace(config.S3_CLOUD_URL,'')));
                //     });

                //     ff.on('start',function(command){
                //         logger.info("ffmpeg "+command);
                //     });
                //     ff.on('error', function(err, stdout, stderr) {
                //         //console.log(stderr);
                //         //console.log(stdout);
                //         logger.error('An error occurred: ' + err.message);
                //         cb(true);
                //       })
                //       .on('end', function() {
                //         logger.info('Merging finished !');
                //         cb();
                //       })
                //       .mergeToFile(path.normalize(path.dirname(require.main.filename) + '/upload/' + edit.code + '.mp4'), path.normalize(path.dirname(require.main.filename) + '/.tmp/'));
                // });

                // calls.push(function(cb){

                //  var ff = ffmpeg();
                //  ff.addInput(path.normalize(path.dirname(require.main.filename) + '/upload/' + edit.code + '.mp4'));
                //  ff.addInput(path.normalize(path.dirname(require.main.filename)+'/assets/images/logo.png'));
                //  ff.complexFilter('overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2');
                //  ff.output(path.normalize(path.dirname(require.main.filename) + '/upload/' + edit.code + '.mp4'));

                //  ff.on('error', function(err) {
                //      console.log('An error occurred: ' + err.message);
                //    })
                //    .on('end', function() {
                //      console.log('Watermarking Finished!');
                //      cb();
                //    }).run();
                      
                // });


                //ff.addInput(path.normalize(path.dirname(require.main.filename)+'/assets/images/logo.png'));
                //ff.complexFilter('overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2');

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