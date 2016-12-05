//edit file:
var winston = require('winston');
var fivebeans = require('fivebeans').worker;
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectId;
var config = require('./config/local.js');
var sendgrid  = require('sendgrid')(config.email.SENDGRID_ID);
var moment = require('moment');
var uploaddir = "/.tmp/";
var fs = require('fs-extra');
var path = require('path');
var _ = require('lodash');

//ENTRY POINT:
start();

function start()
{
	winston.remove(winston.transports.Console);
	winston.add(winston.transports.Console, {colorize: true});
    require('winston-mongodb').MongoDB;
    winston.add(winston.transports.MongoDB, {
		db:'mongodb://'+((config.db_user != '') ? (config.db_user + ':' + config.db_password + '@'):'')  + config.db_host + ':' + config.db_port + '/' + config.db_database,
		collection:'log',
        storeHost:true
    });

    winston.info("Transcode and Sync Server Started");

	connection = 'mongodb://'+((config.db_user != '') ? (config.db_user + ':' + config.db_password + '@'):'')  + config.db_host + ':' + config.db_port + '/' + config.db_database;
	MongoClient.connect(connection, function(err, db) {
		if(err) throw err;
		thedb = db;
   		winston.info("Database connection established");
		
		var runner = new fivebeans({
			id:'transcode-server',
			host:config.BEANSTALK_HOST,
			port:config.BEANSTALK_PORT,
			ignoreDefault:true,
			handlers:
			{
				edit: require('./handlers/edithandler')(winston,db),
				dropbox: require('./handlers/dropboxhandler')(winston,db),
				audio: require('./handlers/audiosynchandler')(winston,db)
			},
		});
		runner.on('error',function(err)
		{
			winston.error(err);
		});
		runner.on('started',function(err)
		{
			winston.info("Connected to tube");
		});
		runner.on('info',function(err)
		{
			//winston.info(err);
		});
		runner.start(['edits']);
	});
}

function sendEmail(userid,subject,body)
{
	var collection = thedb.collection('user');
	collection.findOne({"_id": new ObjectId(userid)}, function(err, doc) {

		var email = new sendgrid.Email({
			// to:       doc.profile.emails[0].value,
			to: 'tom@bartindale.com',
			replyto:  "no-reply@bootlegger.tv",
			from:     "info@bootlegger.tv",
			fromname: "Bootlegger",
			subject:  subject,
			html:     body
		});
		
		email.addFilter('templates', 'enable', 1);
		email.addFilter('templates', 'template_id', config.email.SENDGRID_TEMPLATE);
		email.addSubstitution('%sentat%', moment().format('HH:mm'));
		email.addSubstitution('%senton%', moment().format('ddd Do MMM'));
		email.addSubstitution('%url%', config.master_url);
		email.addSubstitution('%btnurl%', config.master_url);
		email.addSubstitution('%btntext%', 'Visit Bootlegger Now');
		email.addSubstitution('%name%', doc.profile.displayName);
		
		sendgrid.send(email, function(err, json) {
			if (err) console.error(err); 
			console.log(json);
		});
	});
};

function cleanOutAll()
{
	// List all files 
        var allfiles = fs.readdirSync(path.normalize(path.dirname(require.main.filename) + uploaddir));

        //3 hours ago
        var ZOMBIE_TIMEOUT = Date.now() - (3 * 3600000);

        //Remove all lock files from anywhere older then 3 hours (for failed things half way through)
        var zombie_lockfiles = _.filter(allfiles,function(f){
            var stats = fs.statSync(path.normalize(path.dirname(require.main.filename) + uploaddir) + f);
            //console.log(stats.atime.getTime())
            return stats.atime.getTime() < ZOMBIE_TIMEOUT && (_.endsWith('.part') || _.endsWith('.lock'));
        });

        winston.info('Removing Zombies: ' + _.size(zombie_lockfiles));
        _.each(zombie_lockfiles,function(f){
            //console.log(f);
            fs.unlinkSync(path.normalize(path.dirname(require.main.filename) + uploaddir) + f);
        });

        // ONLY delete video files with no lock files

        //TODO -- only delete files with NO lock files
        var allmp4s = _.filter(allfiles,function(f){
            return _.endsWith(f,'.mp4') && !_.endsWith(f,'.edit.mp4');
        });

        var nolockfiles = _.filter(allmp4s,function(f){
            var matchinglockfiles = _.find(allfiles,function(ff){
                return _.startsWith(ff,f) && _.endsWith(ff,'.lock');
            });
            return _.size(matchinglockfiles) == 0;
        });

        winston.info('Files with no lock: ' + _.size(nolockfiles));
        _.each(nolockfiles,function(f){
            //console.log(f);
        });

        var statfiles = _.map(nolockfiles,function(f){
            return {file:path.normalize(path.dirname(require.main.filename) + uploaddir) + f,stats:fs.statSync(path.normalize(path.dirname(require.main.filename) + uploaddir) + f)};
        });

        // console.log(allfiles_nolock);
        var ordered = _.orderBy(statfiles,'stats.atime.getTime()','desc');
        // console.log('ordered:');
        // _.each(ordered,function(f){
        //     console.log(f.file + ' ' + f.stats.atime);
        // });


        var keep = [];
        var remove = [];
        //20GB
        var space_avail = config.MAX_CACHE;
        //var space_avail = 20*1024*1024;
        var sizecounter = space_avail;
        var index = 0;

        while (sizecounter > 0 && index < _.size(ordered))
        {
            keep.push(ordered[index]);
            // console.log(ordered[index].stats.size);
            sizecounter -= ordered[index].stats.size;
            index++;
        }

        remove = _.slice(ordered,index);

        winston.info("Keeping " + _.size(keep) + ' files within the '+(space_avail/(1024*1024)) + 'MB cap');
        _.each(keep,function(f){
             //console.log(f.file);
        });

        winston.info('Removing ' + _.size(remove) + ' files');
        _.each(remove,function(f){
            //console.log(f.file);
            fs.unlinkSync(f.file);
        });
}
global.cleanOutAll = cleanOutAll;
global.sendEmail = sendEmail;