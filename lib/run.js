#!/usr/bin/env node

var screenshotTaker = require("./selenium/screenshot"),
    taskBuilder = require("./taskbuilder"),
    taskUtils = require("./taskutils"),
    cli = require("./cli"),
    Promise = require("bluebird"),
    fs = Promise.promisifyAll(require("fs")),
    gm = Promise.promisifyAll(require("gm")),
    path = require("path"),
    Handlebars = require("handlebars"),

    config = require("./config"),

    TEMPLATE_PATH = path.resolve(__dirname, "./template.handlebars"),
    SCREENSHOT_DIR = config.screenshotDir,
    OUTPUT_DIR = config.outputDir,

    shouldDiff;

createScreenshotDir().then(function () {
    // read args and check if they're correct, output usage/help if necessary
    cli.check();

    process.chdir(SCREENSHOT_DIR);

    // grab parsed options...
    var ops = cli.getOps();

    // only diff if we've got two hosts - no point in doing it
    // if there's more
    // (if it's one host, the second one is assumed to be local)
    shouldDiff = ops.diff;

    // and build a task for each screenshot
    // see taskbuilder.js for further info on what a task object contains
    taskBuilder.build(ops)
        .then(function (tasks) {
            // split all the tasks into batches to speed up processing
            var batches = taskUtils.batchify(tasks, ops.maxParallelTasks),
                message,
                parallelPromises;

            console.log("taking " + tasks.length + " screenshot"
                + (tasks.length > 1 ? "s" : "")
                + " in " + batches.length + " batch"
                + (batches.length > 1 ? "es" : ""));

            // set off all the tasks and grab promises for when they finish
            parallelPromises = batches.map(function (batch) {
                return screenshotTaker.runTasks(batch);
            });

            return Promise.all(parallelPromises);
        })
        .then(function (batches) {
            // concat all the batches into the same array again
            var tasks = [];

            batches.forEach(function (batch) {
                tasks = tasks.concat(batch);
            });

            return tasks;
        })
        .map(saveScreenshot)
        .map(cropScreenshot)
        .then(function (tasks) {
            return shouldDiff ? generateDiffs(tasks) : Promise.resolve(tasks);
        })
        .then(createPage)
        .then(function () {
            console.log("done! visit " + OUTPUT_DIR);
        })
        .catch(function (e) {
            console.error("error!", e);
        })
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
 * Save screenshot in SCREENSHOT_DIR
 *
 * @param {object} task
 * @param {int} index
 * @returns {Promise} - contains task
 */
function saveScreenshot(task, index) {
    task.imgPath = SCREENSHOT_DIR + "/" + index + ".png";
    console.log("saving screenshot at: ", task.imgPath);
    return fs.writeFileAsync(task.imgPath, task.base64Data, "base64")
        .then(function () {
            return task;
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
                reject(err);
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
        var taskA = tasks[i];
        var taskB = tasks[i + 1];

        diffPath = SCREENSHOT_DIR + "/" + i + "and" + (i + 1) + "diff.png";
        console.log("creating diff at: ", diffPath);

        var diffPromise = new Promise(function(resolve, reject) {
            gm.compare(taskA.imgPath, taskB.imgPath, {
                file: diffPath,
                highlightColor: "\"#e611f9\"",
                tolerance: 1
            }, function(err, isEqual, equality) {
                if (err) {
                    reject(err);
                    return;
                }
    
                taskA.equality = equality;
                taskB.equality = equality;
                resolve();
            });
        });

        diffPromises.push(diffPromise);
    }

    return Promise.all(diffPromises)
        .then(function () {
            return tasks;
        });
}

/**
 * Generate results page
 *
 * @param {array} tasks
 * @returns {Promise}
 */
function createPage(tasks) {
    var templateContent = fs.readFileSync(TEMPLATE_PATH, "utf8");
    var template = Handlebars.compile(templateContent);
    var data = [];

    if (shouldDiff) {
        for (var i = 0; i < tasks.length; i += 2) {
            var taskA = tasks[i];
            var taskB = tasks[i + 1];

            data.push({
                taskA: taskA,
                taskB: taskB,
                areEqual: taskB.equality < 0.001,
                equality: taskB.equality,
                taskAImage: path.basename(tasks[i].imgPath),
                taskBImage: path.basename(tasks[i + 1].imgPath),
                diffImage: i + "and" + (i + 1) + "diff.png"
            });
        }
    } else {
        for (i = 0; i < tasks.length; i++) {
            data.push({
                taskA: tasks[i],
                taskAImage: path.basename(tasks[i].imgPath)
            });
        }
    }

    return fs.writeFileAsync(SCREENSHOT_DIR + "/index.html", template({data: data}));
}
