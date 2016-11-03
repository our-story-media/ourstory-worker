//edit file:
var winston = require('winston');
var fivebeans = require('fivebeans').worker;
var config = require('./config/local.js');

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

	var runner = new fivebeans({
		id:'transcode-server',
		host:config.BEANSTALK_HOST,
		port:config.BEANSTALK_PORT,
		ignoreDefault:true,
		handlers:
	    {
	        edit: require('./handlers/edithandler')(winston),
	        dropbox: require('./handlers/dropboxhandler')(winston),
			audio: require('./handlers/audiosynchandler')(winston)
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
		winston.info(err);
	});
	runner.start(['edits']);
}
