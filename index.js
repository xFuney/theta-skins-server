'use strict';

// ActionMC legacy skins server.
// Virtue 2021

const path = require('path');
const fs = require('fs');
const request = require('sync-request');
const fetch = require('node-fetch');
var session = require('express-session');
const fileUpload = require('express-fileupload');
var sizeOf = require('image-size');

function downloadFileSync(url) {
    return require('child_process')
      .execFileSync('curl', ['--silent', '-L', url]); // remove options {encoding: 'utf8'}
}

// Variables.

// This is where the server stores caches of Mojang requests.
const Skin_CacheLocation = path.join(__dirname, "s_cache");
const Cape_CacheLocation = path.join(__dirname, "c_cache");

// This defines the amount of time an item should be cached for.
const Skin_CacheTime = 24; // 24 hours by default.
const Cape_CacheTime = 48; // 48 hours by default (capes don't change as much)

// This is where the server stores overrides - if a user has an entry in
// these folders, their Mojang request will be overriden with the contents
// of the file present in the override location.
const Skin_OverrideLocation = path.join(__dirname, "s_override");
const Cape_OverrideLocation = path.join(__dirname, "c_override");

// This is where the resource.xml file is stored - this tells a client
// where to find certain resources - may fix some sounds in-game.
const Resources_XML_Location = path.join(__dirname, "resources.xml")

// This is where the server stores default skins - if a user has no
// skin, their Mojang request will be overridden with the contents
// of the default file.

const Skin_DefaultFile = path.join(__dirname, 'defaults', 'default_skin.png')
const Cape_DefaultFile = path.join(__dirname, 'defaults', 'default_cape.png')

// This is where the information for the Java poll is stored. This
// must be a JSON file.

const Java_JSON = path.join(__dirname, "java.json");

// This is where the base Linux install script is stored. This must
// be a Bash file.

const LinuxInstall_Bash = path.join(__dirname, "install.bash");
const GeneratedInstall_Location = path.join(__dirname, "static", "install-linux")

// ACTUAL CODE BEYOND THIS POINT \\

// Initialise variables
// Time until cache clear for stats api.
var Skin_CacheWipeTime = Date.now() + (3600000 * Skin_CacheTime);
var Cape_CacheWipeTime = Date.now() + (3600000 * Cape_CacheTime);

// Actual distance between cache clear.
var Skin_CacheWipeDis = 3600000 * Skin_CacheTime;
var Cape_CacheWipeDis = 3600000 * Cape_CacheTime;

// Previous.

var Skin_PreviousCacheWipeTime = Date.now();
var Cape_PreviousCacheWipeTime = Date.now();

// Do pre-initialisation folder checks.
if (!fs.existsSync(Skin_CacheLocation)) {
    console.log('[WARN] Skin cache directory does not exist, creating...');
    try {
        fs.mkdirSync(Skin_CacheLocation);
        console.log('[INFO] Skin cache directory created successfully.')
    } catch (exc) {
        console.log(exc)
        console.log('[ERR] Failure creating skin cache directory.')
        process.exit(1);
    }
}

if (!fs.existsSync(Cape_CacheLocation)) {
    console.log('[WARN] Cape cache directory does not exist, creating...');
    try {
        fs.mkdirSync(Cape_CacheLocation);
        console.log('[INFO] Cape cache directory created successfully.')
    } catch (exc) {
        console.log(exc)
        console.log('[ERR] Failure creating Cape cache directory.')
        process.exit(1);
    }
}

if (!fs.existsSync(Skin_OverrideLocation)) {
    console.log('[WARN] Skin override directory does not exist, creating...');
    try {
        fs.mkdirSync(Skin_OverrideLocation);
        console.log('[INFO] Skin override directory created successfully.')
    } catch (exc) {
        console.log(exc)
        console.log('[ERR] Failure creating skin override directory.')
        process.exit(1);
    }
}

if (!fs.existsSync(Cape_OverrideLocation)) {
    console.log('[WARN] Cape override directory does not exist, creating...');
    try {
        fs.mkdirSync(Cape_OverrideLocation);
        console.log('[INFO] Cape override directory created successfully.')
    } catch {
        console.log('[ERR] Failure creating cape override directory.')
        process.exit(1);
    }
}

