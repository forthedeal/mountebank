'use strict';

var spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    os = require('os'),
    port = process.env.MB_PORT || 2525,
    mbPath = process.env.MB_EXECUTABLE || 'dist/mountebank/bin/mb',
    pidfile = 'mb-grunt.pid';

function isWindows () {
    return os.platform().indexOf('win') === 0;
}

function start (done) {
    var mbArgs = ['restart', '--port', port, '--pidfile', 'mb-grunt.pid', '--allowInjection', '--mock', '--debug'],
        mb;

    if (isWindows) {
        mbArgs.unshift(mbPath);
        mb = spawn('node', mbArgs);
    }
    else {
        mb = spawn(mbPath, mbArgs);
    }

    mb.on('error', function (error) {
        throw error;
    });
    mb.stderr.on('data', function (data) {
        console.error(data.toString('utf8'));
        done();
    });
    mb.stdout.on('data', function (data) {
        // Looking for "mountebank va.b.c (node vx.y.z) now taking orders..."
        if (data.toString('utf8').indexOf('now taking orders') > 0) {
            done();
        }
    });
}

function stop (done) {
    exec(mbPath + ' stop --pidfile ' + pidfile, function () { done(); });
}

module.exports = function (grunt) {
    grunt.registerTask('mb', 'start or stop mountebank', function (command) {
        command = command || 'start';
        if (['start', 'stop'].indexOf(command) === -1) {
            throw 'mb: the only targets are start and stop';
        }

        if (command === 'start') {
            start();
        }
        else {
            stop();
        }
    });
};
