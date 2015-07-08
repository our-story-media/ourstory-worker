var config = require('./local.js');
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var request = require('request');
var _ = require('lodash');
var async = require('async');
var fs = require('fs-extra');
var uploaddir = "/upload/";
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

var nodemailer = require('nodemailer');
var directTransport = require('nodemailer-direct-transport');
var transporter = nodemailer.createTransport(directTransport({
    debug: true, //this!!!
  }));

var sendEmail = function(userid, content) {

    var collection = thedb.collection('user');
    collection.findOne({"_id": new ObjectId(userid)}, function(err, doc) {
      logger.info("sending email to "+doc.profile.emails[0].value);
      transporter.sendMail({
    		from: "Bootlegger <no-reply@bootlegger.tv>", // sender address
            to: doc.profile.emails[0].value, // list of receivers
            subject: 'Audio Sync Finished', // Subject line
            text: content, // plaintext body
    	});
    });
};

var reportprogress = function(conf)
{
  var collection = thedb.collection('user');
  conf.done++;
  var progress = (conf.done / (conf.total*2))*100;
  collection.update({"_id": new ObjectId(conf.user_id)}, {$set:{audiosync:{msg:'sync in progress',status:'progress',percentage:progress}}}, {w:1}, function(err, result) {
      //done update...
    });
}

