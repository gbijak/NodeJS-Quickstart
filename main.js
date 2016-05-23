const express = require('express');
const bodyParser = require('body-parser'); // additional body parsing
const multer = require('multer'); // file upload (multipart/form-data)
const morgan = require('morgan'); // General request logger
const session = require('express-session'); // session cookies
const MongoStore = require('connect-mongo')(session); // Session data storage (server-side MongoDB)
const mongoose = require('mongoose'); // ORM for MongoDB
const path = require('path'); // path.join
const pp = function(s){ return path.join(__dirname, s); };
const app = express();
const server = require('http').createServer(app); // or https
const config = require('./config');

// Pug template engine - previously Jade - http://jade-lang.com/
app.set('views', pp('views')); // where templates are located
app.set('view engine', 'pug'); // Express loads the module internally

// Add top-level (could be made route-specific) parsers that will populate request.body
app.use(bodyParser.urlencoded({ extended: false })); // application/x-www-form-urlencoded
app.use(bodyParser.json()); // application/json
const upload = multer({ dest: pp('uploads/') }); // Use with multipart/form-data

app.use(morgan('dev')); // Set up logger
const debug = require('./utils/debug'); // + my own logger
app.use(debug.requestInfo); // Middleware function - Order/Place of call important!
// app.use('/articles', requestInfo); // Works but messes up request URLs - /articles/id -> /id

mongoose.connect(config.MONGODB_URI); // Connect to MongoDB

// Set up secure cookie session
app.use(session({
	secret: config.APP_SECRET,
	saveUninitialized: false,
	resave: false, // keep the most recent session modification
	store: new MongoStore({ mongooseConnection: mongoose.connection })
}));

/** Set up periodic tasks */
const scheduler = require('./utils/scheduler');
// use scheduleOnce() or schedule() for one-off or repeated tasks respectively
var scheduledAlert = scheduler.schedule(10000, function() { 
	var currentTime = (new Date()).toLocaleTimeString();
	console.log("Time: " + currentTime); 
});
// scheduledAlert.cancel();

/** Route handlers */
const dbController = require('./controllers/database');
const sockets = require('./controllers/sockets');
sockets.attach(server); // attach() is Socket.IO specific
const auth = require('./controllers/auth');
auth.init(app); // Set up passport module

// Expose urls like /static/images/logo.png 
app.use('/static', express.static(pp('public'))); // first arg could be omitted

app.get('/', function(req, res) {
	req.session.shop = { items: [1,2,3] }; // set cookie - any json or string
	req.session.views += 1;
	// delete req.session.shop;
	// res.json({ user: 'john' }); // Send json response
	// res.sendFile( __dirname + "/" + "index.html" );
	// Now render .pug template with any JSON locals/variables:
	res.render('index', 
		{ title: 'Demo', data: { name: "Shop", items: [3, 5, 8] } } 
	); 
});

/** Socket.IO demo index page */
app.get('/sockets', function(req, res) {
	res.render('sockets'); 
});

app.get('/articles', dbController.list);

/** Facebook authentication - it's the same for Twitter */
app.get('/login/facebook', auth.loginFacebook);
app.get('/login/facebook/callback', auth.loginFacebookReturn, function(req, res) { 
	// Successful authentication, redirect home
	res.redirect('/');
});

app.get('/user/:name', function(req, res) { /* Path can also be a regexp */
   console.log("Got a GET request with a pattern match");
   console.log(req.requestInfo);
   res.send('Hello <strong>GET</strong>');
});

app.post('/file_upload', upload.single('avatar'), function(req, res) {
	console.log(req.file); // uploaded file info
	console.log(req.file.path + " " + req.file.filename); // where it's stored
	console.log(req.body); // text form-fields
	res.redirect('/');
});

/* Specify both GET and POST endpoint */
app.route('/debug') 
	.get(function(req, res) {
		var info = req.requestInfo;
		res.end(JSON.stringify(info, null, 2)); // specify stringify() whitespace
	})
	.post(function(req, res) {
		// Or with status: res.status(500).json({ error: 'message' });
		res.json(req.requestInfo);
	});


server.listen(config.PORT, function() {
	var host = server.address().address;
	var port = server.address().port;
	// console.log(app.get('env'));
	console.log("Server dir: " + pp('/'));
	console.log((new Date()).toLocaleTimeString() + " - Server running at http://localhost:" + port);
});