if (!fs.existsSync(Resources_XML_Location)) {
    console.log('[WARN] Resources XML does not exist. Obtaining...');
    try {
        let dl = downloadFileSync('http://s3.amazonaws.com/MinecraftResources');
        fs.writeFileSync(Resources_XML_Location, dl);
        console.log('[INFO] Resources XML created successfully!')
    } catch {
        console.log('[ERR] Failure creating resources XML.');
        process.exit(1);
    }
}

// Initialise install script.
if (fs.existsSync(LinuxInstall_Bash)) {
    console.log('[INFO] Generating Linux install script...')
    let file = fs.readFileSync(LinuxInstall_Bash, {encoding: 'utf8'});
    let sip = downloadFileSync('ifconfig.co/ip').toString().replace(/(\r\n|\n|\r)/gm, "");;
    let new_file = file.replace('%%IP%%', sip)
    try {
        // try to save
        fs.writeFileSync(GeneratedInstall_Location, new_file);
        console.log('[INFO] Linux installer generated successfully!')
    } catch {
        console.log('[ERR] Failed to create linux installer.');
        process.exit(1);
    }
}
// Initialise functions.

// add_to_java_poll
// Purpose: Adds a new entry into the Java version data.
// Returns: nothing.

function add_to_java_poll(java_useragent) {
    var tmp_json;

    if (fs.existsSync(Java_JSON)) {
        tmp_json = require(Java_JSON);
    } else {
        tmp_json = {};
    }
    
    if (tmp_json[java_useragent]) {
        tmp_json[java_useragent] += 1;
    } else {
        tmp_json[java_useragent] = 1;
    }
    
    try {
        fs.writeFileSync(Java_JSON, JSON.stringify(tmp_json));
    } catch (exc) {
        // oh poop.
    }
}

// get_uuid
// Purpose: Gets a UUID of a player.
// Returns: UUID of player if they exist, false if error occured.

function get_uuid(username) {
    let reqBody = '["' + username + '"]';
    let req = request('POST', 'https://api.mojang.com/profiles/minecraft', {body: reqBody});

    // Have response now.
    let response = JSON.parse(req.getBody('utf8'));
    if (response.error) {
        // error obtaining user.
        return false;
    }

    // we have the user, get their UUID.
    return response[0]["id"];
}

// check_cache_override
// Purpose: Checks the cache and override directories for the user.
// Returns: 0 for not cached, 1 for cached and 2 for override.

function check_cache_override(type, name) {
    // type can either be skin or cape.
    if (type == "skin") {
        if (fs.existsSync(path.join(Skin_OverrideLocation, name + '.png'))) {
            // user has an entry in the override location.
            return 2;
        }
    
        if (fs.existsSync(path.join(Skin_CacheLocation, name + '.png'))) {
            // user has an entry in the cache location.
            return 1;
        }
    
        // if execution of subroutine continues, no cache entry exists.
        return 0;
    } else if (type == "cape") {
        if (fs.existsSync(path.join(Cape_OverrideLocation, name + '.png'))) {
            // user has an entry in the override location.
            return 2;
        }
    
        if (fs.existsSync(path.join(Cape_CacheLocation, name + '.png'))) {
            // user has an entry in the cache location.
            return 1;
        }
    
        // if execution of subroutine continues, no cache entry exists.
        return 0;
    }
}

// get_skin_from_mojang
// Purpose: Get a skin from Mojang.
// Returns: true if skin obtained, false if skin failed.

function get_skin_from_mojang(uuid, name) {
    let req = request('GET', 'https://sessionserver.mojang.com/session/minecraft/profile/' + uuid);

    // have response now.
    let response = JSON.parse(req.getBody('utf8'));

    if (response.error) {
        // error obtaining profile.
        return false;
    }

    // now parse for the base64 encoded json.
    let b64json = response["properties"][0]["value"];
    let b64buffer = new Buffer(b64json, 'base64');
    b64json = b64buffer.toString('ascii');
    b64json = JSON.parse(b64json);

    // now we have a download link.
    let download_url = b64json["textures"]["SKIN"]['url'];
    let skin_file = downloadFileSync(download_url);
    
    

    // write to file.
    try {
        let write_time = Date.now();
        let writing = fs.writeFileSync(path.join(Skin_CacheLocation, name + '.png'), skin_file);

        return true;
    } catch (exc) {
        console.error(exc);
        return false;
    }
    
}

