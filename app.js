var http = require('http');
var express = require('express');
var socketio = require('socket.io');
var redirect = require('redirect')('ctlnode.herokuapp.com');
var lists = require('lists');

var app = express();
app.configure(function () {
    app.set('view engine', 'jade');
    app.set('views', __dirname + '/views');
    app.use(redirect);
    app.use(express.static(__dirname + '/public'));
    app.use(require('stylus').middleware({
        src: __dirname + '/public'
    }));
});

app.get('/', function (req, res) {
    // create new random url and link to it
    console.log("GOT URL WITHOUT ALIAS");
    makeNewAlias(function (newAlias) {
        res.redirect(307, '/' + newAlias);
    });
    
});

app.get('/:alias', function (req, res) {
    if (req.params.alias === 'favicon.ico') return;

    console.log("GOT URL WITH ALIAS: ", req.params.alias);
    var renderList = function (reqList) {
        console.log("RENDER LIST: "+ reqList.alias);
        res.render('index', {
            list: reqList
        });
    }

    // find mapped list (if existent) in mongodb and render the list
    // if there is no list for alias create new task list on the alias and link to it and welcome the new user

    lists.findOne(req.params.alias, function (err, result) {
        if (err) {
            // !!! update error handling !!!
            console.log(err);
        } else {          
            if (result) {
                renderList(result);
            } else {
                lists.create(req.params.alias, function (err, result) {
                    if (err) {
                        // !!! update error handling !!!
                        console.log(err);
                    } else {
                        console.log("CREATE NEW LIST: ", result[0].alias);
                        renderList(result[0]);
                    }
                });
            }
        }
    });
});

// bind app to server-specified listening-port or development-default port 3000
var server = http.createServer(app).listen(process.env.PORT || 3000);

// start socket server of socket.io
var io = socketio.listen(server);

// listen to connection-request of clients (argument 'socket')
io.sockets.on('connection', function (socket) {
    console.log(" >> got connection-request from: " + socket.id);
    socket.on('aliasResponse', function (aliasData, callbackAliasResponse) {
        console.log(" >> got alias: " + aliasData.alias);
        socket.join(aliasData.alias); // join a romm => a socket partition for all clients who collaborate on one list)
        console.log(" >> joined aliasroom: " + aliasData.alias);
        callbackAliasResponse();
        socket.on('addTask', function (taskData) {
            console.log(" >> got task to add: " + taskData.description);

            // create new task for taskData on db and send it back to all clients, listening on alias
            lists.addTask(aliasData.alias, taskData.description, function (newTask) {
                io.sockets.in(aliasData.alias).emit('addedTask', newTask);
            });  
        });
        socket.on('removeTask', function (taskData) {
            lists.removeTask(aliasData.alias, taskData.id, function () {
                io.sockets.in(aliasData.alias).emit('removedTask', taskData.id);
            })
        });
        socket.on('changeTaskState', function (taskData) {
            lists.changeTaskState(aliasData.alias, taskData.id, taskData.state, function (changedTask) {
                io.sockets.in(aliasData.alias).emit('changedTaskState', changedTask);
            })
        });
    })
    // listen to disconnect of client bound to 'socket'
    socket.on('dissconnect', function () {

    })
});

function makeNewAlias(callback) {
    var alias = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 10; i++)
        alias += possible.charAt(Math.floor(Math.random() * possible.length));

    // proove against DB, and call function recursivly in case of already existing alias
    lists.findOne(alias, function (err, result) {
        if (!result) {
            console.log("MADE A NEW ALIAS: " + alias);
            return callback(alias);
        } else {
            console.log("ALIAS ALREADY EXSISTS - ANOTHER GENERATION TRY STARTS");
            makeNewAlias(callback);
        }
    });   
}