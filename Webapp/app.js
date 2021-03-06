/*
 * app.js - Simple express server
*/

/*jslint         node    : true, continue : true,
  devel  : true, indent  : 2,    maxerr   : 50,
  newcap : true, nomen   : true, plusplus : true,
  regexp : true, sloppy  : true, vars     : false,
  white  : true
*/
/*global */

// ------------ BEGIN MODULE SCOPE VARIABLES --------------
'use strict';

var http    = require('http'    ),
    express = require('express' ),
    routes  = require('./routes'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    errorHandler = require("express-error-handler"),
    logger  = require('morgan'),
    basicAuth = require('basic-auth-connect'),
    app     = express(),
    server  = http.createServer(app),
    env     = process.env;
//------------- END MODULE SCOPE VARIABLES ----------------

//============= BEGIN SERVER CONFIG =======================
app.use(bodyParser());
app.use(methodOverride());
app.use(basicAuth('user','spa'));
app.use(express.static(__dirname + '/public'));

if(process.env.NODE_ENV === 'development'){
    app.use(logger());
    app.use(errorHandler({
        dumpExceptions : true,
        showStack      : true
    }));
    // console.log("setted dev");
}

if(process.env.NODE_ENV === 'production'){
    app.use(errorHandler());
    // console.log("setted prd");
}

routes.configRoutes(app ,server);
//============= END SERVER CONFIG =========================

//------------- BEGIN START SERVER ------------------------
server.listen(3000);
console.log(
    'Express server listening on port %d in %s mode',
    server.address().port, app.settings.env
);
// console.log(process.env.NODE_ENV);
