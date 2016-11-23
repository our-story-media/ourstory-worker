var uploaddir = "/.tmp/";
var ss3 = require('s3');
var path = require('path');
var fs = require('fs');
var ffmpeg = require('fluent-ffmpeg');
var knox = require('knox');
var AWS = require('aws-sdk');
var os = require('os');
var config = require('../config/local.js');
AWS.config.region = config.S3_REGION;
var _ = require('lodash');
var async = require('async');
var PythonShell = require('python-shell');
var ObjectId = require('mongodb').ObjectID;
var child_process = require('child_process');
var touch = require("touch");
var uuid = require('uuid');

module.exports = function(winston, thedb)
{
    var connection = null;
    //var thedb = null;
    var logger = null;
    
    function DoEditHandler()
    {
        process.env.SDL_VIDEODRIVER = 'dummy';
        process.env.SDL_AUDIODRIVER = 'dummy';

        this.type = 'edit';
    }

    function clearOut(edit)
    {
        var dir = path.normalize(path.dirname(require.main.filename) + uploaddir);
        // Remove all the lock files for this edit
        _.each(edit.media,function(m){
            //console.log(m.tmp_path);
            if (m.tmp_path)
            {
                var f = path.normalize(dir+"/"+m.tmp_path.replace(config.S3_CLOUD_URL,'').replace(config.master_url+'/media/preview/','')) + '.lock';
                if (fs.existsSync(f))
                    fs.unlinkSync(f);           
            }
            else
            {
                var f = path.normalize(dir+"/"+m.path.replace(config.S3_CLOUD_URL,'').replace(config.master_url+'/media/preview/','')) + '.lock';
                if (fs.existsSync(f))
                    fs.unlinkSync(f);
            }            
        });
        
        //2. remove resulting file
        if (fs.existsSync(path.normalize(path.dirname(require.main.filename) + uploaddir + edit.code + ".mp4")))
            fs.unlinkSync(path.normalize(path.dirname(require.main.filename) + uploaddir + edit.code + ".mp4"));

        //TODO remove all lock files from anywhere older then 3 hours (for failed things half way through)


        // Clear out data -- 
        var allfiles = fs.readdirSync(path.normalize(path.dirname(require.main.filename) + uploaddir));

        var allfiles_nolock = _.filter(allfiles,function(f){
            //console.log('does this exist: ' + path.normalize(path.dirname(require.main.filename) + uploaddir) + f + '.lock');
            return !fs.existsSync(path.normalize(path.dirname(require.main.filename) + uploaddir) + f + '.lock') && !_.endsWith(f,'.lock');
        });

        var statfiles = _.map(allfiles_nolock,function(f){
            return {file:path.normalize(path.dirname(require.main.filename) + uploaddir) + f,stats:fs.statSync(path.normalize(path.dirname(require.main.filename) + uploaddir) + f)};
        });

        // console.log(allfiles_nolock);
        var ordered = _.orderBy(statfiles,'stats.mtime','desc');

        var keep = [];
        var remove = [];
        //20GB
        //var sizecounter = 20*1024*1024*1024;
        var space_avail = 20*1024*1024;
        var sizecounter = space_avail;
        var index = 0;

        while (sizecounter > 0 && index < _.size(ordered))
        {
            keep.push(ordered[index]);
            sizecounter -= ordered[index].size;
            index++;
        }

        remove = _.slice(ordered,index);

        logger.info("Keeping " + _.size(keep) + ' files within the '+(space_avail/(1024*1024)) + 'MB cap');
        _.each(keep,function(f){
            // console.log(f.file);
        });

        logger.info('Removing ' + _.size(remove) + ' files');
        _.each(remove,function(f){
            // console.log(f.file);
            fs.unlinkSync(f.file);
        });

        // console.log(keep);
        // - order files by last touched date
        // - ignore files with lock files present
        // - sum size of files up to the max, then remove the rest.
    }

    DoEditHandler.prototype.work = function(edit, callback)
    {
        edit.files_in_use = [];

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
            //join files
            var calls = [];
            var thenewpath = '';

            var dir = path.normalize(path.dirname(require.main.filename) + uploaddir);

            //TODO -- TAKE THIS OUT!
            if (edit.media.length<config.MIN_CLIP_COUNT)
            {
                logger.error("Less than "+config.MIN_CLIP_COUNT+" clips.");
                var collection = thedb.collection('edits');
                var err_obj = {
                    code:601,
                    reason:'Less than '+config.MIN_CLIP_COUNT+' clips'
                };     
                collection.update({code:edit.code}, {$set:{fail:true,failreason:'Less than '+config.MIN_CLIP_COUNT+' clips',error:err_obj},$unset:{path:""}}, {w:1}, function(err, result) {
                    callback('bury');
                });
            }
            else
            {
                //download                
                _.each(edit.media,function(m,index){
                    calls.push(function(cb){
                        var media = m;

                        //if there is a file lock, then change the name of the local file we are using
                        var localfile = path.normalize(dir+"/"+media.path.replace(config.S3_CLOUD_URL,'').replace(config.master_url+'/media/preview/',''));                        

                        //check if the file is in use (by another process)
                        if (fs.existsSync(localfile + '.lock'))
                        {
                            //check that the file is not just in use by me:
                            if (!_.includes(edit.files_in_use,localfile))
                            {
                                var tmp = uuid();
                                edit.media[index].tmp_path = tmp+media.path;
                                media.tmp_path = tmp+media.path;
                                localfile = path.normalize(dir+"/"+media.tmp_path.replace(config.S3_CLOUD_URL,'').replace(config.master_url+'/media/preview/',''));
                                logger.info('File in use by someone else, using ' + media.tmp_path);
                            }
                            else
                            {
                                logger.info('File in use by me, using ' + localfile);
                            }
                        }

                        //create lock
                        touch.sync(localfile + '.lock');
                        edit.files_in_use.push(localfile);

                        //if no file
                        if (!fs.existsSync(localfile))
                        {                           
                            //download from s3
                            var s3 = ss3.createClient({
                                s3Options: {
                                accessKeyId: config.AWS_ACCESS_KEY_ID,
                                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                                region: config.S3_REGION
                                },
                            });

                            var params = {
                                localFile: localfile + '.part',
                                s3Params: {
                                Bucket: config.S3_BUCKET,
                                Key: "upload/"+media.path.replace(config.S3_CLOUD_URL,'').replace(config.master_url+'/media/preview/','')
                                },
                            };
                            //console.log(params);
                            logger.info('Downloading: ' + localfile);
                            var downloader = s3.downloadFile(params);

                            downloader.on('error', function(err) {
                                //console.log("s3 error "+err);
                                cb(err.toString());
                                //release file lock
                                fs.unlink(localfile + '.lock');
                            });
                            downloader.on('end', function() {          
                                fs.renameSync(localfile+ '.part',localfile);
                                cb();
                            });
                        }
                        else
                        {
                            logger.info("Using Cache: " + localfile);
                            //update file with last time it was accessed
                            touch.sync(localfile);
                            cb();
                        }
                    });
                });

                calls.push(function(cb){
                    
                    // //FOR DEBUGGING
                    // return cb(null);


                    //OUTPUT:
                    
                    var videoFilename = path.normalize(path.dirname(require.main.filename) + uploaddir +edit.code + uuid() + ".mp4");

                    edit.tmp_filename = videoFilename;

                    //TESTING:
                    var testcommand = [];

                    _.each(edit.media,function(m)
                    {
                        testcommand.push(path.normalize(dir+"/"+m.path.replace(config.S3_CLOUD_URL,'')));
                        if (m.inpoint)
                            testcommand.push('in="'+m.inpoint+'"');
                        if (m.outpoint && m.outpoint!="00:00:00")
                            testcommand.push('out="'+m.outpoint+'"');
                        testcommand.push("-mix 10");
                        // testcommand.push("-mixer luma");
                    });

                    testcommand.push('-progress');
                    testcommand.push('-consumer avformat:' + videoFilename + " strict=experimental");// b=3000 frag_duration=30");

                    logger.info('Editing. Please be Patient!');

                        var lastprogress = 0;
                        
                        var exec = require('child_process').exec;
                        //var ls = spawn('melt',testcommand,{stdio:[null,null,'pipe']});
                        console.log('melt ' + testcommand.join(' '));
                        var child = exec('melt ' + testcommand.join(' '),{maxBuffer:1024*1024},function(err, o,e){
                            logger.info('Done Editing');
                            if (err)
                                logger.error(err);
                            //cb(code!=0);
                        });

                        child.stdout.on('data', function(data) {
                            logger.info('' + data);
                            //console.log("stdout: "+data);
                        });
                        child.stderr.on('data', function(data) {
                            console.log('' + data);
                            var re = /percentage:\s*(\d*)/;
                            var perc = re.exec(data);
                            
                            if (perc)
                            {
                                if (perc && perc[1] != lastprogress)
                                {
                                    //update db if progress changed:
                                    lastprogress = perc[1];
                                    var collection = thedb.collection('edits');
                                    collection.update({code:edit.code}, {$set:{progress:lastprogress}}, {w:1}, function(err, result) {
                                        //done collection update
                                    });
                                }
                            } 
                        });
                        child.on('error', function(data) {
                            logger.error('' + data);

                            cb(data);
                        });
                        child.on('close', function(code) {
                            logger.info('closing code: ' + code);
                            /****
                            THIS IS RETURNING 0 EVEN IF THE EDIT FAILS...
                            ****/
                            
                            console.log("edit return code " + code);
                            cb();
                        });
                });

                //upload to s3
                calls.push(function(cb){
                    // //FOR DEBUGGING
                    // return cb(null);

                    var knox_params = {
                        key: config.AWS_ACCESS_KEY_ID,
                        secret: config.AWS_SECRET_ACCESS_KEY,
                        bucket: config.S3_BUCKET
                      };
                      var client = knox.createClient(knox_params);

                    //   console.log(path.normalize(path.dirname(require.main.filename) + uploaddir + edit.code + ".mp4"));
                      client.putFile(path.normalize(path.dirname(require.main.filename) + uploaddir + edit.tmp_filename), 'upload/' + edit.code + ".mp4", {'x-amz-acl': 'public-read'},
                            function(err, result) {
                                //console.log(err);
                                if (err)
                                {
                                    logger.error(err);
                                    cb(err.toString());
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
                    // FOR DEBUGGING
                    // return cb(null);

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
                        PresetId: config.TRANSCODE_PRESET, // specifies the output video format
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
                            cb(error.toString());
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

                    try
                    {
                        clearOut(edit);
                    }
                    catch (e)
                    {
                        console.log(e);
                    }

                    if (err)
                    {
                        edit.failed = true;
                        //delete edit.code;
                        logger.error("Editing Failed");
                        logger.error(err);
                        //update edit record
                        var collection = thedb.collection('edits');
                        var err_obj = {
                            code:600,
                            reason:err
                        };                
                        collection.update({code:edit.code}, {$set:{failed:true,failreason:err,error:err_obj},$unset:{path:""}}, {w:1}, function(err, result) {
                            //done update...
                            logger.error(err);
                            callback('bury');
                        });
                    }
                    else
                    {
                        logger.info("Editing Done");
                        edit.path = edit.shortlink + '.mp4';

                        var collection = thedb.collection('edits');       
                        collection.update({code:edit.code}, {$set:{path:edit.path}}, {w:1}, function(err, result) {
                            //done update...
                            if (err) logger.error(err);
                            //logger.info(result);
                            callback('success');
                        });
                    }
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