var MIN_TASKS_PER_BATCH = 2;

/**
 * Split an array of tasks based on maximum number of batches for this list of tasks
 *
 * @param {array} tasks
 * @param {integer} maxBatches
 * @returns {array} batches (array of arrays)
 */
function splitIntoBatches(tasks, maxBatches) {
    var currentBatch,
        batches = [],
        tasksPerBatch = Math.max(
            MIN_TASKS_PER_BATCH,
            Math.ceil(tasks.length / maxBatches)
        );

    // create clone of tasks array so we don't edit it
    tasks = tasks.concat();

    for (var i = 0; i < maxBatches; i++) {
        if (!tasks.length) {
            break;
        }

        currentBatch = [];

        while (currentBatch.length < tasksPerBatch && tasks.length) {
            currentBatch.push(tasks.shift());
        }

        batches.push(currentBatch);
    }

    return batches;
}

/**
 * Split an array of tasks into batches that can be run
 * simultaneously
 *
 * @param {array} tasks
 * @param {integer} maxParallelTasks
 * @returns {array} batches (array of arrays)
 */
exports.batchify = function (tasks, maxParallelTasks) {
    var batches,
        browsers = [],
        tasksPerBrowser = {};

    tasks.forEach(function (task, index) {
        task.index = index;
    });

    // first, collect all the browsers we've got
    // and group the tasks by browser
    for (var i = 0; i < tasks.length; i++) {
        if (browsers.indexOf(tasks[i].browser) === -1) {
            browsers.push(tasks[i].browser);

            tasksPerBrowser[tasks[i].browser] = [];
        }

        tasksPerBrowser[tasks[i].browser].push(tasks[i]);
    }

    // if we've got more than one browser, try to do one browser per batch
    if (browsers.length > 1 && browsers.length <= maxParallelTasks) {
        batches = [];

        var maxBatchesPerBrowser = Math.floor(maxParallelTasks / browsers.length),
            tasksLeft;

        for (i = 0; i < browsers.length; i++) {
            tasksLeft = tasksPerBrowser[browsers[i]];

            batches = batches.concat(splitIntoBatches(tasksLeft, maxBatchesPerBrowser));
        }

    // else split the tasks evenly amongst all the batches we've got available
    } else {
        batches = splitIntoBatches(tasks, maxParallelTasks);
    }

    return batches;
};