var checkcancel = function(conf,cb)
{
  var collection = thedb.collection('user');
  //console.log("checking cancel");
  collection.findOne({"_id": new ObjectId(conf.user_id)}, function(err, doc) {
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

module.exports = function(winston)
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


        connection = 'mongodb://'+((config.db_user != '') ? (config.db_user + ':' + config.db_password + '@'):'')  + config.db_host + ':' + config.db_port + '/' + config.db_database;

        //console.log(__dirname + '/' + dir);
        fs.mkdirsSync(__dirname + '/' + maindir);
        tempdir = path.normalize(__dirname + '/' + maindir);


      //console.log('mongodb://'+config.db_user+':'+config.db_password+'@'+config.db_host+':'+config.db_port+'/'+config.db_database);
        MongoClient.connect(connection, function(err, db) {
           // MongoClient.connect('mongodb://localhost/bootlegger', function(err, db) {
            if(err) throw err;
            thedb = db;
          });
    }

    DoAudioHandler.prototype.work = function(conf, callback)
    {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        process.env.LD_LIBRARY_PATH = "/usr/local/MATLAB/MATLAB_Runtime/v85:/usr/local/MATLAB/MATLAB_Runtime/v85/bin/glnxa64:/usr/local/MATLAB/MATLAB_Runtime/v85/runtime/glnxa64";

        logger.info('starting audio sync',conf);

        //return callback('success');

          //var tmpdir = path.normalize(path.dirname(require.main.filename) + uploaddir);

          var collection = thedb.collection('media');
          collection.find({"event_id": conf.event}).toArray(function(err, doc) {
            //console.log("eventid: "+conf.event);
            //console.log(err);
            //console.log(doc.length + " media files");

            //console.log(doc);

            var s3 = ss3.createClient({
              s3Options: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                region: config.S3_REGION
              },
            });

            var calls = [];

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
                  cb(err);
                });
                downloader.on('end', function() {
                  cb();
                });
              });

              //convert to wav:
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
            		        		cb(err);
            		    		})
            		    		.on('end', function() {
            		        		console.log('Conversion to wav finished successfully');
            		        		//adjust progress:
            		        		cb();
            		        	})
            		        	.saveToFile(tempdir + '/' + m.path + '.wav');
          	        	}
          	        	else
          	        	{
          	        		cb();
          	        	}
            			//});
            		}
                else {
                  console.log("no file found for conversion");
                  cb();
                }
              });
            });

            //process all files
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
            			var exec = require('child_process').exec;
                  //console.log(tempdir + conf.audiofile);
            			var args = {groundTruthPath:tempdir + '/' + conf.audiofile, clips:clips};
            			console.log(esc([JSON.stringify(args)]));
            			var filename = tempdir + '/' + "input_" + conf.event + ".json";
            			fs.writeFileSync(filename, JSON.stringify(args));

            			exec(path.normalize(path.dirname(require.main.filename)) + '/sync_audio/SyncClips "'+filename+'"',{
                    env:{
                      'LD_LIBRARY_PATH' : "/usr/local/MATLAB/MATLAB_Runtime/v85:/usr/local/MATLAB/MATLAB_Runtime/v85/bin/glnxa64:/usr/local/MATLAB/MATLAB_Runtime/v85/runtime/glnxa64"
                    }
                  }, function callback(error, stdout, stderr){
            			    // result
            			    if (error)
            			    {
            			    	console.log(error);
            			    	cb(error);
            			    }
            			    else
            			    {
                        console.log("matlab script finished");
            			    	cb();
            			    }
            			});
            	//	});
            });

            async.series(calls,function(err)
            {
              logger.error(err);
              //FINISHED:
              var collection = thedb.collection('user');
              if (err)
              {
                collection.update({"_id": new ObjectId(conf.user_id)}, {$set:{audiosynccancel:false,audiosync:{msg:'Cancelled',status:'cancelled',percentage:0,stopped:true,error:err}}}, {w:1}, function(err, result) {
                    //done update...
                    console.log(err);
                    //console.log(result);
                    logger.info('Audio Sync Complete');
                    sendEmail(conf.user_id,'Audio Sync Cancelled or Incomplete. Error: '+err);
                    callback('bury');
                  });
              }
              else
              {
                collection.update({"_id": new ObjectId(conf.user_id)}, {$set:{audiosynccancel:false,audiosync:{msg:'Complete',status:'done',percentage:100,stopped:true}}}, {w:1}, function(err, result) {
                    //done update...
                    console.log(err);
                    //console.log(result);
                    logger.info('Audio Sync Complete');
                    sendEmail(conf.user_id,'Audio Sync Complete!');
                    callback('success');
                  });
              }

          });
          });




        	// //start ffmpeg:
        	// Media.find({event_id:ev.id}).exec(function(err,media)
        	// {
        	// 	//for each media, add to list:
        	// 	var async = require('async');
        	// 	var calls = [];
          //
        	// 	var valid = [];
        	// 	_.each(media, function(m)
        	// 	{
        	// 		console.log("checking "+m);
        	// 		if (m.path != undefined && fs.existsSync(tmpdir + m.path))
        	// 		{
        	// 			console.log("adding to conversion list");
        	// 			valid.push(tmpdir + m.path + ".wav");
        	// 			calls.push(function(callback) {
        	// 				//add to queue:
        	// 				console.log('converting '+ tmpdir + m.path);
        	// 				if (!fs.existsSync(tmpdir + m.path + '.wav'))
        	// 				{
        	// 					var command = new FFmpeg({ source: tmpdir + m.path})
        	// 					.on('error', function(err) {
        	// 		        		console.log('Cannot process video: ' + err.message);
        	// 		        		callback(null,m);
        	// 		    		})
        	// 		    		.on('end', function() {
        	// 		        		console.log('Processing finished successfully');
        	// 		        		//adjust progress:
        	// 		        		callback(null,m);
        	// 		        	})
        	// 		        	.saveToFile(tmpdir + m.path + '.wav');
        	// 	        	}
        	// 	        	else
        	// 	        	{
        	// 	        		callback(null,m);
        	// 	        	}
        	// 			});
        	// 		}
        	// 		//path
        	// 	});
          //
        	// 	calls.push(function(cb) {
        	// 		//do matlab processing:
        	// 		var esc = require('shell-escape');
        	// 		var exec = require('child_process').exec;
        	// 		//TODO -- pass arguments
          //
        	// 		var args = {groundTruthPath:ev.audio, clips:valid};
        	// 		console.log(esc([JSON.stringify(args)]));
        	// 		var filename = tmpdir + "input_" + ev.id + ".json";
        	// 		fs.writeFileSync(filename, JSON.stringify(args));
          //
        	// 		exec(path.normalize(path.dirname(require.main.filename)) + '/sync_audio/SyncClips "'+filename+'"', function callback(error, stdout, stderr){
        	// 		    // result
        	// 		    if (error)
        	// 		    {
        	// 		    	console.log(error);
        	// 		    	cb(error);
        	// 		    }
        	// 		    else
        	// 		    {
        	// 		    	 Event.findOne(ev.id).exec(function(err,e)
        	// 			    {
        	// 			    	e.audio_progress = 100;
        	// 			    	e.save(function(err)
        	// 			    	{
        	// 			    		genedl(ev.id,function(done)
        	// 				    	{
        	// 				    		console.log("done edl generation");
        	// 							cb(null,e);
        	// 				    	});
        	// 			    	});
        	// 			    });
        	// 		    }
        	// 		});
        	// 	});
          //
        	// 	console.log("valid:" + valid);
          //
        	// 	async.series(calls, function(err, result) {
        	// 		console.log("done audio processing");
        	// 		if (err)
        	// 		{
        	// 			 Event.findOne(ev.id).exec(function(err,e)
        	// 		    {
        	// 		    	e.audio_progress = -1;
        	// 		    	e.save(function(err)
        	// 		    	{
        	// 		    	});
        	// 		    });
        	// 		}
        	// 	});
        	// });

        // });

    }


    var handler = new DoAudioHandler();
    logger = winston;
    logger.info("Starting Audio Sync Handler");
    return handler;
}
