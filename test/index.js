//push test edit to beanstalk:
console.log("Test Started");
var fivebeans = require('fivebeans');
var client = new fivebeans.client('beanstalk', '11300');
client.on('connect', function()
{
    console.log('Connected');
    // client can now be used
    client.use("edits", function(err, tubename) {

        var edit = { 
            "id" : "5968a01af0741120006cf30e", 
            "code":"ABCDE",
            "shortlink":'/v/ABCDE',            
            "user_id" : "596895c9f0741120006cf30d",
            "media" : [
                {
                    "id" : null, 
                    "path" : "", 
                    "inpoint" : "00:00:00", 
                    "outpoint" : "00:00:03", 
                    "thumb" : null, 
                    "event_id" : "", 
                    "lowres" : null, 
                    "titletext" : "First Title"
                }, 
                {
                    "id" : "5965fe86453a892000e59ab0", 
                    "path" : "636354571613883880_636354569052157620.mp4", 
                    "inpoint" : "00:00:00", 
                    "outpoint" : "00:00:06.1180000", 
                    "thumb" : "https://ifrc.bootlegger.tv/media/thumbnail/5965fe86453a892000e59ab0", 
                    "event_id" : "595f4dd21ece1d2100425a37", 
                    "lowres" : "https://ifrc.bootlegger.tv/media/preview/5965fe86453a892000e59ab0", 
                    "titletext" : null
                }, 
                {
                    "id" : null, 
                    "path" : "", 
                    "inpoint" : "00:00:00", 
                    "outpoint" : "00:00:03", 
                    "thumb" : null, 
                    "event_id" : "", 
                    "lowres" : null, 
                    "titletext" : "This is a really long and boring title that should cover two lines"
                }, 
                {
                    "id" : "596646b3453a892000e59aba", 
                    "path" : "636355453373956120_636354753902218340.mp4", 
                    "inpoint" : "00:00:00", 
                    "outpoint" : "00:00:02.1340000", 
                    "thumb" : "https://ifrc.bootlegger.tv/media/thumbnail/596646b3453a892000e59aba", 
                    "event_id" : "595f4dd21ece1d2100425a37", 
                    "lowres" : "https://ifrc.bootlegger.tv/media/preview/596646b3453a892000e59aba", 
                    "titletext" : null
                },
                {
                    "id" : null, 
                    "path" : "", 
                    "inpoint" : "00:00:00", 
                    "outpoint" : "00:00:03", 
                    "thumb" : null, 
                    "event_id" : "", 
                    "lowres" : null, 
                    "titletext" : "Second Title"
                }, 
                {
                    "id" : null, 
                    "path" : "", 
                    "inpoint" : "00:00:00", 
                    "outpoint" : "00:00:03", 
                    "thumb" : null, 
                    "event_id" : "", 
                    "lowres" : null, 
                    "titletext" : "End Title"
                }
            ], 
            "title" : "Test Edit", 
            "description" : ""
        };

        client.put(10, 0, 1000000000, JSON.stringify(['edits', {type:'edit',payload:edit}]) , function(err, jobid) {
            console.log("Test Edit Transmitted");
        });
    });
})
.on('error', function(err)
{
    console.log(err);
    
    // connection failure
})
.on('close', function()
{
    console.log('Closed');
    // underlying connection has closed
});
client.connect();