var uploaddir = "/.tmp/";
var ss3 = require("s3");
var path = require("path");
var fs = require("fs-extra");
var knox = require("knox-s3");
var AWS = require("aws-sdk");
var _ = require("lodash");
var async = require("async");
var touch = require("touch");
var uuid = require("uuid");
const he = require("he");

var fivebeans = require("fivebeans");

var client;

AWS.config.region = config.S3_REGION;

const {
  calcTime,
  timecodeToTimestamp,
  normaliseTime,
  calcTS,
} = require("../util/time");
const { title } = require("process");

module.exports = function (winston, thedb) {
  var logger = null;

  function DoEditHandler() {
    process.env.SDL_VIDEODRIVER = "dummy";
    process.env.SDL_AUDIODRIVER = "dummy";
    this.type = "edit";

    fs.mkdirsSync(__dirname + "/.." + uploaddir);
    if (config.LOCALONLY) {
      fs.mkdirsSync("/usr/src/app/upload/edits");
    } else {
      fs.mkdirsSync(__dirname + "/.." + uploaddir + "/edits");
    }

    client = new fivebeans.client(config.BEANSTALK_HOST, config.BEANSTALK_PORT);
    client
      .on("connect", function () {
        // client can now be used
        winston.info("Beanstalk client connected");
      })
      .on("error", function () {
        // connection failure
      })
      .on("close", function () {
        // underlying connection has closed
      })
      .connect();
  }

  function clearOut(edit) {
    if (!config.LOCALONLY) {
      // Remove all the lock files for this edit
      try {
        // console.log(edit);
        // fs.closeSync(edit.tmp_filename);
        fs.unlinkSync(edit.tmp_filename);
      } catch (e) {
        //do nothing, some error in removing the lockfile
        console.log(e);
      }
      _.each(edit.media, function (m) {
        if (m.id) {
          try {
            fs.closeSync(m.lock_file);
            fs.unlinkSync(m.lock_file_name);
          } catch (e) {
            //do nothing, some error in removing the lockfile
            console.log(e);
          }
        }
      });

      // //2. remove resulting file
      // //onsole.log('edit file: ' + edit.tmp_filename);
      // if (fs.existsSync(edit.tmp_filename)) {
      //   //s.unlinkSync(edit.tmp_filename);
      // }

      // cleanOutAll();
    }

    //remove all title files:
    let dir = `${path.dirname(require.main.filename)}${uploaddir}`;
    fs.readdirSync(dir).forEach((file) => {
      if (
        file.endsWith(".png") ||
        file.endsWith(".svg") ||
        file.endsWith(".bmp")
      ) {
        console.log(`Removing ${dir}${file}`);
        fs.unlinkSync(`${dir}${file}`);
      }
    });
  }

  DoEditHandler.prototype.work = function (edit, callback) {
    edit.files_in_use = [];

    try {
      if (edit.mode == "") edit.mode == "original";

      logger.info(
        "Edit Started: " + edit.id + " / " + edit.code + " @ " + edit.mode
      );

      // logger.info("Mode: " + edit.mode);
      logger.info(`Profile: ${edit.profile}, ${edit.width}x${edit.height}`);

      //download files from s3
      //join files
      var calls = [];

      var dir = path.normalize(path.dirname(require.main.filename) + uploaddir);

      var event_id = _.find(edit.media, "event_id").event_id;

      logger.info(`${config.LOCALONLY ? "LOCAL EDIT" : "S3 EDIT"}`);

      if (config.LOCALONLY)
        //volume map to the same location as the uploads dir on the disk...
        dir = path.normalize(
          `${path.dirname(require.main.filename)}/upload/${event_id}/`
        );

      if (edit.media.length < config.MIN_CLIP_COUNT) {
        logger.error("Less than " + config.MIN_CLIP_COUNT + " clips.");
        var collection = thedb.collection("edits");
        var err_obj = {
          code: 601,
          reason: "Less than " + config.MIN_CLIP_COUNT + " clips",
        };
        collection.update(
          { code: edit.code },
          {
            $set: {
              fail: true,
              failreason: "Less than " + config.MIN_CLIP_COUNT + " clips",
              error: err_obj,
            },
            $unset: { path: "" },
          },
          { w: 1 },
          function () {
            callback("bury");
          }
        );
      } else {
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
              var localfile = path.normalize(
                dir +
                  "/" +
                  media.path
                    .replace(config.S3_CLOUD_URL, "")
                    .replace(config.master_url + "/media/preview/", "")
              );

              //create lock
              // touch.sync(localfile + '.lock');
              edit.files_in_use.push(localfile);

              //if no file
              var lockfile = localfile + "." + uuid() + ".lock";
              edit.media[index].lock_file = fs.openSync(lockfile, "w");
              edit.media[index].lock_file_name = lockfile;
              if (fs.existsSync(localfile)) {
                //edit.media[index].file_handle = fs.openSync(localfile,'r');
                logger.info("Using Cache: " + localfile);
                //update file with last time it was accessed
                touch.sync(localfile);
                cb();
              } else {
                var uuid_tmp = uuid();

                //download from s3
                var s3 = ss3.createClient({
                  s3Options: {
                    accessKeyId: config.AWS_ACCESS_KEY_ID,
                    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
                    region: config.S3_REGION,
                  },
                });

                // console.log(config);

                var key = `upload/${event_id}/${media.path
                  .replace(config.S3_CLOUD_URL, "")
                  .replace(config.master_url + "/media/preview/", "")}`;

                var params = {
                  localFile: localfile + "_" + uuid_tmp + ".part",
                  s3Params: {
                    Bucket: config.S3_BUCKET,
                    Key: key,
                  },
                };

                //console.log(params);
                logger.info(`Downloading ${key} -> ${localfile}`);
                var downloader = s3.downloadFile(params);

                downloader.on("error", function (err) {
                  console.log(err);
                  //console.log("s3 error "+err);
                  cb(err.toString());
                  //release file lock
                  //fs.unlink(localfile + '.lock');
                });
                downloader.on("end", function () {
                  try {
                    // console.log('renaming ' + uuid_tmp + '_' + localfile + '.part to' localfile);
                    fs.renameSync(
                      localfile + "_" + uuid_tmp + ".part",
                      localfile
                    );
                  } catch (e) {
                    logger.info(
                      "Download thrown away " +
                        localfile +
                        "_" +
                        uuid_tmp +
                        ".part"
                    );
                    fs.unlinkSync(localfile + "_" + uuid_tmp + ".part");
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
          var videoFilename = path.normalize(
            path.dirname(require.main.filename) +
              uploaddir +
              "/edits/" +
              edit.code +
              "." +
              uuid() +
              ".edit.mp4"
          );
          if (config.LOCALONLY)
            videoFilename = path.normalize(
              path.dirname(require.main.filename) +
                "/upload/edits/" +
                edit.code +
                "." +
                uuid() +
                ".edit.mp4"
            );

          edit.tmp_filename = videoFilename;

          var thecommand = [];
          var bedtrack = null;
          var credits = null;
          var totallength = 0;
          var failedit = false;
          var totalclips = 1;
          var tagtrack = [];
          var subtitles = [];
          // var mix_adjust = 11.5 / 25;
          var mix_adjust = 0;
          let to_burn = [];

          //Generate Subtitles:
          if (edit.transcription && edit.transcription.chunks) {
            // console.log(edit.transcription);

            edit.transcription.chunks.forEach((c) => {
              if (c.review !== undefined) {
                let text = c.transcriptions.filter(
                  (t) => c.review.selectedtranscription === t.id
                )[0].content;

                let chunks = [];

                // console.log(`ss: ${c.starttimestamp}`);

                //mini-chunks:
                let length = calcTime(
                  timecodeToTimestamp(c.starttimestamp),
                  timecodeToTimestamp(c.endtimestamp)
                );
                // console.log(
                //   `length: ${length} from ${timecodeToTimestamp(
                //     c.starttimestamp
                //   )} to ${timecodeToTimestamp(c.endtimestamp)}`
                // );
                let start_time = calcTime(
                  "00:00:00.00",
                  timecodeToTimestamp(c.starttimestamp)
                );
                // console.log(`start: ${start_time}`);

                const SPLIT_LENGTH = 8.0;

                //if its more than 6 seconds:
                let words = text.split(" ");
                if (length < 6 || words.length < 8)
                  //its less than 5 seconds:
                  chunks.push({
                    starts: timecodeToTimestamp(c.starttimestamp),
                    ends: timecodeToTimestamp(c.endtimestamp),
                    text: text,
                  });
                else {
                  // console.log(`words: ${words.length}`);

                  //find a nice number that does not leave a remainder:

                  let segments = Math.floor(words.length / SPLIT_LENGTH);
                  // console.log(`segments: ${segments}`);

                  //how many sub-segments
                  // let minis = length / segments;

                  // console.log(`minis: ${minis}`);

                  // console.log(
                  //   `mini: ${minis}, reminder: ${length % SPLIT_LENGTH}`
                  // );

                  // how many rounded sub-segments (floored)
                  // let mini_round = Math.floor(minis);

                  //split words into this many chunks:
                  //how many words per sub-segment
                  let words_per_block = Math.floor(words.length / segments);

                  // let words_per_block =

                  // console.log(`words: ${words_per_block}`);
                  let counter = 0;
                  let timer = 0;

                  let new_adjuster = length / segments;

                  // console.log(`new_adjuster: ${new_adjuster}`);

                  // while (counter < words.length) {
                  for (let loop = 0; loop < segments; loop++) {
                    let subw = words.slice(counter, counter + words_per_block);

                    counter += words_per_block;

                    const starttime =
                      Math.round((start_time + timer + Number.EPSILON) * 100) /
                      100;

                    timer += new_adjuster;

                    // console.log(start_time, timer);

                    const endtime =
                      Math.round((start_time + timer + Number.EPSILON) * 100) /
                      100;

                    //if there is some remaining words (less than the segment):
                    if (words.length - counter < SPLIT_LENGTH) {
                      // console.log(
                      //   `append ${
                      //     words.length - counter
                      //   } word to this one (${endtime})`
                      // );
                      let toadd = words.slice(counter - words.length);
                      // console.log(`toadd: ${toadd}`);
                      subw.push(...toadd);
                    }

                    chunks.push({
                      starts: calcTS(starttime),
                      ends: calcTS(endtime),
                      text: subw.join(" "),
                    });
                  }
                }

                for (let chunk of chunks) {
                  to_burn.push({
                    starts: chunk.starts,
                    ends: chunk.ends,
                    text: chunk.text,
                  });
                }
              }
            });

            // console.log(to_burn);

            //SUBTITLES:
            if (to_burn.length > 0) {
              // subtitles.push("-blank 15");
              //for each subtitle, burn on text:
              for (let i = 0; i < to_burn.length; i++) {
                let title = to_burn[i];

                let titlefile = path.normalize(
                  path.dirname(require.main.filename) +
                    uploaddir +
                    "/" +
                    uuid.v1() +
                    ".png"
                );
                const spawnSync = require("child_process").execSync;
                let titletext = he.encode(title.text, {
                  encodeEverything: true,
                });

                let code = spawnSync(
                  `convert -size 1920x1080 canvas:none -bordercolor transparent -border 200x50 -fill white \\( -size 1400 -gravity center -geometry +00+500 -bordercolor "#00000088" -background "#00000088" -compose atop -border 12x12 -pointsize 40 -font /usr/src/app/fonts/NotoSans-Regular.ttf -define pango:align=center pango:"${titletext}" \\) -compose over -composite ${titlefile}`
                );
                subtitles.push(
                  `${titlefile} out=${
                    calcTime(
                      normaliseTime(title.starts),
                      normaliseTime(title.ends)
                    ) * 25
                  }`
                );
              }
            }

            // console.log(subtitles);
          }

          // return callback("bury");

          //FIRST SLIDE:
          thecommand.push("-track");
          var event_id = _.find(edit.media, "event_id").event_id;
          if (
            fs.existsSync(
              path.dirname(require.main.filename) +
                `/upload/${event_id}/branding.png`
            )
          ) {
            thecommand.push(
              path.dirname(require.main.filename) +
                `/upload/${event_id}/branding.png out=15`
            );
          } else {
            // INITIAL WHITE SLIDE
            thecommand.push("colour:white out=15");
          }

          tagtrack.push("-blank 15");
          totallength += 5.0 / 25;

          _.each(edit.media, function (m) {
            if (m.audio) {
              // console.log(m.audio);
              if (config.LOCALONLY) {
                var musicfile = path.normalize(config.MUSIC_LOCATION + m.audio);
                bedtrack = musicfile;
              } else {
                // console.log(`${config.master_url}/music/looped/${m.audio}`);
                bedtrack = `${config.master_url}/music/looped/${m.audio}`;
              }
              credits = m.credits;
            }

            if (m.id) {
              //if video:
              var footagefilename = path.normalize(
                dir + "/" + m.path.replace(config.S3_CLOUD_URL, "")
              );
              thecommand.push(footagefilename);

              var inpoint = normaliseTime(m.inpoint);
              var outpoint = normaliseTime(m.outpoint);

              thecommand.push('in="' + inpoint + '"');
              thecommand.push('out="' + outpoint + '"');
              // thecommand.push("-mix 10");
              // thecommand.push("-mixer luma");

              if (m.tag) {
                //FOR TAGGING:
                let labelfile = path.normalize(
                  path.dirname(require.main.filename) +
                    uploaddir +
                    "/" +
                    totalclips +
                    ".svg"
                );
                let contents = fs.readFileSync("labels.svg", "utf8");
                let defaulttopiclang = edit.defaulttopiclang || "en";

                let tagtext = "";
                // console.log(m.tag.values)
                if (_.has(m.tag.values, defaulttopiclang)) {
                  tagtext = m.tag.values[defaulttopiclang];
                } else {
                  tagtext = m.tag.values["en"];
                }

                contents = contents.replace("$$lable$$", tagtext);
                contents = contents.replace("$$color$$", m.tag.color);
                // console.log(labelfile)
                fs.writeFileSync(labelfile, contents);
                tagtrack.push(labelfile);
                // tagtrack.push(`in=${totallength}`);
                tagtrack.push(
                  `out=${(calcTime(m.inpoint, m.outpoint) - 0.2) * 25}`
                );
                // tagtrack.push("-mix 10");
                // tagtrack.push("-mixer luma");

                // console.log(`Label ${labelfile} ${totallength} - ${(calcTime(m.inpoint,m.outpoint)-.2)*25}`);
              } else {
                tagtrack.push(
                  `-blank ${(calcTime(m.inpoint, m.outpoint) - 0.2) * 25}`
                );
              }

              totallength += calcTime(m.inpoint, m.outpoint);
              // totallength -= mix_adjust;
              totalclips++;
            } //if title:
            else {
              try {
                let titlefile = path.normalize(
                  path.dirname(require.main.filename) +
                    uploaddir +
                    "/" +
                    uuid.v1() +
                    ".bmp"
                );
                // console.log('starting title');
                //convert to image:
                const spawnSync = require("child_process").execSync;
                // let titletext =  entities.encode(m.titletext.replace('<','').replace('>','').replace('%','&perc;'));
                let titletext = he.encode(m.titletext, {
                  encodeEverything: true,
                });
                // titletext.replace(';','\;');
                // console.log(titletext);
                let code = spawnSync(
                  `convert -size 1720x880 xc:white -background white -fill black -bordercolor white -border 100x100 +size -gravity center \\( -size 1720 -pointsize 80 -font /usr/src/app/fonts/NotoSans-Regular.ttf pango:"${titletext}" \\) -composite ${titlefile}`
                );
                thecommand.push(titlefile);
                // console.log(m.outpoint);
                // console.log(calcTime(m.outpoint));
                thecommand.push(
                  "out=" + calcTime("00:00:00.00", m.outpoint) * 25
                ); //3 seconds (usually):
                // thecommand.push("-mix 10");
                // thecommand.push("-mixer luma");
                // console.log(calcTime('00:00:00.00',m.outpoint));
                tagtrack.push(
                  `-blank ${calcTime("00:00:00.00", m.outpoint) * 25}`
                );
                // tagtrack.push("-mix 10");
                // tagtrack.push("-mixer luma");
                totallength += calcTime("00:00:00.00", m.outpoint);
                // totallength -= mix_adjust;
                totalclips++;
                // totallength += 70/25;//minus the luma overlaps
              } catch (e) {
                console.error(e);
                // console.log("EDIT FAIL");
                failedit = true;
              }
            }
          }); // end of media list

          if (failedit) return cb("Title generation failed");

          // console.log("totalframes:" + totallength);

          if (credits) {
            // console.log('doing credits');
            let titlefile = path.normalize(
              path.dirname(require.main.filename) +
                uploaddir +
                "/" +
                uuid.v1() +
                ".bmp"
            );
            // console.log('starting title');
            //convert to image:
            const spawnSync = require("child_process").execSync;
            `convert -size 1720x880 xc:white -background white -fill black -bordercolor white -border 100x100 +size -gravity center \\( -size 1720 -pointsize 80 -font /usr/src/app/fonts/NotoSans-Regular.ttf pango:"${credits}" \\) -composite ${titlefile}`;
            // let code = spawnSync(
            //   `convert -background white -fill black -font DejaVu-Sans -size 1720x880 -gravity Center -bordercolor black -border 100x100 -pointsize 60 caption:"${credits}" ${titlefile}`
            // );
            thecommand.push(titlefile);
            thecommand.push("out=75"); //3 seconds:
            // thecommand.push("-mix 10");
            // thecommand.push("-mixer luma");

            tagtrack.push(`-blank 75`);
            // tagtrack.push("-mix 10");
            // tagtrack.push("-mixer luma");
            // totallength += 70/25;//minus the luma overlaps
            totallength += calcTime("00:00:00.00", "00:00:03.00");
            // totallength -= mix_adjust;
            totalclips++;
          }

          //LAST LOGO/BLANK
          var event_id = _.find(edit.media, "event_id").event_id;
          if (
            fs.existsSync(
              path.dirname(require.main.filename) +
                `/upload/${event_id}/branding.png`
            )
          ) {
            thecommand.push(
              path.dirname(require.main.filename) +
                `/upload/${event_id}/branding.png out=50`
            );
            totallength += 5.0 / 25;
          } else {
            thecommand.push("colour:white out=15");
            totallength += 5.0 / 25;
          }

          totalclips++;

          // console.log(totallength);

          //ADJUST totaltime for transitions:
          // totallength -= (totalclips*11.5)/25;

          var maineditcommand = thecommand;

          // console.log(tagtrack);

          if (bedtrack) {
            maineditcommand.push("-audio-track " + bedtrack);
            // thecommand.push('-repeat 6')
            // let output =
            maineditcommand.push('out="' + calcTS(totallength) + '"');
            // thecommand.push("-mix 10");
            maineditcommand.push(
              "-attach-track volume:" + (config.MUSIC_VOLUME || "0.3")
            );
            // thecommand.push('-filter aloop')
            // thecommand.push('-attach volume:0db end:-70db in='+(totallength-100)+' out='+(totallength+3));
            maineditcommand.push(
              "-filter volume in=" +
                (totallength * 25 - 100) +
                ' out="' +
                calcTS(totallength) +
                '" track=1 gain=1.0 end=0'
            );
            maineditcommand.push("-transition mix in=0");
          }

          //if we are rendering the tagged version from scratch (not using HQ version)
          if (edit.mode == "original") {
            maineditcommand.push(`-video-track ${tagtrack.join(" ")}`);
            maineditcommand.push(
              "-transition composite fill=0 a_track=0 b_track=2"
            );

            if (subtitles.length > 0) {
              maineditcommand.push(`-video-track ${subtitles.join(" ")}`);
              maineditcommand.push(
                "-transition composite fill=0 a_track=0 b_track=3"
              );
            }
          }

          var taggedcommand = [];

          taggedcommand.push(edit.tmp_filename);
          taggedcommand.push(`-video-track ${tagtrack.join(" ")}`);
          taggedcommand.push(
            "-transition composite fill=0 a_track=0 b_track=1"
          );
          if (subtitles.length > 0) {
            taggedcommand.push(`-video-track ${subtitles.join(" ")}`);
            taggedcommand.push(
              "-transition composite fill=0 a_track=0 b_track=2"
            );
          }
          taggedcommand.push("-progress");
          taggedcommand.push("-profile hdv_720_25p");
          taggedcommand.push(
            "-consumer avformat:" +
              edit.tmp_filename +
              ` real_time=-2 r=25 width=${edit.width || "1920"} height=${
                edit.height || "1080"
              } strict=experimental`
          );

          maineditcommand.push("-progress");
          maineditcommand.push(`-profile ${edit.profile || "hdv_720_25p"}`);

          maineditcommand.push(
            "-consumer avformat:" +
              videoFilename +
              ` real_time=-2 r=25 width=${edit.width || "1920"} height=${
                edit.height || "1080"
              } strict=experimental`
          );
          // maineditcommand.push("-consumer xml:" + videoFilename + ".xml"); // b=3000 frag_duration=30");

          // console.log(taggedcommand.join(' '));

          logger.info("Editing. Please be Patient!");

          var lastprogress = 0;

          /** FOR TESTING */
          // logger.info(`Total: ${totallength}`);
          // logger.info(`Items: ${edit.media.length}`);

          // cb('bury');

          //create original:
          var totalperc = 0;
          var exec = require("child_process").exec;
          console.log("melt " + maineditcommand.join(" "));

          //render both the untagged and tagged video
          var actualcmd = `melt ${maineditcommand.join(
            " "
          )} && melt ${taggedcommand.join(" ")}`;

          //render just the tagged video (assuming no priors exist)
          if (edit.mode == "original")
            actualcmd = `melt ${maineditcommand.join(" ")}`;

          // only render non-tagged version in HQ
          if (edit.mode == "high")
            actualcmd = `melt ${maineditcommand.join(" ")}`;

          //only render tagged version (needs hq to exist)
          if (edit.mode == "tagged") {
            //normally we would be rendering the tagged version based on the previously created original -- in this case, we want to use a previously existing original and just add the tags:
            var pathtoorig = path.normalize(
              __dirname + "/../upload/edits/" + edit.code + "_hq.mp4"
            );
            if (!fs.existsSync(pathtoorig)) {
              logger.error(
                "Original file does not exist for creating tagged render"
              );
              var collection = thedb.collection("edits");
              var err_obj = {
                code: 610,
                reason:
                  "Original file does not exist for creating tagged render",
              };
              collection.update(
                { code: edit.code },
                {
                  $set: {
                    fail: true,
                    failreason: err_obj.reason,
                    error: err_obj,
                  },
                  $unset: { path: "" },
                },
                { w: 1 },
                function () {
                  callback("bury");
                }
              );
            }
            taggedcommand[0] = pathtoorig;

            actualcmd = `melt ${taggedcommand.join(" ")}`;
          }

          var child = exec(
            actualcmd,
            { maxBuffer: 1024 * 1024 * 1024 * 1024 },
            function (err) {
              logger.info("Done Editing");
              if (err) logger.error(err);
            }
          );

          child.stdout.on("data", function (data) {
            logger.info("" + data);
            //console.log("stdout: "+data);
          });
          child.stderr.on("data", function (data) {
            console.log("" + data);
            var re = /percentage:\s*(\d*)/;
            var perc = re.exec(data);

            if (perc) {
              if (perc && perc[1] != lastprogress) {
                //update db if progress changed:

                totalperc += perc[1] - lastprogress;

                lastprogress = perc[1];

                // console.log(totalperc);

                var updateprog = totalperc;
                if (
                  edit.mode == "tagged" ||
                  edit.mode == "original" ||
                  edit.mode == "high"
                )
                  updateprog = totalperc;
                else updateprog = totalperc / 2;

                var collection = thedb.collection("edits");
                collection.update(
                  { code: edit.code },
                  { $set: { progress: updateprog } },
                  { w: 1 },
                  function () {
                    //done collection update
                  }
                );

                if (perc[1] == 99) totalperc += 100;
              }
            }
          });
          child.on("error", function (data) {
            logger.error("" + data);

            cb(data);
          });
          child.on("close", function (code) {
            logger.info("MLT closing code: " + code);
            // console.log("edit return code " + code);
            //sucess!
            //fs.renameSync(edit.)
            if (code != 0) cb("Editing Failed");
            else cb();
          });
        });

        //upload to s3
        calls.push(function (cb) {
          // //FOR DEBUGGING
          //return cb(null);
          let name = ".mp4";

          if (edit.mode == "high") name = "_hq.mp4";
          if (edit.mode == "tagged") name = "_tags.mp4";
          if (edit.mode == "original") name = ".mp4";

          if (config.LOCALONLY) {
            //copy the file to the right location:

            if (fs.existsSync(edit.tmp_filename)) {
              fs.moveSync(
                edit.tmp_filename,
                path.normalize(
                  __dirname + "/../upload/edits/" + edit.code + name
                ),
                {
                  overwrite: true,
                }
              );
            }

            console.log("Local file(s) moved");
            cb();
          } else {
            var knox_params = {
              key: config.AWS_ACCESS_KEY_ID,
              secret: config.AWS_SECRET_ACCESS_KEY,
              bucket: config.S3_BUCKET,
            };
            var client = knox.createClient(knox_params);

            //   console.log(path.normalize(path.dirname(require.main.filename) + uploaddir + edit.code + ".mp4"));
            client.putFile(
              edit.tmp_filename,
              "upload/edits/" + edit.code + name,
              function (err) {
                //console.log(err);
                if (err) {
                  logger.error(err);
                  cb(err.toString());
                } else {
                  logger.info("Uploaded Mainfile");
                  cb();
                  // client.putFile(
                  //   edit.tmp_filename + "_tags.mp4",
                  //   "upload/edits/" + edit.code + "_tags.mp4",
                  //   function (err) {
                  //     //console.log(err);
                  //     if (err) {
                  //       logger.error(err);
                  //       cb(err.toString());
                  //     } else {
                  //       logger.info("Uploaded Tagged File");
                  //       cb();
                  //     }
                  //   }
                  // );
                  // cb();
                }
              }
            );
          }
        });

        //TRANSCODE OUPUT:
        calls.push(function (cb) {
          // FOR DEBUGGING
          //return cb(null);

          //if its the original one, then we need a preview
          if (config.LOCALONLY) {
            if (edit.mode == "original") {
              //run to local transcoder:
              winston.info("Transcoding Edit");
              //push new transcode onto queue:s
              var input = path.normalize("edits/" + edit.code + ".mp4");
              var output = path.normalize("edits/" + edit.code + ".mp4");
              var payload = {
                input: input,
                output: output,
              };

              client.use("edits", function () {
                client.put(
                  10,
                  0,
                  1000000000,
                  JSON.stringify([
                    "edits",
                    { type: "transcode", payload: payload },
                  ]),
                  function (err) {
                    if (!err) winston.info("Transcode submitted");
                    else winston.error(err);

                    cb();
                  }
                );
              });
            } else {
              cb();
            }
          } else {
            AWS.config.update({
              accessKeyId: config.AWS_ACCESS_KEY_ID,
              secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
            });
            var elastictranscoder = new AWS.ElasticTranscoder();
            elastictranscoder.createJob(
              {
                PipelineId: config.ELASTIC_PIPELINE,
                //InputKeyPrefix: '/upload',
                // OutputKeyPrefix: 'upload/edits',
                Input: {
                  Key: "upload/edits/" + edit.code + ".mp4",
                  FrameRate: "auto",
                  Resolution: "auto",
                  AspectRatio: "auto",
                  Interlaced: "auto",
                  Container: "auto",
                },
                Output: {
                  Key: "upload/edits/" + edit.code + ".mp4",
                  //CreateThumbnails:true,
                  // ThumbnailPattern: edit.code + '-{count}',
                  PresetId: config.TRANSCODE_PRESET, // specifies the output video format
                  Rotate: "auto",
                },
              },
              function (error) {
                // handle callback

                //console.log(data);
                // console.log('transcode submitted');
                if (error) {
                  logger.error(error);
                  cb(error.toString());
                } else {
                  logger.info("Transcode submitted");
                  cb();
                }
              }
            );
          }
        });

        //console.log(calls);

        async.series(calls, function (err) {
          try {
            clearOut(edit);
          } catch (e) {
            console.log(e);
          }

          if (err) {
            edit.failed = true;
            //delete edit.code;
            logger.error("Editing Failed");
            logger.error(err);
            //update edit record
            var collection = thedb.collection("edits");
            var err_obj = {
              code: 600,
              reason: err,
            };
            collection.update(
              { code: edit.code },
              {
                $set: { failed: true, failreason: err, error: err_obj },
                $unset: { path: "" },
              },
              { w: 1 },
              function (err) {
                //done update...
                logger.error(err);
                callback("bury");
              }
            );
          } else {
            logger.info("Editing Done");

            edit.path = edit.shortlink + ".mp4";

            var updt = { path: edit.path, progress: 100 };

            // if (!edit.mode) {
            //   updt.hastagged = true;
            //   updt.hasoriginal = true;
            // }

            if (edit.mode && edit.mode == "tagged") updt.hastagged = true;

            if (edit.mode && edit.mode == "original") updt.hasoriginal = true;

            if (edit.mode && edit.mode == "high") updt.hashighquality = true;

            //TODO: MASSIVE HACK - REMOVE FOR USE
            // return callback("bury");

            var collection = thedb.collection("edits");
            collection.update(
              { code: edit.code },
              {
                $set: updt,
                $unset: { failed: false, failereason: false, error: false },
              },
              { w: 1 },
              function (err) {
                //done update...
                if (err) logger.error(err);
                //logger.info(result);
                callback("success");
              }
            );
          }
        });
      }
    } catch (e) {
      logger.error(e);
      callback("bury");
    }
  };

  var handler = new DoEditHandler();
  logger = winston;
  logger.info("Starting Edit Handler");
  return handler;
};
