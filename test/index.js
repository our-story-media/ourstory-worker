//push test edit to beanstalk:
console.log("Test Started");
var fivebeans = require('fivebeans');
var client = new fivebeans.client('beanstalk', '11300');
client.on('connect', function () {
    console.log('Connected');
    // client can now be used
    client.use("edits", function (err, tubename) {

        var realedit2 = {
            "_id": "5c13b9924d3e2667006127c1",
            "user_id": "5bea0b516f0bf71e009ae562",
            "createdAt": "2018-12-14T14:09:22.980Z",
            "updatedAt": "2018-12-15T19:05:50.433Z",
            "description": "",
            "title": "Copy of teachers",
            "progress": "2",
            "path": null,
            "fail": false,
            "code": "UJBZUXWsw",
            "shortlink": "UJBZUXWsw",
            "media": [
                {
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "titletext": "اعرف الصح",
                    "audio": "Blue_Dot_Sessions_-_06_-_Pat_Dog.mp3",
                    "credits": "Music by Blue Dot Sessions"
                },
                {
                    "id": "5be93fc16ea7952600590325",
                    "path": "636776618902596700_636776110464530760.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03.00",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be93fc16ea7952600590325",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be93fc16ea7952600590325",
                    "tag":{
                        "id":0,
                        "color":"#00ffff",
                        "values":{
                            "en":"اعرف الصح"
                        }
                    }
                },
                {
                    "id": "5be940726ea79526005903da",
                    "path": "636776619800498480_636776126222080370.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03.00",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940726ea79526005903da",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940726ea79526005903da",
                    "tag":{
                        "id":0,
                        "color":"#ffff00",
                        "values":{
                            "en":"Tag 2"
                        }
                    }
                }
            ]
        };

       var realedit1 = {
            "_id": "5c13b9924d3e2667006127c1",
            "user_id": "5bea0b516f0bf71e009ae562",
            "createdAt": "2018-12-14T14:09:22.980Z",
            "updatedAt": "2018-12-15T19:05:50.433Z",
            "description": "",
            "media": [
                {
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "titletext": "اعرف الصح",
                    "audio": "Blue_Dot_Sessions_-_06_-_Pat_Dog.mp3",
                    "credits": "Music by Blue Dot Sessions"
                },
                {
                    "id": "5be93fc16ea7952600590325",
                    "path": "636776618902596700_636776110464530760.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:19.4670000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be93fc16ea7952600590325",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be93fc16ea7952600590325"
                },
                {
                    "id": "5be940726ea79526005903da",
                    "path": "636776619800498480_636776126222080370.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:09.8000000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940726ea79526005903da",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940726ea79526005903da"
                },
                {
                    "id": "5be9407c6ea79526005903e2",
                    "path": "636776619863655070_636776126843430920.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:08.4670000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be9407c6ea79526005903e2",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be9407c6ea79526005903e2"
                },
                {
                    "id": "5be940136ea7952600590372",
                    "path": "636776619376971560_636776117684656830.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:20.1340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940136ea7952600590372",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940136ea7952600590372"
                },
                {
                    "id": "5be940a66ea7952600590400",
                    "path": "636776620241654430_636776139207642700.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:30.0670000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940a66ea7952600590400",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940a66ea7952600590400"
                },
                {
                    "id": "5bea984e6f0bf71e009af2f5",
                    "path": "636776980853969170_636776978582216190.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:09.3340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea984e6f0bf71e009af2f5",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea984e6f0bf71e009af2f5"
                },
                {
                    "id": "5be940b06ea795260059040b",
                    "path": "636776620451454030_636776143537060470.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:08.3340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940b06ea795260059040b",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940b06ea795260059040b"
                },
                {
                    "id": "5be940bb6ea7952600590418",
                    "path": "636776620516037740_636776145104860800.mp4",
                    "inpoint": "00:00:00.4690000",
                    "outpoint": "00:00:14.0670000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940bb6ea7952600590418",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940bb6ea7952600590418"
                },
                {
                    "id": "5be93f656ea79526005902cf",
                    "path": "636776620614750130_636776149106727680.mp4",
                    "inpoint": "00:00:05.3840000",
                    "outpoint": "00:00:25.7340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be93f656ea79526005902cf",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be93f656ea79526005902cf"
                },
                {
                    "id": "5bea86906f0bf71e009aed45",
                    "path": "636776959492297390_636776933071980450.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:18.4000000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea86906f0bf71e009aed45",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea86906f0bf71e009aed45"
                },
                {
                    "id": "5bea82356f0bf71e009aec32",
                    "path": "636776958450269430_636776921825549900.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:18.1340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea82356f0bf71e009aec32",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea82356f0bf71e009aec32"
                },
                {
                    "id": "5bea83a56f0bf71e009aec72",
                    "path": "636776959113030650_636776925582820540.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:20.7340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea83a56f0bf71e009aec72",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea83a56f0bf71e009aec72"
                },
                {
                    "id": "5bea82f06f0bf71e009aec54",
                    "path": "636776958896963560_636776923215925050.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:21.4000000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea82f06f0bf71e009aec54",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea82f06f0bf71e009aec54"
                },
                {
                    "id": "5bea84e16f0bf71e009aecff",
                    "path": "636776959338493870_636776928792195360.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:15.6000000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea84e16f0bf71e009aecff",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea84e16f0bf71e009aecff"
                },
                {
                    "id": "5bea89926f0bf71e009aee1e",
                    "path": "636776959817585800_636776940670442530.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:26.3770000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea89926f0bf71e009aee1e",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea89926f0bf71e009aee1e"
                },
                {
                    "id": "5be943fa6ea79526005904e4",
                    "path": "636776621279042630_636776164394765600.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:11.6000000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be943fa6ea79526005904e4",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be943fa6ea79526005904e4"
                },
                {
                    "id": "5be945dc6ea7952600590544",
                    "path": "636776621637107510_636776169172833100.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:16.0670000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be945dc6ea7952600590544",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be945dc6ea7952600590544"
                },
                // {
                //     "path": "",
                //     "inpoint": "00:00:00",
                //     "outpoint": "00:00:00"
                // },
                {
                    "id": "5be93fc16ea7952600590325",
                    "path": "636776618902596700_636776110464530760.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:19.4670000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be93fc16ea7952600590325",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be93fc16ea7952600590325"
                },
                {
                    "id": "5be9407c6ea79526005903e2",
                    "path": "636776619863655070_636776126843430920.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:08.4670000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be9407c6ea79526005903e2",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be9407c6ea79526005903e2"
                },
                {
                    "id": "5be940726ea79526005903da",
                    "path": "636776619800498480_636776126222080370.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:09.8000000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940726ea79526005903da",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940726ea79526005903da"
                },
                {
                    "id": "5be940136ea7952600590372",
                    "path": "636776619376971560_636776117684656830.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:20.1340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940136ea7952600590372",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940136ea7952600590372"
                },
                {
                    "id": "5be940a66ea7952600590400",
                    "path": "636776620241654430_636776139207642700.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:30.0670000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940a66ea7952600590400",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940a66ea7952600590400"
                },
                {
                    "id": "5bea984e6f0bf71e009af2f5",
                    "path": "636776980853969170_636776978582216190.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:09.3340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea984e6f0bf71e009af2f5",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea984e6f0bf71e009af2f5"
                },
                {
                    "id": "5be940b06ea795260059040b",
                    "path": "636776620451454030_636776143537060470.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:08.3340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940b06ea795260059040b",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940b06ea795260059040b"
                },
                {
                    "id": "5be940bb6ea7952600590418",
                    "path": "636776620516037740_636776145104860800.mp4",
                    "inpoint": "00:00:00.4690000",
                    "outpoint": "00:00:14.0670000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be940bb6ea7952600590418",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be940bb6ea7952600590418"
                },
                {
                    "id": "5bea86906f0bf71e009aed45",
                    "path": "636776959492297390_636776933071980450.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:18.4000000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea86906f0bf71e009aed45",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea86906f0bf71e009aed45"
                },
                {
                    "id": "5be93f656ea79526005902cf",
                    "path": "636776620614750130_636776149106727680.mp4",
                    "inpoint": "00:00:05.3840000",
                    "outpoint": "00:00:25.7340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be93f656ea79526005902cf",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be93f656ea79526005902cf"
                },
                {
                    "id": "5bea82356f0bf71e009aec32",
                    "path": "636776958450269430_636776921825549900.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:18.1340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea82356f0bf71e009aec32",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea82356f0bf71e009aec32"
                },
                {
                    "id": "5bea83a56f0bf71e009aec72",
                    "path": "636776959113030650_636776925582820540.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:20.7340000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea83a56f0bf71e009aec72",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea83a56f0bf71e009aec72"
                },
                {
                    "id": "5bea82f06f0bf71e009aec54",
                    "path": "636776958896963560_636776923215925050.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:21.4000000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea82f06f0bf71e009aec54",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea82f06f0bf71e009aec54"
                },
                {
                    "id": "5bea84e16f0bf71e009aecff",
                    "path": "636776959338493870_636776928792195360.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:15.6000000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea84e16f0bf71e009aecff",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea84e16f0bf71e009aecff"
                },
                {
                    "id": "5bea89926f0bf71e009aee1e",
                    "path": "636776959817585800_636776940670442530.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:26.3770000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5bea89926f0bf71e009aee1e",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5bea89926f0bf71e009aee1e"
                },
                {
                    "id": "5be943fa6ea79526005904e4",
                    "path": "636776621279042630_636776164394765600.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:11.6000000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be943fa6ea79526005904e4",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be943fa6ea79526005904e4"
                },
                {
                    "id": "5be945dc6ea7952600590544",
                    "path": "636776621637107510_636776169172833100.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:16.0670000",
                    "thumb": "http://10.10.10.1/media/thumbnail/5be945dc6ea7952600590544",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "lowres": "http://10.10.10.1/media/preview/5be945dc6ea7952600590544"
                },
                {
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "titletext": "Zobeyda Mohammed Soleiman\nMarwa Sayed Hassan Sayed\nMagda Mohammed Bashir\nNajla Kamal Khalil  "
                },
                {
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "event_id": "5be888ef48f9d42500ba490c",
                    "titletext": "Reda Abdel Hamid Youssef\nGhana Samir Abdul Maksood\nMona Ibrahim Mahmoud\nFatima Sayed Ahmed"
                }
            ],
            "title": "Copy of teachers",
            "progress": "2",
            "path": null,
            "fail": false,
            "code": "UJBZUXWsw",
            "shortlink": "UJBZUXWsw"
        };




        var edit = {
            "id": "5968a01af0741120006cf30e",
            "code": "ABCDE",
            "shortlink": '/v/ABCDE',
            "user_id": "596895c9f0741120006cf30d",
            "media": [
                {
                    "id": null,
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "thumb": null,
                    "event_id": "",
                    "lowres": null,
                    "titletext": "ترجمة الاختبار"
                },
                // {
                //     "id" : "5965fe86453a892000e59ab0", 
                //     "path" : "636354571613883880_636354569052157620.mp4", 
                //     "inpoint" : "00:00:00", 
                //     "outpoint" : "00:00:06.1180000", 
                //     "thumb" : "https://ifrc.bootlegger.tv/media/thumbnail/5965fe86453a892000e59ab0", 
                //     "event_id" : "595f4dd21ece1d2100425a37", 
                //     "lowres" : "https://ifrc.bootlegger.tv/media/preview/5965fe86453a892000e59ab0", 
                //     "titletext" : null
                // }, 
                {
                    "id": null,
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "thumb": null,
                    "event_id": "",
                    "lowres": null,
                    "titletext": "This is a really long and boring title that should cover two lines"
                },
                // {
                //     "id" : "596646b3453a892000e59aba", 
                //     "path" : "636355453373956120_636354753902218340.mp4", 
                //     "inpoint" : "00:00:00", 
                //     "outpoint" : "00:00:02.1340000", 
                //     "thumb" : "https://ifrc.bootlegger.tv/media/thumbnail/596646b3453a892000e59aba", 
                //     "event_id" : "595f4dd21ece1d2100425a37", 
                //     "lowres" : "https://ifrc.bootlegger.tv/media/preview/596646b3453a892000e59aba", 
                //     "titletext" : null
                // },
                {
                    "id": null,
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "thumb": null,
                    "event_id": "",
                    "lowres": null,
                    "titletext": "Second Title"
                },
                {
                    "id": null,
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "thumb": null,
                    "event_id": "",
                    "lowres": null,
                    "titletext": "End Title"
                }
            ],
            "title": "Test Edit",
            "description": ""
        };

        var edit2 = {
            "id": "5968a01af0741120006cf30e",
            "code": "ABCDE",
            "shortlink": '/v/ABCDE',
            "user_id": "596895c9f0741120006cf30d",
            "media": [
                // {
                //     "id" : null, 
                //     "path" : "", 
                //     "inpoint" : "00:00:00", 
                //     "outpoint" : "00:00:03", 
                //     "thumb" : null, 
                //     "event_id" : "", 
                //     "lowres" : null, 
                //     "titletext" : "First Title",
                //     "audio":"short.wav",
                //     "credits":"Test of short music"
                // }, 

                {
                    "id": null,
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "thumb": null,
                    "event_id": "",
                    "lowres": null,
                    "titletext": "This is a really long and boring title that should cover two lines",
                    "audio": "Christian_Bjoerklund_-_01_-_Hallon.mp3"
                },
                {
                    "id": "5965fe86453a892000e59ab0",
                    "path": "input2.mp4",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:10.1",
                    "thumb": "https://ifrc.bootlegger.tv/media/thumbnail/5965fe86453a892000e59ab0",
                    "event_id": "595f4dd21ece1d2100425a37",
                    "lowres": "https://ifrc.bootlegger.tv/media/preview/5965fe86453a892000e59ab0",
                    "titletext": null
                },
                // {
                //     "id" : "596646b3453a892000e59aba", 
                //     "path" : "636355453373956120_636354753902218340.mp4", 
                //     "inpoint" : "00:00:00", 
                //     "outpoint" : "00:00:02.1340000", 
                //     "thumb" : "https://ifrc.bootlegger.tv/media/thumbnail/596646b3453a892000e59aba", 
                //     "event_id" : "595f4dd21ece1d2100425a37", 
                //     "lowres" : "https://ifrc.bootlegger.tv/media/preview/596646b3453a892000e59aba", 
                //     "titletext" : null
                // },
                {
                    "id": null,
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "thumb": null,
                    "event_id": "",
                    "lowres": null,
                    "titletext": "Second 😁 Title"
                },
                {
                    "id": null,
                    "path": "",
                    "inpoint": "00:00:00",
                    "outpoint": "00:00:03",
                    "thumb": null,
                    "event_id": "",
                    "lowres": null,
                    "titletext": "End Title"
                }
            ],
            "title": "Test Edit",
            "description": ""
        };

        var transcode = {
            input: 'inputfile.mp4',
            output: 'preview_inputfile.mp4'
        };

        // client.put(10, 0, 1000000000, JSON.stringify(['edits', {type:'transcode',payload:transcode}]) , function(err, jobid) {
        //     console.log("Test Transcode Transmitted");
        //     process.exit();
        // });

        client.put(10, 0, 1000000000, JSON.stringify(['edits', { type: 'edit', payload: realedit2 }]), function (err, jobid) {
            console.log("Test Edit Transmitted");
            process.exit();
        });
    });
})
    .on('error', function (err) {
        console.log(err);

        // connection failure
    })
    .on('close', function () {
        console.log('Closed');
        // underlying connection has closed
    });
client.connect();