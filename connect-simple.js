/*
 * app.js - Basic logging
*/

/*jslint         node    : true, continue : true,
  devel  : true, indent  : 2,    maxerr   : 50,
  newcap : true, nomen   : true, plusplus : true,
  regexp : true, sloppy  : true, vars     : false,
  white  : true
*/
/*global */
var connectHello, server,
    http     = require( 'http'    ),
    connect  = require( 'connect' ),
    bodyText = 'Hello Connect',
    logger = require('morgan'),
    app = connect().use(logger());

connectHello = function ( request, response, next ) {
    response.setHeader( 'content-length', bodyText.length );
    response.end( bodyText );
};

app.use(connectHello);

server = http.createServer( app );

server.listen( 3000 );

console.log( 'Listening on port %d', server.address().port );