// get_cape_from_mojang
// Purpose: Get a cape from Mojang.
// Returns: true if cape obtained, false if cape failed.

function get_cape_from_mojang(uuid, name) {
    let req = request('GET', 'https://sessionserver.mojang.com/session/minecraft/profile/' + uuid);

    // have response now.
    let response = JSON.parse(req.getBody('utf8'));

    if (response.error) {
        // error obtaining profile.
        return false;
    }

    // now parse for the base64 encoded json.
    let b64json = response["properties"][0]["value"];
    let b64buffer = new Buffer(b64json, 'base64');
    b64json = b64buffer.toString('ascii');
    b64json = JSON.parse(b64json);

    // now we have a download link.
    let download_url = b64json["textures"]["CAPE"]['url'];
    let skin_file = downloadFileSync(download_url);
    
    

    // write to file.
    try {
        let write_time = Date.now();
        let writing = fs.writeFileSync(path.join(Cape_CacheLocation, name + ".png"), skin_file);

        return true;
    } catch (exc) {
        console.error(exc);
        return false;
    }
    
}

// get_skin
// Purpose: Get the skin location of the user to serve.
// Returns: location to skin file if exists, location to default skin if not.

function get_skin(uname) {
    let cache = check_cache_override('skin', uname);

    if (cache == 1) {
        // present in cache - serve user from there
        return path.join(Skin_CacheLocation, uname + '.png')
    } else if (cache == 2) {
        // present in OVERRIDE - serve user from there.
        return path.join(Skin_OverrideLocation, uname + '.png')
    } else {
        // presume user does not exist in cache. try to fetch beforehand though.
        try {
            // get uuid
            let uuid = get_uuid(uname);
            // get skin from mojang.
            let skin_get = get_skin_from_mojang(uuid, uname);
            if (!skin_get) {
                // failed. return default skin path.
                return Skin_DefaultFile;
            } else {
                // user is now in cache.
                return path.join(Skin_CacheLocation, uname + '.png')
            }
        } catch {
            // error occured somewhere.
            return Skin_DefaultFile;
        }
    }
}

// get_cape
// Purpose: Get the cape location of the user to serve.
// Returns: location to cape file if exists, location to default cape if not.

function get_cape(uname) {
    let cache = check_cache_override('cape', uname);

    if (cache == 1) {
        // present in cache - serve user from there
        return path.join(Cape_CacheLocation, uname + '.png')
    } else if (cache == 2) {
        // present in OVERRIDE - serve user from there.
        return path.join(Cape_OverrideLocation, uname + '.png')
    } else {
        // presume user does not exist in cache. try to fetch beforehand though.
        try {
            // get uuid
            let uuid = get_uuid(uname);
            // get skin from mojang.
            let skin_get = get_cape_from_mojang(uuid, uname);
            if (!skin_get) {
                // failed. return default skin path.
                return Cape_DefaultFile;
            } else {
                // user is now in cache.
                return path.join(Cape_CacheLocation, uname + '.png')
            }
        } catch {
            // error occured somewhere.
            return Cape_DefaultFile;
        }
    }
}

// oauth_to_uuid
// Purpose: Uses mc-oauth.net to translate an OAuth code into a UUID.
// Returns: Nothing - this is a callback based function.

function oAuthToUUID(token, cb) {
    return fetch('https://mc-oauth.net/api/api?token', {
       method: "GET",
       headers: {
          "token": token
       }
    }).then(response => {
       return response.json();
    }).then(json => {
       cb(json);
    });
}

// rm_dir
// Purpose: removes all files in a directory.
// Returns: nothing.

function rm_dir(dirPath) {
    try { var files = fs.readdirSync(dirPath); }
    catch(e) { return; }
    if (files.length > 0)
      for (var i = 0; i < files.length; i++) {
        var filePath = dirPath + '/' + files[i];
        if (fs.statSync(filePath).isFile())
          fs.unlinkSync(filePath);
        else
          rmDir(filePath);
      }
  };

// Initialise cache-wiping functions.

