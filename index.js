var bi = require('vs-mda-remote/lib/BuildInfo'),
	bm = require('vs-mda-remote/lib/buildManager'),
	path = require('path'),
    util = require('vs-mda-remote/lib/util'),
    BuildLogger = require('vs-mda-remote/lib/BuildLogger'),
	CordovaConfig = require('vs-mda-remote/lib/CordovaConfig'),
	fs = require('fs');

var index = exports = module.exports = {};

var buildNumber = "1";
var cordovaVersion = null;
var buildCommand = "build";
var configuration = "release";
var options = "--device";
var buildDir = ".";

var buildInfo = new bi.BuildInfo(buildNumber, bi.EXTRACTED, cordovaVersion, buildCommand, configuration, options, buildDir);

var currentBuild = buildInfo;
build(buildInfo);

function build(buildInfo) {
    buildInfo.appDir = buildInfo.buildDir;
    if (!fs.existsSync(buildInfo.appDir)) {
        var msg = 'Build directory ' + buildInfo.buildDir + ' does not exist.';
        console.info(msg);
        buildInfo.updateStatus(bi.ERROR, msg);
        return;
    }

    var cordovaAppError = validateCordovaApp(buildInfo.appDir);
    if (cordovaAppError !== null) {
        buildInfo.updateStatus(bi.INVALID, cordovaAppError.id, cordovaAppError.args);
        console.info('Not building buildNumber [' + buildInfo.buildNumber + '] because it is not a valid Cordova Application: ' + JSON.stringify(cordovaAppError));
        return;
    }

    var cfg = new CordovaConfig(path.join(buildInfo.appDir, 'config.xml'));
    buildInfo.appName = cfg.name();

    console.info('Building cordova app %s at appDir %s', buildInfo.appName, buildInfo.appDir);
    buildInfo.updateStatus(bi.BUILDING);

    // Fork off to a child build process. This allows us to save off all stdout for that build to it's own log file. And in future we can 
    // have multiple builds in parallel by forking multiple child processes (with some max limit.)
    var buildProcess = require('child_process').fork(path.join(__dirname,'node_modules/vs-mda-remote/lib/build.js'), [], {silent: true});
    var buildLogger = new BuildLogger();
    buildLogger.begin(buildInfo.buildDir, 'build.log', buildProcess);
    buildProcess.send(buildInfo);
    buildProcess.on('message', function(resultBuildInfo) {
        buildInfo.updateStatus(resultBuildInfo.status, resultBuildInfo.messageId, resultBuildInfo.messageArgs);
        console.info('Done building %d : %s %s', buildInfo.buildNumber, buildInfo.status, buildInfo.messageId, buildInfo.messageArgs);
        buildProcess.kill();
        buildLogger.end();
    });
    buildProcess.on('exit', function (exitCode) {
        if (buildInfo.status === bi.BUILDING) {
            buildInfo.updateStatus(bi.ERROR, 'BuildFailedWithError', 'Build process unexpectedly exited');
            buildLogger.end();
        }
    });
}


// This is basic validation. The build itself will fail if config.xml is not valid, or more detailed problems with the submission.
function validateCordovaApp(appDir) {
    if (!fs.existsSync(path.join(appDir, 'config.xml'))) {
        return {id: 'InvalidCordovaAppMissingConfigXml'};
    } else {
        try {
            var cfg = new CordovaConfig(path.join(currentBuild.appDir, 'config.xml'));
            var appName = cfg.name();
            if (!util.isValidCordovaAppName(appName)) {
                return {id: 'InvalidCordovaAppUnsupportedAppName', args: [appName, util.invalidAppNameCharacters()]};
                errors.push('Invalid iOS app name ' + appName + ' in config.xml. Check for characters that are not Printable ASCII, or that match any of the following characters: ' +
                                util.invalidAppNameCharacters());
            }
            // TODO validate that start page exists (content src='index.html')
        } catch (e) {
            return {id: 'InvalidCordovaAppBadConfigXml', args: e.message};
        }
    }

    if (!fs.existsSync(path.join(appDir, 'www'))) {
        return {id: 'InvalidCordovaAppMissingWww'};
    }

    return null;
}
