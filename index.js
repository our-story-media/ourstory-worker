//edit file:
var winston = require('winston');

var fivebeans = require('fivebeans').worker;
var config = require('./local.js');
//ENTRY POINT:

//console.log(config);
start();

function start()
{
	//console.log('mongodb://'+((config.db_user != '') ? config.db_user  + ':':'') + config.db_user + '@' + config.db_host + ':' + config.db_port + '/' + config.db_database);
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
	        edit: require('./edithandler')(winston),
	        dropbox: require('./dropboxhandler')(winston),
			audio: require('./audiosynchandler')(winston)
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