// Skin.
setInterval(() => {
    console.log('[CACHE] Wiping skins cache...');
    rm_dir(Skin_CacheLocation);
    Skin_PreviousCacheWipeTime = Skin_CacheWipeTime
    Skin_CacheWipeTime = Date.now() + (3600000 * Skin_CacheTime);
    console.log('[CACHE] Skin cache wipe completed.');
}, Skin_CacheWipeDis)

// Cape.
setInterval(() => {
    console.log('[CACHE] Wiping capes cache...');
    rm_dir(Cape_CacheLocation);
    Cape_PreviousCacheWipeTime = Cape_CacheWipeTime
    Cape_CacheWipeTime = Date.now() + (3600000 * Cape_CacheTime);
    console.log('[CACHE] Cape cache wipe completed.');
}, Cape_CacheWipeDis)

// Do server initial cache wipe.
console.log('[CACHE] Server startup - wiping skin cache...');
rm_dir(Skin_CacheLocation);
console.log('[CACHE] Skin cache wipe completed.');
console.log('[CACHE] Server startup - wiping cape cache...');
rm_dir(Cape_CacheLocation);
console.log('[CACHE] Cape cache wipe completed.')

// Initialise express.
const express = require('express');
const { O_TRUNC } = require('constants');
const { resourceUsage } = require('process');
const app = express()
const port = process.env.NODE_PORT || 6481

// Initialise session cookie middleware.
app.set('trust proxy', 1) // trust first proxy
app.use(session({
  secret: process.env.COOKIE_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 7200000 }
}))

// Initialise static folders.
app.use(express.static('static'))
app.use('/MinecraftResources', express.static('resources'))

// Initialise middleware.
app.use(express.urlencoded());

app.use(fileUpload());

// Initialise routers.

// POST /authenticate
// Parameters:
//   code: OAuth code from MC-OAuth.
// Returns:
//   301 redirect to appropriate page.

app.post('/authenticate', (req,res) => {
    oAuthToUUID(req.body.code, (response) => {
        if (response.status !== "fail") {
            // add to session
            req.session.username = response.username
            req.session.uuid = response.uuid

            // redirect
            res.redirect('/skin_landing')
        } else {
            // throw back to auth page.
            res.redirect('/auth.html')
        }
    })
})

// GET /end_session
// No parameters.
// Returns:
//   redirect to home page with user session expired.

app.get('/end_session', (req,res) => {
    req.session.regenerate(function(err) {
        // will have a new session here
        res.redirect('/')
    })
})

// GET /skin_landing
// No parameters.
// Returns:
//   landing page

app.get('/skin_landing', (req,res) => {
    if (req.session.username !== undefined) {
        let temp = fs.readFileSync(path.join(__dirname, 'templates', 'landing.html')).toString();
        temp = temp.replace('%%USERNAME%%', req.session.username)
        temp = temp.replace('%%USERNAME%%', req.session.username)
        temp = temp.replace('%%USERNAME%%', req.session.username)
        temp = temp.replace('%%USERNAME%%', req.session.username)
        temp = temp.replace('%%USERNAME%%', req.session.username)
        temp = temp.replace('%%USERNAME%%', req.session.username)
        res.send(temp)
    } else {
        res.redirect('/')
    }
})

// GET /skin_change
// No parameters
// Returns:
//   skin changing page

app.get('/skin_change', (req,res) => {
    if (req.session.username !== undefined) {
        let temp = fs.readFileSync(path.join(__dirname, 'templates', 'skin_change.html')).toString();
        temp = temp.replace('%%USERNAME%%', req.session.username)
        res.send(temp)
    } else {
        res.redirect('/')
    }
})

// POST /upload_skin
// No parameters.
// Returns:
//   success or fail page

app.post('/upload_skin', (req,res) => {
    if (req.session.username == undefined) {
        // Don't even look at it.
        return res.redirect('/')
    }

    if (!req.files || Object.keys(req.files).length === 0) {
        return res.redirect('/skin_change');
      }

      if (req.files.upload.mimetype != "image/png") {
        return res.redirect('/skin_change');
      }
    
      // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
      let sampleFile = req.files.upload;
    
      // Use the mv() method to place the file somewhere on your server
      sampleFile.mv(path.join(Skin_OverrideLocation, req.session.username + '.png'), function(err) {
        if (err) {
          return res.redirect('/failure');
        }
        
        var dimensions = sizeOf(path.join(Skin_OverrideLocation, req.session.username + '.png'));

        if (dimensions.width == "64" && dimensions.height == "32") {
            // classic steve skin
            res.redirect('/success');
        } else if (dimensions.width == "64" && dimensions.height == "64") {
            // non-classic skins (alex or something)
            res.redirect('/success')
        } else {
            // user must be trying to test us.
            fs.unlinkSync(path.join(Skin_OverrideLocation, req.session.username + '.png'))
            res.sendFile(path.join(__dirname, 'templates', 'size_too_big.html'))
        }
    
      });
})

