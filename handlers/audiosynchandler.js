var config = require('../config/local.js');
var ObjectId = require('mongodb').ObjectID;
var request = require('request');
var _ = require('lodash');
var async = require('async');
var fs = require('fs-extra');
// var uploaddir = "/upload/";
var ss3 = require('s3');
var path = require('path');
var Dropbox = require('dropbox');
var maindir = ".tmp";
var moment = require('moment');
var path = require('path');
var uuid = require('uuid');
var tempdir;
var thedb = null;
var connection = null;
var logger = null;
var os = require('os');
var AWS = require('aws-sdk');
AWS.config.region = config.S3_REGION;
var fs = require('fs-extra');
var FFmpeg = require('fluent-ffmpeg');

// var nodemailer = require('nodemailer');
// var directTransport = require('nodemailer-direct-transport');
// var transporter = nodemailer.createTransport(directTransport({
//     debug: true, //this!!!
//   }));



var reportprogress = function(conf)
{
  var collection = thedb.collection('event');
  conf.done++;
  var progress = (conf.done / (conf.total*3))*100;
  console.log(progress + "%");
  collection.update({"_id": new ObjectId(conf.event)}, {$set:{audiosync:{msg:'sync in progress',status:'progress',percentage:progress}}}, {w:1}, function(err, result) {
      //done update...
    });
}

var checkcancel = function(conf,cb)
{
  var collection = thedb.collection('event');
  //console.log("checking cancel");
  collection.findOne({"_id": new ObjectId(conf.event)}, function(err, doc) {
    //console.log(doc);
       if (doc.audiosynccancel)
       {
         console.log('cancelled');
         cb(true)
       }
       else {
         cb();
       }
    });
}

