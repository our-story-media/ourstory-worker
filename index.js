//edit file:
var winston = require('winston');
var fivebeans = require('fivebeans').worker;
var MongoClient = require('mongodb').MongoClient;
var config = require('./config/local.js');
var sendgrid  = require('sendgrid')(config.email.SENDGRID_ID);
var moment = require('moment');

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
		var email     = new sendgrid.Email({
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