// GET /cape_change
// No parameters
// Returns:
//   cape changing page

app.get('/cape_change', (req,res) => {
    if (req.session.username !== undefined) {
        let temp = fs.readFileSync(path.join(__dirname, 'templates', 'cape_change.html')).toString();
        temp = temp.replace('%%USERNAME%%', req.session.username)
        res.send(temp)
    } else {
        res.redirect('/')
    }
})

// POST /upload_cape
// No parameters.
// Returns:
//   success or fail page

app.post('/upload_cape', (req,res) => {
    if (req.session.username == undefined) {
        // Don't even look at it.
        return res.redirect('/')
    }

    if (!req.files || Object.keys(req.files).length === 0) {
        return res.redirect('/cape_change');
      }

      if (req.files.upload.mimetype != "image/png") {
        return res.redirect('/cape_change');
      }
    
      // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
      let sampleFile = req.files.upload;
    
      // Use the mv() method to place the file somewhere on your server
      sampleFile.mv(path.join(Cape_OverrideLocation, req.session.username + '.png'), function(err) {
        if (err) {
          return res.redirect('/failure');
        }

        var dimensions = sizeOf(path.join(Cape_OverrideLocation, req.session.username + '.png'));

        if (dimensions.width == "64" && dimensions.height == "32") {
            // cape, GOOD
            res.redirect('/success');
        } else {
            // user must be trying to test us.
            fs.unlinkSync(path.join(Cape_OverrideLocation, req.session.username + '.png'))
            res.sendFile(path.join(__dirname, 'templates', 'size_too_big.html'))
        }
      });
})

// GET /success
// No parameters.
// Returns:
//   success page

app.get('/success', (req,res) => {
    if (req.session.username !== undefined) {
        let temp = fs.readFileSync(path.join(__dirname, 'templates', 'success.html')).toString();
        temp = temp.replace('%%USERNAME%%', req.session.username)
        res.send(temp)
    } else {
        res.redirect('/')
    }
})

// GET /failure
// No parameters.
// Returns:
//   failure page

app.get('/failure', (req,res) => {
    if (req.session.username !== undefined) {
        let temp = fs.readFileSync(path.join(__dirname, 'templates', 'failure.html')).toString();
        temp = temp.replace('%%USERNAME%%', req.session.username)
        res.send(temp)
    } else {
        res.redirect('/')
    }
})

// GET /MinecraftSkins/:username
// Paramters:
//   username: username of character to get skin for
// Returns:
//   skin.png

app.get('/MinecraftSkins/:username', async (req,res) => {
    let parsed_username = req.params.username.slice(0,-4);
    console.log('[GET] Cape: ' + parsed_username);
    console.log(parsed_username)
    let location = get_skin(parsed_username);
    res.sendFile(location);
})

// GET /MinecraftCloaks/:username
// Paramters:
//   username: username of character to get cape for
// Returns:
//   cape.png

app.get('/MinecraftCloaks/:username', async (req,res) => {
    let parsed_username = req.params.username.slice(0,-4);
    console.log('[GET] Cloak: ' + parsed_username);
    let location = get_cape(parsed_username);
    res.sendFile(location);
})

// GET /statistics
// No parameters.
// Returns:
//    - information from the stats API but neater and user-friendly.

