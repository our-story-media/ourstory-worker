var uploaddir = "/.tmp/";
var ss3 = require('s3');
var path = require('path');
var fs = require('fs-extra');
var knox = require('knox-s3');
var AWS = require('aws-sdk');
var _ = require('lodash');
var async = require('async');
var touch = require("touch");
var uuid = require('uuid');

var fivebeans = require('fivebeans');

var client;

AWS.config.region = config.S3_REGION;


function calcTime(s_in,s_out)
{
    // console.log(s_in);
    // console.log(s_out);
    s_in = _.split(s_in,':');
    let i_in = parseFloat(s_in[2]) + parseInt(s_in[1])*60 + parseInt(s_in[0])*3600;
    s_out = _.split(s_out,':');
    let i_out = parseFloat(s_out[2]) + parseInt(s_out[1])*60 + parseInt(s_out[0])*3600;

    //in seconds
    return i_out-i_in;
}

function calcTS(ts)
{
    // console.log(ts);
    //ts in secs
    let hours = Math.floor(ts/3600);
    let mins = Math.floor((ts - (hours*3600)) / 60);
    let secs = Math.floor(ts % 60);
    let subs = (ts%60 - secs).toString();
    // console.log(hours, mins, secs, subs);
    return `${_.padStart(hours,2,'0')}:${_.padStart(mins,2,'0')}:${_.padStart(secs,2,'0')}.${subs.substring(2)}`;
}

