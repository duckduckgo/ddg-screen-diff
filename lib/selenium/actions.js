/**
 * Actions are simple steps to take before taking
 * a screenshot. They look like this:
 *
 * {
 *     action: "mouseMove",
 *     target: "#selector"
 * }
 *
 * The list of currently supported actions is in the array below.
 *
 * `target` can either be a CSS selector or an object with x/y coordinates
 */

var By = require("selenium-webdriver").By,

    SUPPORTED_ACTIONS = [
        "click",
        "mouseDown",
        "mouseUp",
        "mouseMove"
    ];

exports.run = function (driver, actions) {
    var actionSequence = driver.actions(),
        target;

    actions.forEach(function (item) {
        console.log("running action: ", JSON.stringify(item));

        if (SUPPORTED_ACTIONS.indexOf(item.action) === -1) {
            throw new Error("unsupported action: " + item.action);
        }

        // if the target is a string, assume it's a CSS selector
        // so grab a target promise
        if (typeof item.target === "string") {
            target = driver.findElement(By.css(item.target));
        // else it might be coordinates
        } else if (typeof item.target === "object" &&
                typeof item.target.x === "number" &&
                typeof item.target.y === "number") {
            target = item.target;
        // unsupported otherwise, throw
        } else {
            throw new Error("unsupported target: " + item.target);
        }

        actionSequence[item.action](target);
    });

    actionSequence.perform();
};
