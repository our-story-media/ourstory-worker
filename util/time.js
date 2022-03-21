var _ = require("lodash");

//CALCULATE TIME DIFF BETWEEN 2 STRING TIMES (SECONDS)
exports.calcTime = function (s_in, s_out) {
  // console.log(s_in);
  // console.log(s_out);
  s_in = _.split(s_in, ":");
  let i_in =
    parseFloat(s_in[2]) + parseInt(s_in[1]) * 60 + parseInt(s_in[0]) * 3600;
  s_out = _.split(s_out, ":");
  let i_out =
    parseFloat(s_out[2]) + parseInt(s_out[1]) * 60 + parseInt(s_out[0]) * 3600;

  // console.log(i_out);

  //in seconds
  return i_out - i_in;
};

exports.timecodeToTimestamp = function (s_in) {
  s_in = _.split(s_in, ":");
  let i_in =
    parseInt(s_in[3]) / 100.0 +
    parseInt(s_in[2]) +
    parseInt(s_in[1]) * 60 +
    parseInt(s_in[0]) * 3600;

  //in seconds
  return exports.calcTS(i_in);
};

//CONVERT FROM STRING TIME TO CORRECTLY FORMATTED STRING TIME
exports.normaliseTime = function (s_in) {
  // console.log(s_in);
  // console.log(s_out);
  s_in = _.split(s_in, ":");
  let i_in =
    parseFloat(s_in[2]) + parseInt(s_in[1]) * 60 + parseInt(s_in[0]) * 3600;

  return calcTS(i_in);
};

//CONVERT FROM SECONDS TO PADDED STRING TIME (with decimal)
const calcTS = function (ts) {
  // console.log(ts);
  //ts in secs
  let hours = Math.floor(ts / 3600);
  let mins = Math.floor((ts - hours * 3600) / 60);
  let secs = Math.floor(ts % 60);
  let subs = ((ts % 60) - secs).toFixed(2).toString();
  // console.log(hours, mins, secs, subs);
  return `${_.padStart(hours, 2, "0")}:${_.padStart(mins, 2, "0")}:${_.padStart(
    secs,
    2,
    "0"
  )}.${_.padStart(subs.substring(2, 4), 2, "0")}`;
};
exports.calcTS = calcTS;