module.exports = function(winston, thedb)
{
    function DoAudioHandler()
    {
        this.type = 'audiosync';
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


        // connection = 'mongodb://'+((config.db_user != '') ? (config.db_user + ':' + config.db_password + '@'):'')  + config.db_host + ':' + config.db_port + '/' + config.db_database;

        //console.log(__dirname + '/' + dir);
        fs.mkdirsSync(__dirname + '/' + maindir);
        tempdir = path.normalize(__dirname + '/' + maindir);

    }

    DoAudioHandler.prototype.work = function(conf, callback)
    {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        process.env.LD_LIBRARY_PATH = "/usr/local/MATLAB/MATLAB_Compiler_Runtime/v80/:/usr/local/MATLAB/MATLAB_Compiler_Runtime/v80/bin/glnxa64/:/usr/local/MATLAB/MATLAB_Compiler_Runtime/v80/runtime/glnxa64";

        logger.info('starting audio sync',conf);

        //return callback('success');

          //var tmpdir = path.normalize(path.dirname(require.main.filename) + uploaddir);

          var collection = thedb.collection('media');
          collection.find({"event_id": conf.event}).toArray(function(err, doc) {
            //console.log("eventid: "+conf.event);
            //console.log(err);
            //console.log(doc.length + " media files");
            conf.total = doc.length;
            conf.done = 0;
            //console.log(doc);

            var s3 = ss3.createClient({
              s3Options: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                region: config.S3_REGION
              },
            });

            var calls = [];
            calls.push(
              function (cb){
                checkcancel(conf,cb);
              });

            //download master audio
            calls.push(function(cb)
            {
              console.log("starting download master audio");
              var params = {
                localFile: path.normalize(tempdir+"/"+conf.audiofile),
                s3Params: {
                  Bucket: config.S3_BUCKET,
                  Key: conf.audiofile,
                },
              };

              var downloader = s3.downloadFile(params);
              downloader.on('error', function(err) {
                console.log(err);
                cb(err);
              });
              downloader.on('end', function() {
                console.log("downloaded master audio")
                cb();
              });
            });

            _.each(doc,function(m){

              //transcode file to audio
              calls.push(
                function (cb){
                  checkcancel(conf,cb);
                });
              calls.push(function(cb){
                  var file = m;

                  request({method:'HEAD',uri:config.S3_TRANSCODE_BUCKET + 'audio/' + m.path + '.mp3'},function(err,response,data)
                  {
                    //console.log(err)
                    console.log('code: '+response.statusCode);
                    if (err || response.statusCode != 200)
                    {

                  console.log("starting transcode");
                  AWS.config.update({accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY});
                  var elastictranscoder = new AWS.ElasticTranscoder();
                  elastictranscoder.createJob({
                    PipelineId: config.ELASTIC_PIPELINE,
                    //InputKeyPrefix: '/upload',
                    OutputKeyPrefix: 'audio/',
                    Input: {Key: 'upload/' + file.path },
                    Output: {
                      Key: file.path + '.mp3',
                      // CreateThumbnails:false,
                      PresetId: config.AUDIO_PRESET, // specifies the output video format
                  }
                    }, function(error, data) {
                      if (error)
                      {
                          logger.error(error);
                          cb(error);
                      }
                      else
                      {
                         logger.info("Audio Transcode submitted");
                          //console.log(data);
                          var params = {
                            Id: data.Job.Id /* required */
                          };
                          elastictranscoder.waitFor('jobComplete', params, function(err, data) {
                            if (err)
                            {
                              console.log(err, err.stack); // an error occurred
                              cb();
                            }
                            else{
                              console.log(data);           // successful response
                              cb();
                            }
                          });
                      }
                  });

                }
                else {
                  console.log('no transcode required');
                  cb();
                }
              });
              });

              //download file
              calls.push(
                function (cb){
                  checkcancel(conf,cb);
                });
              calls.push(function(cb){
                var file = m;
                console.log("starting download of audio");
                var params = {
                  localFile: path.normalize(tempdir+"/"+file.path+'.mp3'),
                  s3Params: {
                    Bucket: config.S3_TRANSCODE_BUCKET_NAME,
                    Key: 'audio/'+file.path+".mp3",
                  },
                };

                var downloader = s3.downloadFile(params);
                downloader.on('error', function(err) {
                  console.log(err);
                  reportprogress(conf);
                  cb(err);
                });
                downloader.on('end', function() {
                  reportprogress(conf);
                  cb();
                });
              });

              //convert to wav:
              calls.push(
                function (cb){
                  checkcancel(conf,cb);
                });
              calls.push(function(cb){
                var file = m;
                console.log('starting ffmpeg conversion');
                //console.log(tempdir + m.path + '.mp3');
            		if (m.path && fs.existsSync(tempdir + '/' + m.path + '.mp3'))
            		{
                  console.log("file found for conversion");
            			//calls.push(function(callback) {
            				//add to queue:
            				console.log('converting '+ tempdir + '/' + m.path);
            				if (!fs.existsSync(tempdir + m.path + '.wav'))
            				{
            					var command = new FFmpeg({ source: tempdir + '/' + m.path + '.mp3'})
            					.on('error', function(err) {
            		        		console.log('Cannot convert to wav: ' + err.message);
                            reportprogress(conf);
            		        		cb(err);
            		    		})
            		    		.on('end', function() {
            		        		console.log('Conversion to wav finished successfully');
            		        		//adjust progress:
                            reportprogress(conf);
            		        		cb();
            		        	})
            		        	.saveToFile(tempdir + '/' + m.path + '.wav');
          	        	}
          	        	else
          	        	{
                        reportprogress(conf);
          	        		cb();
          	        	}
            			//});
            		}
                else {
                  console.log("no file found for conversion");
                  reportprogress(conf);
                  cb();
                }
              });
            });

            //process all files
            calls.push(
              function (cb){
                checkcancel(conf,cb);
              });
            calls.push(function(cb){
              console.log("processing all files");

              var clips = _.pluck(doc,'path');
              clips = _.map(clips,function(c)
              {
                  return tempdir + '/' + c +'.wav';
              });
              console.log(clips);
              //calls.push(function(cb) {
        			//do matlab processing:
        			var esc = require('shell-escape');
        			var exec = require('child_process').execFile;
              //console.log(tempdir + conf.audiofile);
        			var args = {groundTruthPath:tempdir + '/' + conf.audiofile, clips:clips};
        			console.log(esc([JSON.stringify(args)]));
        			var filename = tempdir + '/' + "input_" + conf.event + ".json";
        			fs.writeFileSync(filename, JSON.stringify(args));

        			exec(path.normalize(path.dirname(require.main.filename)) + '/sync_audio/SyncClips',[filename], function callback(error, stdout, stderr){
        			    if (error)
        			    {
        			    	console.log(error);
        			    	cb(error);
        			    }
        			    else
        			    {
                    console.log("matlab script finished");
                    var updates = [];
                    //readthe data:
                    var output = fs.readFileSync(path.normalize(path.dirname(require.main.filename)) + '/' + conf.audiofile.replace('.wav','.txt'));
                    var data = JSON.parse(output);
                    //console.log(data);
                    medi = data[conf.audiofile.replace('.wav','')];
                    //console.log(medi);
                    //remove master audio
                    fs.unlinkSync(tempdir + '/' + conf.audiofile);

                    _.each(medi,function(o,k)
                    {
                      if (k!='progress')
                      {
                        updates.push(function(cb){
                          var filename = k.replace('id','') + '.mp4';
                          var off = o.split(':');
                          var offset = (parseInt(off[3])/100.0) + parseInt(off[2]) + (parseInt(off[1])*60) + (parseInt(off[0]) * 60 * 60);

                          console.log(filename + ' at '+o + " " + offset);
                          var collection = thedb.collection('media');
                          //remove the file:
                          fs.unlinkSync(tempdir + '/' + filename);

                          collection.update({"path": filename}, {$set:{offset:offset}}, {w:1}, function(err, result) {
                              //done update...
                              reportprogress(conf);
                              console.log(result);
                              cb(err);
                            });
                        });
                      }
                    });

                    async.series(updates,function(err)
                    {
                      //remove all files:
                      cb(err);
                    });
        			    }
        			});
            });

            async.series(calls,function(err)
            {
              logger.error(err);
              //FINISHED:
              var collection = thedb.collection('event');
              if (err)
              {
                var err_obj = {
                  code:800,
                  reason:err
                };
                collection.update({"_id": new ObjectId(conf.event)}, {$set:{audiosynccancel:false,audiosync:{msg:'Cancelled',status:'cancelled',percentage:0,stopped:true,error:err_obj}}}, {w:1}, function(err, result) {
                    //done update...
                    console.log(err);
                    //console.log(result);
                    logger.info('Audio Sync Complete');
                    sendEmail(conf.user_id,'Audio Sync Error','Your Audio Sync has been Cancelled or is Incomplete. Error: '+err);
                    callback('bury');
                  });
              }
              else
              {
                collection.update({"_id": new ObjectId(conf.event)}, {$set:{audiosynccancel:false,audiosync:{msg:'Complete',status:'done',percentage:100,stopped:true}}}, {w:1}, function(err, result) {
                    //done update...
                    console.log(err);
                    //console.log(result);
                    logger.info('Audio Sync Complete');
                    sendEmail(conf.user_id,'Audio Sync Complete!','Your Bootlegger audio sync is complete.');
                    callback('success');
                  });
              }

          });
          });
    }


    var handler = new DoAudioHandler();
    logger = winston;
    logger.info("Starting Audio Sync Handler");
    return handler;
}