app.get('/statistics', async (req,res) => {
    let skin_cacheCount = fs.readdirSync(Skin_CacheLocation).length;
    let skin_overrideCount = fs.readdirSync(Skin_OverrideLocation).length;
    let cape_cacheCount = fs.readdirSync(Cape_CacheLocation).length;
    let cape_overrideCount = fs.readdirSync(Cape_OverrideLocation).length;

    let skin_wipeTime = new Date(Skin_CacheWipeTime);
    let skin_prevWipeTime = new Date(Skin_PreviousCacheWipeTime);
    let cape_wipeTime = new Date(Cape_CacheWipeTime);
    let cape_prevWipeTime = new Date(Cape_PreviousCacheWipeTime);
    let result = `<h1>Statistics</h1>
    <h4>Skins</h4>
    <p>Skins currently cached: ${skin_cacheCount}</p>
    <p>Skins currently overriden: ${skin_overrideCount}</p>
    <p>Time of next skin cache wipe: ${skin_wipeTime.toUTCString()}</p>
    <p>Time of previous skin cache wipe: ${skin_prevWipeTime.toUTCString()}</p>
    <h4>Capes</h4>
    <p>Capes currently cached: ${cape_cacheCount}</p>
    <p>Capes currently overridden: ${cape_overrideCount}</p>
    <p>Time of next cape cache wipe: ${cape_wipeTime.toUTCString()}</p>
    <p>Time of previous cape cache wipe: ${cape_prevWipeTime.toUTCString()}</p><hr />
    <p><i>For Java statistics, see <a href="/statistics/java">the Java statistics page</a>.</i></p>`

    res.send(result)
    
})

// GET /statistics/java
// No parameters
// Returns:
//    - Java version info from the stats API but neater and user-friendly.

app.get('/statistics/java', async (req,res) => {
    let result = '<h1>Versions of Java that have used this skin server:</h1>'
    var javajson;
    if (fs.existsSync(Java_JSON)) {
        javajson = require(Java_JSON)
    } else {
        javajson = {}
    }
    for (const i in javajson) {
        result += `<p><strong>${i}:</strong> ${javajson[i]}</p>`
    }
    result += '<hr /><p><i>To see other statistics, see <a href="/statistics">the main statistics page</a>.</i></p>'
    res.send(result)
})

// GET /statistics/api/java
// No parameters.
// Returns:
//    - Java versions that have "phoned home" on MC client startup.

app.get('/statistics/api/java', async (req,res) => {
    var javajson;
    if (fs.existsSync(Java_JSON)) {
        javajson = require(Java_JSON)
    } else {
        javajson = {}
    }

    res.json(javajson)
});



// GET /statistics/api/skins
// No parameteers
// Returns:
//    - amount of skins cached
//    - amount of skins with overrides
//    - epoch timestamp of cache wipe time
//    - epoch timestamp of previous cache wipe time

app.get('/statistics/api/skins', async (req,res) => {
    let skin_CacheCount = fs.readdirSync(Skin_CacheLocation).length;
    let skin_OverrideCount = fs.readdirSync(Skin_OverrideLocation).length;
    res.contentType('application/json')
    res.json({cached: skin_CacheCount, overridden: skin_OverrideCount, cache_wipe_time: Skin_CacheWipeTime, previous_cache_wipe_time: Skin_PreviousCacheWipeTime});    
})

// GET /statistics/api/capes
// No parameteers
// Returns:
//    - amount of capes cached
//    - amount of capes with overrides
//    - epoch timestamp of cache wipe time
//    - epoch timestamp of previous cache wipe time

app.get('/statistics/api/capes', async (req,res) => {
    let skin_CacheCount = fs.readdirSync(Cape_CacheLocation).length;
    let skin_OverrideCount = fs.readdirSync(Cape_OverrideLocation).length;
    res.contentType('application/json')
    res.json({cached: skin_CacheCount, overridden: skin_OverrideCount, cache_wipe_time: Cape_CacheWipeTime, previous_cache_wipe_time: Cape_PreviousCacheWipeTime});    
})

// GET /MinecraftResources
// No parameters
// Returns:
//    - XML file containing location of resources.
// This can be also used to track amount of clients using skin server,
// but this shouldn't be relied upon.

// Client can be tracked by User Agent.
// If the first four characters of their user agent are "Java", then
// it is likely that they are a MC client.

app.get('/MinecraftResources', async (req,res) => {
    if (req.headers['user-agent'].slice(0,4) == "Java") {
        console.log('[INFO] New client made connection to server!');
        add_to_java_poll(req.headers['user-agent']);
    }
    res.sendFile(Resources_XML_Location);
})

// Listen on defined port.
app.listen(port, () => {
  console.log(`[HTTP] ActionMC skin server listening on port ${port}.`)
})

// EOF