module.exports = function (winston, thedb) {
    //var thedb = null;
    var logger = null;

    function DoEditHandler() {
        process.env.SDL_VIDEODRIVER = 'dummy';
        process.env.SDL_AUDIODRIVER = 'dummy';
        this.type = 'edit';

        fs.mkdirsSync(__dirname + '/..' + uploaddir);
        fs.mkdirsSync(__dirname + '/..' + uploaddir + '/edits');

        client = new fivebeans.client(config.BEANSTALK_HOST,config.BEANSTALK_PORT);
        client.on('connect', function()
        {
            // client can now be used
            winston.info('Beanstalk client connected')
        })
        .on('error', function()
        {
            // connection failure
        })
        .on('close', function()
        {
            // underlying connection has closed
        })
        .connect();
    }

    function clearOut(edit) {
        if (!config.LOCALONLY) {

            // Remove all the lock files for this edit
            _.each(edit.media, function (m) {
                if (m.id) {
                    fs.closeSync(m.lock_file);
                    fs.unlinkSync(m.lock_file_name);
                }
            });

            //2. remove resulting file
            //onsole.log('edit file: ' + edit.tmp_filename);
            if (fs.existsSync(edit.tmp_filename)) {
                //s.unlinkSync(edit.tmp_filename);
            }

            cleanOutAll();
        }
    }

    DoEditHandler.prototype.work = function (edit, callback) {
        edit.files_in_use = [];

        try {
            logger.info("Edit Started: " + edit.id + " / " + edit.code);

            // //console.log(os.platform());
            // if (os.platform() == "win32") {
            //     process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg.exe');
            //     process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe.exe');
            // }
            // else {
            //     process.env.FFMPEG_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffmpeg');
            //     process.env.FFPROBE_PATH = path.normalize(path.dirname(require.main.filename) + '/ffmpeg/ffprobe');
            // }

            //download files from s3
            //join files
            var calls = [];

            var dir = path.normalize(path.dirname(require.main.filename) + uploaddir);

            var event_id = _.find(edit.media,'event_id').event_id;

            if (config.LOCALONLY)
                //volume map to the same location as the uploads dir on the disk...
                dir = path.normalize(`${path.dirname(require.main.filename)}/upload/${event_id}/`);

            if (edit.media.length < config.MIN_CLIP_COUNT) {
                logger.error("Less than " + config.MIN_CLIP_COUNT + " clips.");
                var collection = thedb.collection('edits');
                var err_obj = {
                    code: 601,
                    reason: 'Less than ' + config.MIN_CLIP_COUNT + ' clips'
                };
                collection.update({ code: edit.code }, { $set: { fail: true, failreason: 'Less than ' + config.MIN_CLIP_COUNT + ' clips', error: err_obj }, $unset: { path: "" } }, { w: 1 }, function () {
                    callback('bury');
                });
            }
            else {
                //download                
                _.each(edit.media, function (m, index) {
                    if (m.id) {
                        calls.push(function (cb) {
                            var media = m;

                            if (config.LOCALONLY) {
                                //assume the file is already there (as its local)
                                return cb();
                            }

                            //if there is a file lock, then change the name of the local file we are using
                            var localfile = path.normalize(dir + "/" + media.path.replace(config.S3_CLOUD_URL, '').replace(config.master_url + '/media/preview/', ''));

                            //create lock
                            // touch.sync(localfile + '.lock');
                            edit.files_in_use.push(localfile);

                            //if no file
                            var lockfile = localfile + '.' + uuid() + '.lock';
                            edit.media[index].lock_file = fs.openSync(lockfile, 'w');
                            edit.media[index].lock_file_name = lockfile;
                            if (fs.existsSync(localfile)) {
                                //edit.media[index].file_handle = fs.openSync(localfile,'r');
                                logger.info("Using Cache: " + localfile);
                                //update file with last time it was accessed
                                touch.sync(localfile);
                                cb();
                            }
                            else {
                                var uuid_tmp = uuid();


                                //download from s3
                                var s3 = ss3.createClient({
                                    s3Options: {
                                        accessKeyId: config.AWS_ACCESS_KEY_ID,
                                        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                                        region: config.S3_REGION
                                    },
                                });

                                var params = {
                                    localFile: localfile + '_' + uuid_tmp + '.part',
                                    s3Params: {
                                        Bucket: config.S3_BUCKET,
                                        Key: "upload/" + event_id + "/" + media.path.replace(config.S3_CLOUD_URL, '').replace(config.master_url + '/media/preview/', '')
                                    },
                                };

                                //console.log(params);
                                logger.info('Downloading: ' + localfile);
                                var downloader = s3.downloadFile(params);

                                downloader.on('error', function (err) {
                                    //console.log("s3 error "+err);
                                    cb(err.toString());
                                    //release file lock
                                    //fs.unlink(localfile + '.lock');
                                });
                                downloader.on('end', function () {
                                    try {
                                        // console.log('renaming ' + uuid_tmp + '_' + localfile + '.part to' localfile);
                                        fs.renameSync(localfile + '_' + uuid_tmp + '.part', localfile);
                                    }
                                    catch (e) {
                                        logger.info('Download thrown away ' + localfile + '_' + uuid_tmp + '.part');
                                        fs.unlinkSync(localfile + '_' + uuid_tmp + '.part');
                                    }

                                    //edit.media[index].file_handle = fs.openSync(localfile,'r');
                                    touch.sync(localfile);
                                    cb();
                                });
                            }

                        });
                    }
                });

                calls.push(function (cb) {

                    // //FOR DEBUGGING
                    //return cb(null);

                    //OUTPUT:
                    var videoFilename = path.normalize(path.dirname(require.main.filename) + uploaddir + '/edits/' + edit.code + '.' + uuid() + ".edit.mp4");
                    if (config.LOCALONLY)
                        videoFilename = path.normalize(path.dirname(require.main.filename) + '/upload/edits/' + edit.code + '.' + uuid() + ".edit.mp4");

                    edit.tmp_filename = videoFilename;

                    var thecommand = [];
                    var bedtrack = null;
                    var credits = null;
                    var totallength = 0;
                    var failedit = false;
                    var totalclips = 1;
                    var tagtrack = [];
                    var mix_adjust = 11.5/25;

                    // INITIAL BLACK SLIDE
                    thecommand.push('colour:black out=15');
                    totallength += 5.0/25;
                    tagtrack.push('-blank 15');


                    _.each(edit.media, function (m) {

                        if (m.audio)
                        {
                            // console.log(m.audio);
                            var musicfile = path.normalize(config.MUSIC_LOCATION + m.audio);
                            // console.log(musicfile);
                            bedtrack = musicfile;
                            credits = m.credits;
                        }

                        if (m.id) //if video:
                        {
                            var footagefilename = path.normalize(dir + "/" + m.path.replace(config.S3_CLOUD_URL, ''));
                            thecommand.push(footagefilename);
                            
                            thecommand.push('in="' + m.inpoint + '"');
                            thecommand.push('out="' + m.outpoint + '"');
                            thecommand.push("-mix 10");
                            thecommand.push("-mixer luma");
                            
                            if (m.tag)
                            {
                                //FOR TAGGING:
                                let labelfile = path.normalize(uploaddir + '/' + totalclips + '.svg');
                                let contents = fs.readFileSync('labels.svg', 'utf8');
                                contents = contents.replace('$$lable$$',m.tag.values['en']);
                                contents = contents.replace('$$color$$',m.tag.color);
                                fs.writeFileSync(labelfile, contents);
                                tagtrack.push(labelfile);
                                tagtrack.push(`out=${(calcTime(m.inpoint,m.outpoint)-.2)*25}`);
                                tagtrack.push("-mix 10");
                                tagtrack.push("-mixer luma");
                            }

                            totallength+= calcTime(m.inpoint,m.outpoint);
                            totallength -= mix_adjust;
                            totalclips++;
                        }
                        else //if title:
                        {
                            try
                            {
                                let titlefile = path.normalize(uploaddir + '/' + uuid.v1() + '.bmp');
                                // console.log('starting title');
                                //convert to image:
                                const spawnSync = require('child_process').execSync;
                                let code = spawnSync(`convert -size 1720x880 xc:black -background black -fill white -bordercolor black -border 100x100 +size -gravity center \\( -size 1720 -pointsize 80 -font /usr/src/app/fonts/NotoSans-Regular.ttf pango:"${m.titletext}" \\) -composite ${titlefile}`);
                                thecommand.push(titlefile);
                                // console.log(m.outpoint);
                                // console.log(calcTime(m.outpoint));
                                thecommand.push('out=' + (calcTime('00:00:00.00',m.outpoint)*25)); //3 seconds (usually):
                                thecommand.push("-mix 10");
                                thecommand.push("-mixer luma");
                                // console.log(calcTime('00:00:00.00',m.outpoint));
                                tagtrack.push(`-blank ${(calcTime('00:00:00.00',m.outpoint)*25)}`);
                                tagtrack.push("-mix 10");
                                tagtrack.push("-mixer luma");
                                totallength += calcTime('00:00:00.00',m.outpoint);
                                totallength -= mix_adjust;
                                totalclips++;
                                // totallength += 70/25;//minus the luma overlaps
                            }
                            catch (e)
                            {
                                console.error(e);
                                // console.log("EDIT FAIL");
                                failedit = true;
                            }
                        }
                    }); // end of media list

                    if (failedit)
                        return cb("Title generation failed");
                    
                    // console.log("totalframes:" + totallength);
                    
                    if (credits)
                    {
                        console.log('doing credits');
                        let titlefile = path.normalize(uploaddir + '/' + uuid.v1() + '.bmp');
                        // console.log('starting title');
                        //convert to image:
                        const spawnSync = require('child_process').execSync;
                        let code = spawnSync(`convert -background black -fill white -font DejaVu-Sans -size 1720x880 -gravity Center -bordercolor black -border 100x100 -pointsize 60 caption:"${credits}" ${titlefile}`);
                        thecommand.push(titlefile);
                        thecommand.push('out=75'); //3 seconds:
                        thecommand.push("-mix 10");
                        thecommand.push("-mixer luma");

                        tagtrack.push(`-blank 75`);
                        tagtrack.push("-mix 10");
                        tagtrack.push("-mixer luma");
                        // totallength += 70/25;//minus the luma overlaps
                        totallength += calcTime('00:00:00.00','00:00:03.00');
                        totallength -= mix_adjust;
                        totalclips++;
                    }

                    //LAST FRAME
                    thecommand.push('colour:black out=15 -mix 10 -mixer luma');
                    totallength+=5.0/25;
                    totalclips++;

                    console.log(totallength);
                    

                    //ADJUST totaltime for transitions:
                    // totallength -= (totalclips*11.5)/25;


                    var maineditcommand = thecommand;

                    console.log(tagtrack);
                    

                    var taggedcommand = [];
                    taggedcommand.push(edit.tmp_filename)
                    taggedcommand.push(`-video-track ${tagtrack.join(' ')}`);
                    taggedcommand.push('-transition composite fill=0 a_track=0 b_track=1');
                    taggedcommand.push('-progress');
                    taggedcommand.push('-profile hdv_720_25p');
                    taggedcommand.push('-consumer avformat:' + edit.tmp_filename + ".tagged.mp4 real_time=-2 r=25 width=1920 height=1080 strict=experimental -serialize command.melt");// b=3000 frag_duration=30");


                    if (bedtrack)
                    {
                        thecommand.push('-audio-track ' + bedtrack);
                        // thecommand.push('-repeat 6')
                        // let output = 
                        thecommand.push('out="' + calcTS(totallength) + '"');
                        // thecommand.push("-mix 10");
                        thecommand.push('-attach-track volume:'+(config.MUSIC_VOLUME||'0.3'));
                        // thecommand.push('-filter aloop')
                        // thecommand.push('-attach volume:0db end:-70db in='+(totallength-100)+' out='+(totallength+3));
                        thecommand.push('-filter volume in='+(totallength*25-100)+' out="'+calcTS(totallength)+'" track=1 gain=1.0 end=0');
                        thecommand.push('-transition mix in=0');
                    }

                    maineditcommand.push('-progress');
                    maineditcommand.push('-profile hdv_720_25p');
                    maineditcommand.push('-consumer avformat:' + videoFilename + " real_time=-2 r=25 width=1920 height=1080 strict=experimental");// b=3000 frag_duration=30");
                    // maineditcommand.push('-consumer xml:' + videoFilename + ".xml");// b=3000 frag_duration=30");

                    // console.log(taggedcommand.join(' '));
                    
                    logger.info('Editing. Please be Patient!');

                    var lastprogress = 0;

/** FOR TESTING */
logger.info(`Total: ${totallength}`);
logger.info(`Items: ${edit.media.length}`);

// cb('bury');

                    //create original:
                    var totalperc = 0;
                    var exec = require('child_process').exec;
                    console.log('melt ' + maineditcommand.join(' '));
                    var child = exec(`melt ${maineditcommand.join(' ')} && melt ${taggedcommand.join(' ')}`, { maxBuffer: 1024 * 1024 }, function (err) {
                        logger.info('Done Editing');
                        if (err)
                            logger.error(err);
                        //cb(code!=0);
                    });

                    child.stdout.on('data', function (data) {
                        logger.info('' + data);
                        //console.log("stdout: "+data);
                    });
                    child.stderr.on('data', function (data) {
                        console.log('' + data);
                        var re = /percentage:\s*(\d*)/;
                        var perc = re.exec(data);

                        if (perc) {
                            if (perc && perc[1] != lastprogress) {
                                //update db if progress changed:
                                
                                totalperc += perc[1] - lastprogress;

                                lastprogress = perc[1];

                                // console.log(totalperc);
                                
                                var collection = thedb.collection('edits');
                                collection.update({ code: edit.code }, { $set: { progress: totalperc/2 } }, { w: 1 }, function () {
                                    //done collection update
                                });

                                if (perc[1]==99)
                                    totalperc +=100;
                            }
                        }
                    });
                    child.on('error', function (data) {
                        logger.error('' + data);

                        cb(data);
                    });
                    child.on('close', function (code) {
                        logger.info('MLT closing code: ' + code);
                        // console.log("edit return code " + code);
                        //sucess!
                        //fs.renameSync(edit.)
                        if (code != 0)
                            cb("MLT FAIL");
                        else
                            cb();
                        
                    });
                });

                //upload to s3
                calls.push(function (cb) {
                    // //FOR DEBUGGING
                    //return cb(null);

                    if (config.LOCALONLY) {
                        //copy the file to the right location:
                        fs.moveSync(edit.tmp_filename, path.normalize(__dirname + '/../upload/edits/' + edit.code + ".mp4"),{
                            overwrite:true
                        });
                        fs.moveSync(edit.tmp_filename+'.tagged.mp4', path.normalize(__dirname + '/../upload/edits/' + edit.code + ".tagged.mp4"),{
                            overwrite:true
                        });
                        console.log('Local file moved');
                        cb();
                    }
                    else {
                        var knox_params = {
                            key: config.AWS_ACCESS_KEY_ID,
                            secret: config.AWS_SECRET_ACCESS_KEY,
                            bucket: config.S3_BUCKET
                        };
                        var client = knox.createClient(knox_params);

                        //   console.log(path.normalize(path.dirname(require.main.filename) + uploaddir + edit.code + ".mp4"));
                        client.putFile(edit.tmp_filename, 'upload/edits/' + edit.code + ".mp4", { 'x-amz-acl': 'public-read' },
                            function (err) {
                                //console.log(err);
                                if (err) {
                                    logger.error(err);
                                    cb(err.toString());
                                }
                                else {
                                    logger.info("Uploaded Mainfile");
                                    client.putFile(edit.tmp_filename + '.tagged.mp4', 'upload/edits/' + edit.code + ".tagged.mp4", { 'x-amz-acl': 'public-read' },
                                        function (err) {
                                            //console.log(err);
                                            if (err) {
                                                logger.error(err);
                                                cb(err.toString());
                                            }
                                            else {
                                                logger.info("Uploaded Tagged File");
                                                cb();
                                            }
                                        });
                                    // cb();
                                }
                            });
                    }
                });

                //TRANSCODE OUPUT:
                calls.push(function (cb) {
                    // FOR DEBUGGING
                    //return cb(null);

                    if (config.LOCALONLY) {
                        //run to local transcoder:
                        winston.info("Transcoding Edit");
                        //push new transcode onto queue:s
                        var input = path.normalize('edits/' + edit.code + ".mp4");
                        var output = path.normalize('edits/' + edit.code + ".mp4");
                        var payload = {
                            input:input,
                            output:output
                        };

                        client.use("edits", function () {
                            client.put(10, 0, 1000000000, JSON.stringify(['edits', { type: 'transcode', payload: payload }]), function (err) {
                                if (!err)
                                    winston.info("Transcode submitted");
                                else
                                    winston.error(err);

                                cb();
                            });
                        });

                        
                    }
                    else {

                        AWS.config.update({ accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY });
                        var elastictranscoder = new AWS.ElasticTranscoder();
                        elastictranscoder.createJob({
                            PipelineId: config.ELASTIC_PIPELINE,
                            //InputKeyPrefix: '/upload',
                            OutputKeyPrefix: 'upload/edits',
                            Input: {
                                Key: 'upload/edits/' + edit.code + '.mp4',
                                FrameRate: 'auto',
                                Resolution: 'auto',
                                AspectRatio: 'auto',
                                Interlaced: 'auto',
                                Container: 'auto'
                            },
                            Output: {
                                Key: edit.code + '.mp4',
                                //CreateThumbnails:true,
                                ThumbnailPattern: edit.code + '-{count}',
                                PresetId: config.TRANSCODE_PRESET, // specifies the output video format
                                Rotate: 'auto'
                            }
                        }, function (error) {
                            // handle callback 

                            //console.log(data);
                            // console.log('transcode submitted');
                            if (error) {
                                logger.error(error);
                                cb(error.toString());
                            }
                            else {
                                logger.info("Transcode submitted");
                                cb();
                            }
                        });
                    }
                });

                //console.log(calls);

                async.series(calls, function (err) {

                    try {
                        clearOut(edit);
                    }
                    catch (e) {
                        console.log(e);
                    }

                    if (err) {
                        edit.failed = true;
                        //delete edit.code;
                        logger.error("Editing Failed");
                        logger.error(err);
                        //update edit record
                        var collection = thedb.collection('edits');
                        var err_obj = {
                            code: 600,
                            reason: err
                        };
                        collection.update({ code: edit.code }, { $set: { failed: true, failreason: err, error: err_obj }, $unset: { path: "" } }, { w: 1 }, function (err) {
                            //done update...
                            logger.error(err);
                            callback('bury');
                        });
                    }
                    else {
                        logger.info("Editing Done");
                        edit.path = edit.shortlink + '.mp4';

                        var collection = thedb.collection('edits');
                        collection.update({ code: edit.code }, { $set: { path: edit.path, progress:100 }, $unset: { failed: false, failereason: false, error: false } }, { w: 1 }, function (err) {
                            //done update...
                            if (err) logger.error(err);
                            //logger.info(result);
                            callback('success');
                        });
                    }
                });
            }
        }
        catch (e) {
            logger.error(e);
            callback('bury');
        }
    }

    var handler = new DoEditHandler();
    logger = winston;
    logger.info("Starting Edit Handler");
    return handler;
};