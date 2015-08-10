var MIN_TASKS_PER_BATCH = 2;

/**
 * Split an array of tasks into batches that can be run
 * simultaneously
 *
 * @param {array} tasks
 * @param {integer} maxTasksInParallel
 * @returns {array} batches (array of arrays)
 */
exports.batchify = function (tasks, maxTasksInParallel) {
    var batches = [],
        browsers = [],
        tasksPerBrowser = {},
        currentBatch,
        tasksLeft = tasks.concat(),
        i;

    // first, collect all the browsers we've got
    // and group the tasks by browser
    for (i = 0; i < tasks.length; i++) {
        if (browsers.indexOf(tasks[i].browser) === -1) {
            browsers.push(tasks[i].browser);

            tasksPerBrowser[tasks[i].browser] = [];
        }

        tasksPerBrowser[tasks[i].browser].push(tasks[i]);
    }

    // if we've got more than one browser, try to do one browser per batch
    if (browsers.length > 1 && browsers.length <= maxTasksInParallel) {
        for (i = 0; i < browsers.length; i++) {
            batches.push(tasksPerBrowser[browsers[i]]);
        }

    // else split the tasks evenly amongst all the batches we've got available
    } else {
        var tasksPerBatch = Math.max(
            MIN_TASKS_PER_BATCH,
            Math.ceil(tasks.length / maxTasksInParallel)
        );

        for (i = 0; i < maxTasksInParallel; i++) {
            if (!tasksLeft.length) {
                break;
            }

            currentBatch = [];

            while (currentBatch.length < tasksPerBatch && tasksLeft.length) {
                currentBatch.push(tasksLeft.shift());
            }

            batches.push(currentBatch);
        }
    }

    return batches;
};
