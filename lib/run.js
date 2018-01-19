#!/usr/bin/env node


var memwatch = require('memwatch-next');
var screenshotTaker = require("./selenium/screenshot"),
    taskBuilder = require("./taskbuilder"),
    taskUtils = require("./taskutils"),
    cli = require("./cli"),
    Promise = require("bluebird"),
    childProcess = Promise.promisifyAll(require("child_process")),
    fs = Promise.promisifyAll(require("fs")),
    gm = Promise.promisifyAll(require("gm")),
    path = require("path"),
    os = require("os"),

    config = require("./config"),

    SCREENSHOT_DIR = config.screenshotDir,
    ROOT = 'https://va-terrorform2.duckduckgo.com/screenshots',
    OUTPUT_DIR = config.outputDir,

    shouldDiff;


memwatch.on('leak', function(info) { console.log(info) });

// read args and check if they're correct, output usage/help if necessary
cli.check();
var ops = cli.getOps();
SCREENSHOT_DIR += "/" + ops.commandValue;
ROOT += "/" + ops.commandValue + "/";

createScreenshotDir().then(function () {


    process.chdir(SCREENSHOT_DIR);

    // only diff if we've got two hosts - no point in doing it
    // if there's more
    // (if it's one host, the second one is assumed to be local)
    shouldDiff = true;

    // and build a task for each screenshot
    // see taskbuilder.js for further info on what a task object contains
    taskBuilder.build(ops)
        .then(function (tasks) {
            tasks.forEach(function(task, index) {
                task.imgPath = SCREENSHOT_DIR + "/" + index + ".png";
                task.index = index;
            });


            // split all the tasks into batches to speed up processing
            var batches = taskUtils.batchify(tasks, ops.maxParallelTasks),
                message,
                parallelPromises;

            console.log("taking " + tasks.length + " screenshot"
                + (tasks.length > 1 ? "s" : "")
                + " in " + batches.length + " batch"
                + (batches.length > 1 ? "es" : ""));
            
            var currentTask = 0;
            function getTask() {
                if (currentTask < tasks.length) {
                    return tasks[currentTask++];
                } else {
                    return null;
                }
            }

            // set off all the tasks and grab promises for when they finish
            parallelPromises = batches.map(function (batch, id) {
                return screenshotTaker.runTasks(getTask, id);
            });

            return Promise.all(parallelPromises).then(function() {return tasks});
        })
        .map(cropScreenshot)
        .then(function (tasks) {
            return shouldDiff ? generateDiffs(tasks) : Promise.resolve(tasks);
        })
        .then(createPage)
        .then(createCsv)
        .then(function () {
            console.log("done! visit " + OUTPUT_DIR);
        });
});

/**
 * Create SCREENSHOT_DIR if it doesn't exist
 *
 * @returns {Promise}
 */
function createScreenshotDir() {
    return fs.mkdirAsync(SCREENSHOT_DIR)
        .catch(function (err) {
            // we don't care if the folder already exists
            // throw on any other kind of error though
            if (err.code !== "EEXIST") {
                throw err;
            }
        });
}

/**
 * Crop screenshot to width/height as most browsers take
 * a screenshot of the entire page
 *
 * @param {object} task
 * @returns {Promise} - contains task
 */
function cropScreenshot(task) {
    var width, height;

    // crop to a reasonable maximum if width/height weren't specified
    // e.g. on mobile
    if (task.size) {
        width = task.size.width;
        height = task.size.height;
    } else {
        width = 1000;
        height = 700;
    }

    // there's no easy way to promisify gm.write so wrap it explicitly
    return new Promise(function (resolve, reject) {
        gm(task.imgPath)
        .crop(width, height, 0, 0)
        .write(task.imgPath, function (err) {
            if (err) {
                //console.log(err);
                resolve(task);
            } else {
                resolve(task);
            }
        });
    });
}

/**
 * Pair up tasks and create diffs from each pair
 *
 * @param {array} tasks
 * @returns {Promise} - tasks array for chaining
 */
