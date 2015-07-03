var fs = require('fs');
var MLT = require('mlt');
var _ = require('lodash');

var child_process = require('child_process');

var mlt = new MLT
      , multitrack = new MLT.Multitrack
      , tractor = new MLT.Tractor
      , transitionTime = 25
      , showTime = 100 + transitionTime * 2
      , mltFilename = './test.mlt';

var totallength = 200;


var files = fs.readdirSync('./upload/');
console.log(files);




// MUSIC TRACK
music = new MLT.Producer.Audio({source: music});
mlt.push(music);
var music = (new MLT.Playlist()).entry({
   producer: music,
   length: totallength
});
mlt.push(music);
multitrack.addTrack(new MLT.Multitrack.Track(music));

mlt.push(tractor.push(multitrack));

    fs.writeFile(mltFilename, mlt.toString({pretty:true}), function (err) {
      if (err) {
        return callback(err);
      }
      console.log('Finished prep...');
//      callback(null,mltFilename);
    });

var videoFilename = './test.mp4'
      , child = 'melt ' + mltFilename + ' -consumer avformat:' + videoFilename;


console.log('Melting. Please be Patient!');
    child = child_process.exec(child, function (err, stdout, stderr) {
      if (err) {
        //        return callback(err);
      }

      console.log('Finished: ' + videoFilename);
    });
