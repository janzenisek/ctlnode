// load modules
var http = require('http'),
    express = require('express'),
    socketio = require('socket.io'),
    sass = require('node-sass'),
    lingua = require('lingua'),
    redirect = require('redirect')('ctlnode.herokuapp.com'),
    listdao = require('list-dal');

// create an express instance
var app = express();

// create new HTTP-server for the express instance
var server = http.createServer(app);

// configure express
app.configure(function () {
    app.use(redirect);

    // configure jade (template engine)
    app.set('view engine', 'jade'); // use jade, which is integrated in express
    app.set('views', __dirname + '/views'); // where the template files are

    // configure directory for static embedding
    app.use(express.static(__dirname + '/public'));

    // configure node-sass (css preprocessor)
    app.use(sass.middleware({
        src: __dirname, // where the sass files are 
        dest: __dirname + '/public', // where css should go
        debug: true
     }));

    // configure lingua (internationalization module)
    app.use(lingua(app, {
        defaultLocale: 'en',
        path: __dirname + '/i18n'
    }));
});

// case 1: receive url without alias
app.get('/', function (req, res) {
    // create new random url and link to it
    logEvent("got url without alias");
    makeNewAlias(function (newAlias) {
        res.redirect(307, '/' + newAlias); // redirect to new alias
    });
});

// case 2: receive url with alias
app.get('/:alias', function (req, res) {
    // ignore request for favion
    if (req.params.alias === 'favicon.ico') return;

    logEvent("got url with alias: " + req.params.alias);

    // function object renders list
    var renderList = function (reqList) {
        logEvent("render list: " + reqList.alias);
        res.render('index', {
            list: reqList
        });
    }

    // find mapped list in mongodb 'ctlnode' or create a new one and let it render
    listdao.findOne(req.params.alias, function (err, result) {
        if (err) {
            logEvent("\n" + err + "\n--------------------");
        } else {
            // if list for alias has been found in db: render it
            if (result) {
                logEvent("found list in db for: " + result.alias);
                renderList(result);
            } else {
                // if there is no list for alias in db: create one...
                listdao.create(req.params.alias, function (err, result) {
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

// bind app to the listening-port specified by the environment
// or to the default port 4242, used during deveopment
server.listen(process.env.PORT || 4242);

// start socket server of socket.io
var io = socketio.listen(server);

// configure socket.io (use environment flags: 'development' | 'production')
io.configure('production', function () {
    io.enable('browser client minification');  // send minified client script
    io.enable('browser client etag');          // apply etag caching logic based on version number
    io.enable('browser client gzip');          // gzip the file
    io.set('log level', 1);                    // reduce logging

    // enable all transports
    io.set('transports', [
        'websocket'
      , 'flashsocket'
      , 'htmlfile'
      , 'xhr-polling'
      , 'jsonp-polling'
    ]);
});

// listen to connection-request of clients - argument is the clients socket
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
            listdao.addTask(aliasData.alias, taskData.description, function (newTask) {
                // respond to client that the task is added
                io.sockets.in(aliasData.alias).emit('addedTask', newTask);
            });
        });
        // listen to removeTask-actions of client
        socket.on('removeTask', function (taskData) {
            listdao.removeTask(aliasData.alias, taskData.id, function () {
                // respond to client that the task is removed
                io.sockets.in(aliasData.alias).emit('removedTask', taskData.id);
            });
        });
        // listen to changeTaskState-actions of client
        socket.on('changeTaskState', function (taskData) {
            listdao.changeTaskState(aliasData.alias, taskData.id, taskData.state, function (changedTask) {
                // respond to client that the task is changed
                io.sockets.in(aliasData.alias).emit('changedTaskState', changedTask);
            });
        });
    });
    // listen to disconnection of client bound to 'socket'
    socket.on('dissconnect', function () {
        // nothing to do on dissconection of client
    });
});

// db-worker: clean db from expired lists and inform list-clients
// worker-function runs once every hour
setInterval(function () {
    listdao.find(function (err, result) {
        for (var i = 0; i < result.length; i++) {
            if (moment() >= moment(result[i].expireMoment, 'MM/DD/YYYY', true)) {
                listdao.delete(result[i].alias, function () {
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
    listdao.findOne(alias, function (err, result) {
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