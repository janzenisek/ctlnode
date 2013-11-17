// require modules
var http        = require('http'),
    express     = require('express'),
    socketio    = require('socket.io'),
    lingua      = require('lingua'),
    piler       = require('piler'),
    redirect    = require('redirect')('ctlnode.herokuapp.com'),
    lists       = require('lists');

// piler: setup managers
var clientjs = piler.createJSManager();
var clientcss = piler.createCSSManager();

// middleware: configuration of nested modules
var app = express();

// bind app to server-specified listening-port
// or to the default port 3000, used during deveopment
var server = http.createServer(app);

// start socket server of socket.io
var io = socketio.listen(server);

app.configure(function () {
    clientjs.bind(app, server);
    clientcss.bind(app, server);
    app.set('view engine', 'jade');
    app.set('views', __dirname + '/views');
    app.use(redirect);
    app.use(express.static(__dirname + '/public'));
    /* piler takes care of stylus
    app.use(require('stylus').middleware({
        src: __dirname + '/public'
    }));*/
    app.use(lingua(app, {
        defaultLocale: 'en',
        path: __dirname + '/i18n'
    }));
});

// piler: configure css live-update
app.configure("development", function () {
    clientjs.liveUpdate(clientcss, io);
});

// piler: add files to process over
clientjs.addUrl('/socket.io/socket.io.js');
clientjs.addFile(__dirname + '/public/scripts/jquery-2.0.3.min.js');
clientjs.addFile(__dirname + '/public/scripts/jade.js');
clientjs.addFile(__dirname + '/public/scripts/plugins.js');
clientcss.addFile(__dirname + '/public/styles/reset.css');
//clientcss.addFile(__dirname + '/public/styles/defaults.css');
clientcss.addFile(__dirname + '/public/styles/core.styl');

// middleware: routing configuration
app.get('/', function (req, res) {
    // create new random url and link to it
    logEvent("got url without alias");
    makeNewAlias(function (newAlias) {
        res.redirect(307, '/' + newAlias);
    });
});

// middleware: routing configuration
app.get('/:alias', function (req, res) {
    // ignore request for favion
    if (req.params.alias === 'favicon.ico') return;

    logEvent("got url with alias: " + req.params.alias);

    // function object renders list
    var renderList = function (reqList) {
        logEvent("render list: " + reqList.alias);
        res.render('index', {
            list: reqList,
            js: clientjs.renderTags(),
            css: clientcss.renderTags()
        });
    }

    // case 1: find mapped list in mongodb 'ctlnode' or create a new one and let it render
    lists.findOne(req.params.alias, function (err, result) {
        if (err) {
            logEvent("\n" + err + "\n--------------------");
        } else {
            // if list for alias has been found in db: render it
            if (result) {
                logEvent("found list in db for: " + result.alias);
                renderList(result);
            } else {
                // if there is no list for alias in db: create one...
                lists.create(req.params.alias, function (err, result) {
                    if (err) {
                        logEvent("\n" + err + "\n--------------------");
                    } else {
                        logEvent("created new list in db for: ", result[0].alias);
                        // ...and render it
                        renderList(result[0]);
                    }
                });
            }
        }
    });
});

server.listen(process.env.PORT || 3000);

// listen to connection-request of clients (argument 'socket')
io.sockets.on('connection', function (socket) {
    logEvent("got connection-request from: " + socket.id);
    // listen to client sending an alias
    socket.on('aliasResponse', function (aliasData, callbackAliasResponse) {
        logEvent("got alias: " + aliasData.alias);
        // join client to a room (a socket partition for all clients who collaborate on one list)
        socket.join(aliasData.alias); 
        logEvent("joined aliasroom: " + aliasData.alias);
        // respond to client and let him attend to the 'conversation' in room
        callbackAliasResponse();
        // listen to addTask-actions of client
        socket.on('addTask', function (taskData) {
            logEvent("got task to add: " + taskData.description);
            // create new task for taskData on db and send it back to all clients, listening on alias
            lists.addTask(aliasData.alias, taskData.description, function (newTask) {
                // respond to client that the task is added
                io.sockets.in(aliasData.alias).emit('addedTask', newTask);
            });  
        });
        // listen to removeTask-actions of client
        socket.on('removeTask', function (taskData) {
            lists.removeTask(aliasData.alias, taskData.id, function () {
                // respond to client that the task is removed
                io.sockets.in(aliasData.alias).emit('removedTask', taskData.id);
            })
        });
        // listen to changeTaskState-actions of client
        socket.on('changeTaskState', function (taskData) {
            lists.changeTaskState(aliasData.alias, taskData.id, taskData.state, function (changedTask) {
                // respond to client that the task is changed
                io.sockets.in(aliasData.alias).emit('changedTaskState', changedTask);
            })
        });
    })
    // listen to disconnection of client bound to 'socket'
    socket.on('dissconnect', function () {
        // do something on dissconection of client
    })
});

// db-worker: clean db from expired lists and inform list-clients
// worker-function runs once every hour
setInterval(function () {
    lists.find(function (err, result) {
        for (var i = 0; i < result.length; i++) {
            if (moment() >= moment(result[i].expireMoment, 'MM/DD/YYYY', true)) {
                lists.delete(result[i].alias, function () {
                    io.sockets.in(result[i].alias).emit('deletedList');
                });
            }
        }
    });
}, 3600 * 1000);

// make a new random alias
function makeNewAlias(callback) {
    var alias = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 10; i++)
        alias += possible.charAt(Math.floor(Math.random() * possible.length));

    // proove generated alias against db... 
    lists.findOne(alias, function (err, result) {
        if (!result) {
            logEvent("made a new alias: " + alias);
            // ...and return return it
            return callback(alias);
        } else {
            logEvent("alias already exists - try generating another one");
            // ...and call function recursivly in case of already existing alias
            makeNewAlias(callback);
        }
    });   
}

function logEvent(msg) {
    console.log("CTLNODE: " + msg);
}