function generateDiffs(tasks) {
    var diffPromises = [],
        diffPath = "";

    if (tasks.length % 2 !== 0) {
        return Promise.reject("can't generate diffs with an uneven number of screenshots");
    }

    for (var i = 0; i < tasks.length; i += 2) {
        diffPath = SCREENSHOT_DIR + "/" + i + "and" + (i + 1) + "diff.png";

        var promise;
        if (!tasks[i].error && !tasks[i + 1].error) {
            console.log("creating diff at: ", diffPath);
            promise = new Promise(function(resolve, reject) {
                var task1 = tasks[i];
                var task2 = tasks[i + 1];
                gm.compare(task1.imgPath, task2.imgPath, {
                    file: diffPath,
                    metric: "MAE",
                    tolerance: 0.1,
                }, function(err, isEqual, equality){
                        console.log(task1.url, isEqual, equality);
                        task1.eq = equality;
                        task2.eq = equality;
                        if (err) {
                            console.log(err);
                            resolve();
                        } else {
                            resolve();
                        }
                    });
            });
        } else {
            tasks[i].eq = tasks[i+1].eq = tasks[i].error || tasks[i+1].error;
            promise = Promise.resolve();
        }
        diffPromises.push(promise);
    }

    return Promise.all(diffPromises)
        .then(function () {
            return tasks;
        });
}

/**
 * Get human-readable info on the task to be displayed on the results page
 *
 * @param {object} task
 * @returns {string}
 */
function getTaskData(task) {
    return task.url;
}

/**
 * Generate results page
 *
 * @param {array} tasks
 * @returns {Promise}
 */
function createPage(tasks) {
    var markup = "<html>",
        i,
        diffPath;

    // make sure generated page doesn't cache
    markup += "<meta http-equiv='Cache-Control' content='no-cache, no-store, must-revalidate' />"
        + "<meta http-equiv='Pragma' content='no-cache' />"
        + "<meta http-equiv='Expires' content='0' /><body><table border='5'>";

    if (shouldDiff) {
        for (i = 0; i < tasks.length; i += 2) {
            diffPath = i + "and" + (i + 1) + "diff.png";

            markup += "<tr bgcolor=lightgray>";
            markup += "<td> Diff Value </td>";
            markup += "<td> diff image </td>";
            markup += "<td>" + getTaskData(tasks[i]) + "</td>";
            markup += "<td>" + getTaskData(tasks[i + 1]) + "</td>";
            markup += "</tr>";

            markup += "<tr>";
            markup += "<td><b>" + tasks[i].eq + "</b></td>";
            markup += "<td><img src='" + diffPath + "'></td>";
            markup += "<td><img src='" + path.basename(tasks[i].imgPath) + "'></td>";
            markup += "<td><img src='" + path.basename(tasks[i + 1].imgPath) + "'></td>";
            markup += "</tr>";
        }
    } else {
        for (i = 0; i < tasks.length; i++) {
            markup += "<tr>";
            markup += "<td><img src='" + path.basename(tasks[i].imgPath) + "'></td>";
            markup += "</tr>";

            markup += "<tr>";
            markup += "<td>" + getTaskData(tasks[i]) + "</td>";
            markup += "</tr>";
        }
    }

    markup += "</table></body></html>";

    return fs.writeFileAsync(SCREENSHOT_DIR + "/index.html", markup).then(function(){return Promise.resolve(tasks)});
}


function createCsv(tasks) {
    var lines = '';
    var diffPath;
    for (i = 0; i < tasks.length; i += 2) {
        diffPath = i + "and" + (i + 1) + "diff.png";
        lines += tasks[i].eq + ", " + getTaskData(tasks[i]) + ", " + getTaskData(tasks[i + 1]) + ", " + ROOT + diffPath + ", " + ROOT + path.basename(tasks[i].imgPath) + ", " + ROOT + path.basename(tasks[i + 1].imgPath) + "\n";
    }
    return fs.writeFileAsync(SCREENSHOT_DIR + "/summary.csv", lines);
}

