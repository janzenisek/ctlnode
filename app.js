var http = require('http');
var express = require('express');
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
    // create new task list (new random url) and link to it and welcome the new user

    res.render('index', {
        list: {
            alias: 'GEN',
            creationMoment: ' [new list on generated url here]',
            tasks: []
        }
    });
});

app.get('/:alias', function (req, res) {
    // find mapped list (if existent) in mongodb and render the list
    // if there is no list for alias create new task list on the alias and link to it and welcome the new user

    lists.findOne(req.params.alias, function (err, result) {
        if (err) {
            console.log(err);
        } else {
            var reqList = result || {
                alias: 'CHOSEN',
                creationMoment: ' [new list on chosen url here]',
                tasks: []
            };

            res.render('index', {
                list: reqList
            });
        }
    });
});

// bind app to server-specified listening-port or development-default port 3000
var server = http.createServer(app).listen(process.env.PORT || 3000);