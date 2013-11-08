// require modules
var http        = require('http'),
    express     = require('express'),
    socketio    = require('socket.io'),
    lingua      = require('lingua')
    redirect    = require('redirect')('ctlnode.herokuapp.com'),
    lists       = require('lists');

// middleware: configuration of nested modules
var app = express();
app.configure(function () {
    app.set('view engine', 'jade');
    app.set('views', __dirname + '/views');
    app.use(redirect);
    app.use(express.static(__dirname + '/public'));
    app.use(require('stylus').middleware({
        src: __dirname + '/public'
    }));
    app.use(lingua(app, {
        defaultLocale: 'en',
        path: __dirname + '/i18n'
    }));
});

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
            list: reqList
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

// bind app to server-specified listening-port
// or to the default port 3000, used during deveopment
var server = http.createServer(app).listen(process.env.PORT || 3000);

// start socket server of socket.io
var io = socketio.listen(server);

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