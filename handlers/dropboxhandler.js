var ObjectId = require('mongodb').ObjectID;
var request = require('request');
var _ = require('lodash');
var async = require('async');
var fs = require('fs-extra');
var uploaddir = "/../.tmp/";
var ss3 = require('s3');
var path = require('path');
var Dropbox = require('dropbox');
var path = require('path');
var uuid = require('uuid');
var tempdir;
var thedb = null;
var connection = null;
var logger = null;
var AWS = require('aws-sdk');
var touch = require("touch");
AWS.config.region = config.S3_REGION;

var reportprogress = function(conf)
{
  var collection = thedb.collection('user');
  conf.done++;
  var progress = (conf.done / (conf.total*2))*100;
  var replacement = {};
  replacement["sync."+conf.event_id+".dropboxsync.msg"] = 'sync in progress';
  replacement["sync."+conf.event_id+".dropboxsync.status"] = 'progress';
  replacement["sync."+conf.event_id+".dropboxsync.percentage"] = progress;
  collection.update({"_id": new ObjectId(conf.user_id)}, {$set:replacement}, {w:1}, function(err, result) {
      //done update...
    });
}

var checkcancel = function(conf,cb)
{
  var collection = thedb.collection('user');
  //console.log("checking cancel");
  
  collection.findOne({"_id": new ObjectId(conf.user_id)}, function(err, doc) {
    if (doc.sync[conf.event_id].dropboxsynccancel)
    {
      console.log('cancelled');
      cb(true)
    }
    else 
    {
      cb();
    }
  });
}

function clearOut(conf)
{
    var dir = path.normalize(path.dirname(require.main.filename) + uploaddir);

    // Remove all the lock files for this edit
    _.each(conf.lockfiles,function(m){
        fs.closeSync(m); 
    });

    _.each(conf.lockfile_names,function(m){
      fs.unlinkSync(m);           
    });

    cleanOutAll();
}

