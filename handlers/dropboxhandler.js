var config = require('../config/local.js');
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
var AWS = require('aws-sdk');
AWS.config.region = config.S3_REGION;

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
            subject: 'Dropbox Sync Finished', // Subject line
            text: content, // plaintext body
    	});
    });
};

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

var dodirs = function(pf, dir, calls, dbclient, s3,conf)
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
              var tdir = pf+key;
              dbclient.readdir(tdir,function(err,existing){
                if (!existing)
                {
                  console.log('creating '+tdir);
                  dbclient.mkdir(tdir,function(err,stat)
                  {
                    cb(err);
                  });
                }
                else {
                  console.log('exists '+tdir);
                  cb();
                }
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
              //var p = pf+key;
              //download from s3

              // SET REAL VALUE OF REMOTE:
              // var options = {
              //     keypairId: config.CLOUDFRONT_KEY, 
              //     privateKeyPath: config.CLOUDFRONT_KEYFILE,
              //     expireTime: moment().add(1, 'day')
              // }

              // console.log(val);

              // val.remote = cloudfront.getSignedUrl(config.S3_CLOUD_URL + val.id + ".mp4.mp4", options);
              // val.homog = cloudfront.getSignedUrl(config.S3_TRANSCODE_URL + val.id + "_homog.mp4", options);

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

              // console.log(val.remote);

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
                  request({method:'HEAD',uri:config.master_url + '/media/homog/' + filename.id + '&apikey='+ config.CURRENT_EDIT_KEY, jar: j},function(err,response,data)
                  {
                    console.log('code: '+response.statusCode);
                    if (err || response.statusCode != 200)
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
                var thepath = pf;
                //download file
                dbclient.stat(thepath + '/' + filename.local,function(err,stat){
                   //console.log(stat);
                    if (!stat || stat.isRemoved)
                    {
                      console.log('not in dest');
                      //file not in destination, so download to tmp
                      filename.tmp = uuid.v4();
                      if (conf.homog)
                      {
                        //console.log("looking for "+filename.remote.replace(config.S3_CLOUD_URL,'') + '_homog.mp4'+' on s3');
                          var params = {
                            localFile: path.normalize(tempdir+"/"+filename.tmp),
                            s3Params: {
                              Bucket: config.S3_TRANSCODE_BUCKET_NAME,
                              Key: "upload/"+ filename.remote + '_homog.mp4',
                            },
                          };
                        }
                        else {
                          var params = {
                            localFile: path.normalize(tempdir+"/"+filename.tmp),
                            s3Params: {
                              Bucket: config.S3_BUCKET,
                              Key: "upload/"+filename.remote,
                            },
                          };
                        }
                      //console.log("from: "+"upload/"+filename.remote);
                     console.log(params);

                      var downloader = s3.downloadFile(params);
                      downloader.on('error', function(err) {
                        console.log(err);
                        reportprogress(conf);
                        cb();
                      });
                      downloader.on('progress', function() {
                        var prog = (downloader.progressAmount/downloader.progressTotal);
                        //console.log(prog);
                      });
                      downloader.on('end', function() {
                        reportprogress(conf);
                        cb();
                      });
                    }
                    else
                    {
                      console.log("file exists in dropbox");
                      reportprogress(conf);
                      cb();
                    }
                });
              });
              //upload to dropbox
              calls.push(
                function (cb){
                  checkcancel(conf,cb);
                });
              calls.push(function(cb)
              {
                  var filename = val;
                  var thepath = pf;
                  //console.log("tmp: " + path.normalize(tempdir+"/"+filename.tmp));
                  if (filename.tmp && fs.existsSync(path.normalize(tempdir+"/"+filename.tmp)))
                  {
                    console.log('file exists locally, uploading now');
                     fs.readFile(path.normalize(tempdir+"/"+filename.tmp), function(error, data) {
                        dbclient.writeFile(thepath + "/" + filename.local, data, function(error, stat) {
                          reportprogress(conf);
                          cb(error);
                        });
                     });
                  }
                  else {
                    reportprogress(conf);
                    cb();
                  }
              });
              //delete local file
              calls.push(
                function (cb){
                  checkcancel(conf,cb);
                });
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


module.exports = function(winston)
{

    function DoEditHandler()
    {
        this.type = 'dropbox';
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

    DoEditHandler.prototype.work = function(conf, callback)
    {
      try{
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        logger.info('starting dropbox sync',conf);

        //go get the directory structure:
        //needs cookie:

        var j = request.jar();
        // var request = request.defaults({jar: true});
        var cookie = request.cookie('sails.sid='+conf.session);
        var url = config.master_url;

        j.setCookie(cookie, url);
        request({url: config.master_url+ '/media/directorystructure/'+conf.event_id+'/?template='+conf.template+'&apikey='+ config.CURRENT_EDIT_KEY, jar: j}, function (err,resp,body) {
          //request(config.master_url+ '/media/directorystructure/'+conf.event_id+'/?template='+conf.template).on('response', function(response) {
            //console.log("directory struct:");
            //console.log(body);
            //console.log(resp.statusCode);
            //console.log(err);
            if (err || resp.statusCode !=200)
            {
              logger.error(err,body);
              callback('bury');
              var collection = thedb.collection('user');
                var replacement = {};
              replacement["sync."+conf.event_id] = {dropboxsynccancel:false,dropboxsync:{msg:'Cancelled',status:'cancelled',percentage:0,stopped:true,error:err}};
              collection.update({"_id": new ObjectId(conf.user_id)}, {$set:replacement}, {w:1}, function(err, result) {
                
              });
              return;
            }

            var dbClient = new Dropbox.Client({
              key         : config.dropbox_clientid,
              secret      : config.dropbox_clientsecret,
              sandbox     : false,
              token       : conf.dropbox_token.accessToken,
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
            //var total = _.merge(allmedia);
            //console.log(total);

            try{
              dodirs('',allmedia,thecalls,dbClient,s3,conf);
            }
            catch (err)
            {
              callback('bury');
              var collection = thedb.collection('user');
              var replacement = {};
              replacement["sync."+conf.event_id] = {dropboxsynccancel:false,dropboxsync:{msg:'Cancelled',status:'cancelled',percentage:0,stopped:true,error:err}};              
              collection.update({"_id": new ObjectId(conf.user_id)}, {$set:replacement}, {w:1}, function(err, result) {
                
              });
            }
            //recurse through the dir
              //for each dir, create
              //for each file, download

              async.series(thecalls,function(err)
              {
                logger.error(err);
                //FINISHED:
                var collection = thedb.collection('user');
                if (err)
                {
                  var replacement = {};
                  replacement["sync."+conf.event_id] = {dropboxsynccancel:false,dropboxsync:{msg:'Cancelled',status:'cancelled',percentage:0,stopped:true,error:err}}; 
                  collection.update({"_id": new ObjectId(conf.user_id)}, {$set:replacement}, {w:1}, function(err, result) {
                      //done update...
                      console.log(err);
                      //console.log(result);
                      logger.info('Dropbox Sync Complete');
                      sendEmail(conf.user_id,'Dropbox Sync Cancelled or Incomplete. Error: '+err);
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
                      sendEmail(conf.user_id,'Dropbox Sync Complete!');
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