var dodirs = function(pf, dir, calls, dbclient, s3, conf)
  {
      //console.log("path: " + pf);
      _.each(dir,function(val,key){
          if (!val.local)
          {
            //console.log('mkdir '+ pf + key);
            calls.push(
              function (cb){
                checkcancel(conf,cb);
              });
            calls.push(function(cb)
            {
              //var pp = p;
              var tdir = '/' + pf+key;
              //console.log(tdir);
              dbclient.filesGetMetadata({path:tdir}).then(function(existing){
                //console.log(err);
                //console.log(existing);
                cb();
              }).catch(function(err)
              {
                console.log('Dir does not exist');
                dbclient.filesCreateFolder({path:tdir}).then(function(stat)
                  {
                    cb();
                  }).catch(function(err){
                    cb(err); 
                  });
              });
            });
            //console.log(val);
            dodirs(pf + key + '/',val,calls,dbclient,s3,conf);
          }
          else {
            //return;
            //console.log(val);
            if (val.remote)
            {
              conf.total++;

              // get the real path information from the db:
               calls.push(
                function (cb){
                  var filename = val;
                  // console.log(filename);
                  var collection = thedb.collection('media');
                  collection.findOne({"_id": new ObjectId(filename.id)}, function(err, doc) {
                    filename.remote = doc.path;
                    filename.homog = doc.path + "_homog.mp4";
                    // console.log(filename.remote);
                    cb();
                  });
                });

              // CHECK CANCEL
              calls.push(
                function (cb){
                  checkcancel(conf,cb);
                });

              //TRANSCODE THE FILE IF NEEDED
              if (conf.homog)
              {
                calls.push(function(cb){
                  var filename = val;
                  //check if the file exists:
                  
                  //TODO -- if its an image or audio, ignore and dont do homog...
                  console.log("looking for "+val.homog);
                  var j = request.jar();
                  var cookie = request.cookie('sails.sid='+conf.session);
                  j.setCookie(cookie, config.master_url);

                  // console.log(config.master_url + ':' + config.master_url_port + '/media/homog/' + filename.id + '?apikey='+ config.CURRENT_EDIT_KEY);
                  request({method:'HEAD', url: config.master_url + ':' + config.master_url_port + '/media/homog/' + filename.id + '?apikey='+ config.CURRENT_EDIT_KEY, jar: j},function(err,resp,data)
                  {
                    // console.log(err);
                    // console.log(resp);
                    // console.log('code: '+resp.statusCode);
                    if (err || resp.statusCode != 200)
                    {
                      //console.log(err);
                      //console.log(data);
                      console.log("HOMOG file not exist, submitting transcode request");
                      AWS.config.update({accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY});
                      var elastictranscoder = new AWS.ElasticTranscoder();
                      elastictranscoder.createJob({
                        PipelineId: config.ELASTIC_PIPELINE,
                        //InputKeyPrefix: '/upload',
                        OutputKeyPrefix: 'upload/',
                        Input: {
                          Key: 'upload/' + filename.remote,
                          FrameRate: 'auto',
                          Resolution: 'auto',
                          AspectRatio: 'auto',
                          Interlaced: 'auto',
                          Container: 'auto' },
                        Output: {
                          Key: filename.homog,
                          // CreateThumbnails:false,
                          PresetId: config.HOMOG_PRESET, // specifies the output video format
                      }
                        }, function(error, data) {
                          if (error)
                          {
                              logger.error(error);
                              cb(error);
                          }
                          else
                          {
                             logger.info("Transcode submitted");
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
                      //file has been homogeonised!
                      cb();
                    }
                  });
                });
              }

              //DOWNLOAD THE FILE LOCALLY
              calls.push(function(cb)
              {
                var filename = val;
                var thepath = '/' + pf;
                //download file
                dbclient.filesGetMetadata({path: thepath + filename.local}).then(function(stat){
                   //console.log(stat);
                    //if (!stat || stat.isRemoved)
                    //{
                      // console.log(err);
                      console.log(thepath + filename.local + " exists in dropbox");
                      
                      reportprogress(conf);
                      cb();
                    }).catch(function(err)
                    {
                      console.log(thepath + filename.local + ' not in dropbox already');
                      //file not in destination, so download to tmp
                      if (conf.homog)
                      {
                        filename.local_file = filename.remote + '_homog.mp4';
                      }
                      else
                      {
                        filename.local_file = filename.remote;
                      }

                      var localfile = path.normalize(tempdir+'/'+filename.local_file);
                      //conf.files_in_use.push(localfile);
                      var lockfile = localfile + '.' + uuid() + '.lock';
                      
                      conf.lockfiles.push(fs.openSync(lockfile,'w'));
                      conf.lockfile_names.push(lockfile);

                      //check the file does not exist locally:
                      console.log(localfile);

                      if (fs.existsSync(localfile))
                      {
                        //exists locally
                        touch.sync(localfile);
                        console.log('exists locally');
                        reportprogress(conf);
                        cb();
                      }
                      else
                      {
                        
                        var uuid_tmp = uuid();
                        
                        if (conf.homog)
                        {
                          //console.log("looking for "+filename.remote.replace(config.S3_CLOUD_URL,'') + '_homog.mp4'+' on s3');
                            var params = {
                              localFile: localfile + '_' +  uuid_tmp  + '.part',
                              s3Params: {
                                Bucket: config.S3_TRANSCODE_BUCKET_NAME,
                                Key: "upload/"+ filename.remote + '_homog.mp4',
                              },
                            };
                          }
                          else {
                            var params = {
                              localFile: localfile + '_' +  uuid_tmp  + '.part',
                              s3Params: {
                                Bucket: config.S3_BUCKET,
                                Key: "upload/"+filename.remote,
                              },
                            };
                          }

                        var downloader = s3.downloadFile(params);
                        downloader.on('error', function(err) {
                          console.log(err);
                          reportprogress(conf);
                          cb();
                        });
                        downloader.on('progress', function() {
                          var prog = (downloader.progressAmount/downloader.progressTotal);
                        });
                        downloader.on('end', function() {
                          try
                          {
                              // console.log('renaming ' + uuid_tmp + '_' + localfile + '.part to' localfile);
                              fs.renameSync(params.localFile, localfile);
                          }
                          catch (e){
                              logger.info('Download thrown away ' + localfile + '_' +  uuid_tmp + '.part');
                              fs.unlinkSync(localfile + '_' +  uuid_tmp + '.part');
                          }

                          touch.sync(localfile);
                          reportprogress(conf);
                          cb();
                        });

                      }//end of if download
                });
              });

              //check cancel
              calls.push(
                function (cb){
                  checkcancel(conf,cb);
                });

              //upload to dropbox
              calls.push(function(cb)
              {
                  var filename = val;
                  var thepath = '/' + pf;
                  //console.log("tmp: " + path.normalize(tempdir+"/"+filename.tmp));
                  if (filename.local_file && fs.existsSync(path.normalize(tempdir+"/"+filename.local_file)))
                  {
                     console.log('file exists locally, uploading now');
                     
                    var fullpath = path.normalize(tempdir+"/"+filename.local_file);

                    //  fs.readFile(path.normalize(tempdir+"/"+filename.local_file), function(error, data) {

                      dbclient.filesUploadSessionStart({contents:new Buffer(0)}).then(function(ok){
                          console.log('upload session started');

                          var sessionid = ok.session_id;
                          var chunk_length = 1024*1024*100;
                          // var position = 0;
                          var session_id = null;
                          var subcalls = [];

                          //calculate size of file...
                          var sizeoffile = fs.statSync(fullpath).size;
                          var fd = fs.openSync(fullpath,'r');
                          var chunks = (sizeoffile / chunk_length);

                          console.log('file of ' + sizeoffile + ' in ' + chunks + ' chunks');

                          var bytespushed = 0;
                          //for each chunk, read and upload

                          for(var counter = 0;counter<chunks;counter++)
                          {
                              console.log('chunk upload ' + counter + ' registered');

                              subcalls.push(function(cb){
                                //var thecounter = counter;
                                console.log('chunk upload ' + thecounter + ' processing');
                                
                                var position = thecounter * chunk_length;
                                thecounter++;
                                
                                var data = new Buffer(chunk_length);
                                //fd, buffer, offset, length, position, callback
                                fs.read(fd, data, 0, chunk_length, position, function(err, bytesread, buffer){
                                    // position += bytesread;
                                    // console.log('read ' + bytesread + ' bytes');
                                    //do the push to dropbox.
                                    
                                    // console.log(_.size(buffer) + ' should be ' + bytesread);

                                    dbclient.filesUploadSessionAppendV2({
                                      cursor:
                                      {
                                        session_id: sessionid,
                                        offset: bytespushed
                                      },
                                      contents: buffer.slice(0,bytesread)
                                    }).then(function(ok){
                                      bytespushed += bytesread;
                                      cb();
                                    }).catch(function(err){
                                      cb(err);
                                    }); // end append
                                  });
                                });
                          }

                          subcalls.push(function(cb){
                            // console.log(_.size(data));
                            console.log('Finishing upload session at length: '+ bytespushed);
                            dbclient.filesUploadSessionFinish({
                              commit:
                              {
                                path:thepath + filename.local
                              },
                              cursor:
                              {
                                  session_id:sessionid,
                                  offset: sizeoffile
                              }
                              }).then(function(ok){
                                reportprogress(conf);
                                cb();
                            }).catch(function(err){
                              cb(err);
                            });
                          });

                          console.log('Processing ' + _.size(subcalls) + ' upload calls');
                          thecounter = 0;
                          async.series(subcalls,function(err){
                            // console.log(err);
                            
                            cb(err);
                          });

                      //  });
                     }).catch(function(err){
                       console.log(err);
                     }); // end of db session start
                  }
                  else {
                    reportprogress(conf);
                    cb();
                  }
              });

              //check cancel
              calls.push(
                function (cb){
                  checkcancel(conf,cb);
                });

              //delete local file
              calls.push(function(cb)
              {
                  var filename = val;
                  var thepath = pf;
                  if (filename.tmp)
                  {
                    console.log('deleting '+filename.tmp);
                    try {
                      fs.unlinkSync(tempdir + '/' + filename.tmp);
                    } catch (error) {
                      console.log(error);
                    }
                    
                  }
                  cb();
              });
            }
          }
      });
  }

module.exports = function(winston, db)
{
  thedb = db;
    function DoEditHandler()
    {
        this.type = 'dropbox';
        fs.mkdirsSync(__dirname + '/' + uploaddir);
        tempdir = path.normalize(__dirname + '/' + uploaddir);
    }

    DoEditHandler.prototype.work = function(conf, callback)
    {
      try{
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        logger.info('starting dropbox sync',conf);

        conf.files_in_use = [];
        conf.lockfile_names = [];
        conf.lockfiles = [];

        //go get the directory structure:
        //needs cookie:

        var j = request.jar();
        // var request = request.defaults({jar: true});
        var cookie = request.cookie('sails.sid='+conf.session);
        var url = config.master_url;

        j.setCookie(cookie, url);
        request({url: config.master_url + ':' + config.master_url_port + '/media/directorystructure/'+conf.event_id+'/?template='+conf.template+'&apikey='+ config.CURRENT_EDIT_KEY, jar: j}, function (err,resp,body) {

            if (err || resp.statusCode !=200)
            {
              logger.error(err,body);
              callback('bury');
              var collection = thedb.collection('user');
                var replacement = {};
              replacement["sync."+conf.event_id] = {dropboxsynccancel:false,dropboxsync:{msg:'Cancelled',status:'cancelled',percentage:0,stopped:true,error:err}};
              var err_obj = {
                    code:700,
                    reason:'Cannot load directory structure'
                };
              replacement['sync.error'] = err_obj;

              collection.update({"_id": new ObjectId(conf.user_id)}, {$set:replacement}, {w:1}, function(err, result) {
                
              });
              return;
            }

            var dbClient = new Dropbox({
              sandbox     : false,
              accessToken       : conf.dropbox_token.accessToken,
            });

            var s3 = ss3.createClient({
              s3Options: {
                accessKeyId: config.AWS_ACCESS_KEY_ID,
                secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                region: config.S3_REGION
              },
            });

            var allmedia = JSON.parse(body);
            var thecalls = [];
            conf.done = 0;
            conf.total = 0;

            try{
              dodirs('',allmedia,thecalls,dbClient,s3,conf);
            }
            catch (err)
            {
              callback('bury');
              var collection = thedb.collection('user');
              var replacement = {};
              var err_obj = {
                  code:702,
                  reason:'Error processing files'
              };
              replacement['sync.error'] = err_obj;
              replacement["sync."+conf.event_id] = {dropboxsynccancel:false,dropboxsync:{msg:'Cancelled',status:'cancelled',percentage:0,stopped:true,error:err}};              
              collection.update({"_id": new ObjectId(conf.user_id)}, {$set:replacement}, {w:1}, function(err, result) {
                
              });
            }
            //recurse through the dir
              //for each dir, create
              //for each file, download
              console.log('Starting processing ' + _.size(thecalls) + ' calls');
              async.series(thecalls,function(err)
              {
                logger.error(err);
                //FINISHED:
                var collection = thedb.collection('user');

                clearOut(conf);

                if (err)
                {
                  var replacement = {};
                  replacement["sync."+conf.event_id] = {dropboxsynccancel:false,dropboxsync:{msg:'Cancelled',status:'cancelled',percentage:0,stopped:true,error:err}};
                  var err_obj = {
                    code:701,
                    reason:err
                  };
                  replacement['sync.error'] = err_obj; 
                  collection.update({"_id": new ObjectId(conf.user_id)}, {$set:replacement}, {w:1}, function(err, result) {
                      //done update...
                      console.log(err);
                      //console.log(result);
                      logger.info('Dropbox Sync Error');
                      sendEmail(conf.user_id,'Dropbox Sync','Your Dropbox Sync has been Cancelled or is Incomplete. Error: '+err);
                      callback('bury');
                    });
                }
                else
                {
                  var replacement = {};
                  replacement["sync."+conf.event_id] = {dropboxsynccancel:false,dropboxsync:{msg:'Complete',status:'done',percentage:100,stopped:true}}; 
                  collection.update({"_id": new ObjectId(conf.user_id)}, {$set:replacement}, {w:1}, function(err, result) {
                      //done update...
                      console.log(err);
                      //console.log(result);
                      logger.info('Dropbox Sync Complete');
                      sendEmail(conf.user_id,'Dropbox Sync','Your Dropbox Sync is complete!');
                      callback('success');
                    });
                }

            });
        });
      }
      catch (ex){
        console.log(ex);
      }
    }


    var handler = new DoEditHandler();
    logger = winston;
    logger.info("Starting Dropbox Handler");
    return handler;
}
